import { describe, it, expect } from 'vitest';
import {
  validatePlacement,
  checkNodeResourcesFit,
  checkMatchNodeSelector,
  checkTaintToleration,
  checkPodAffinity,
  getValidNodes,
} from './validator';
import type { GamePod, GameNode } from './types';

function makeNode(overrides: Partial<GameNode> = {}): GameNode {
  return {
    name: 'worker-1',
    labels: { 'kubernetes.io/hostname': 'worker-1' },
    capacity: { cpu: 4000, memory: 8192 },
    allocated: { cpu: 0, memory: 0 },
    pods: [],
    ...overrides,
  };
}

function makePod(overrides: Partial<GamePod> = {}): GamePod {
  return {
    name: 'test-pod',
    labels: { app: 'test' },
    resources: { cpu: 500, memory: 512 },
    ...overrides,
  };
}

describe('checkNodeResourcesFit', () => {
  it('allows pod when resources are available', () => {
    const result = checkNodeResourcesFit(makePod(), makeNode());
    expect(result.valid).toBe(true);
  });

  it('rejects when CPU is insufficient', () => {
    const node = makeNode({ allocated: { cpu: 3800, memory: 0 } });
    const pod = makePod({ resources: { cpu: 500, memory: 256 } });
    const result = checkNodeResourcesFit(pod, node);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('NodeResourcesFit');
    expect(result.details).toContain('CPU');
  });

  it('rejects when memory is insufficient', () => {
    const node = makeNode({ allocated: { cpu: 0, memory: 8000 } });
    const pod = makePod({ resources: { cpu: 100, memory: 512 } });
    const result = checkNodeResourcesFit(pod, node);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('NodeResourcesFit');
    expect(result.details).toContain('memory');
  });

  it('allows exact fit', () => {
    const node = makeNode({ capacity: { cpu: 1000, memory: 1024 }, allocated: { cpu: 500, memory: 512 } });
    const pod = makePod({ resources: { cpu: 500, memory: 512 } });
    const result = checkNodeResourcesFit(pod, node);
    expect(result.valid).toBe(true);
  });
});

describe('checkMatchNodeSelector', () => {
  it('passes when no nodeSelector', () => {
    const result = checkMatchNodeSelector(makePod(), makeNode());
    expect(result.valid).toBe(true);
  });

  it('passes when labels match', () => {
    const node = makeNode({ labels: { zone: 'us-east-1a', type: 'gpu' } });
    const pod = makePod({ nodeSelector: { zone: 'us-east-1a' } });
    const result = checkMatchNodeSelector(pod, node);
    expect(result.valid).toBe(true);
  });

  it('rejects when label is missing', () => {
    const pod = makePod({ nodeSelector: { zone: 'us-east-1a' } });
    const result = checkMatchNodeSelector(pod, makeNode());
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('MatchNodeSelector');
  });

  it('rejects when label value differs', () => {
    const node = makeNode({ labels: { zone: 'us-west-2a' } });
    const pod = makePod({ nodeSelector: { zone: 'us-east-1a' } });
    const result = checkMatchNodeSelector(pod, node);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('MatchNodeSelector');
  });
});

describe('checkTaintToleration', () => {
  it('passes when node has no taints', () => {
    const result = checkTaintToleration(makePod(), makeNode());
    expect(result.valid).toBe(true);
  });

  it('rejects when taint is not tolerated', () => {
    const node = makeNode({
      taints: [{ key: 'dedicated', value: 'gpu', effect: 'NoSchedule' }],
    });
    const result = checkTaintToleration(makePod(), node);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('TaintToleration');
  });

  it('passes when taint is tolerated with Equal operator', () => {
    const node = makeNode({
      taints: [{ key: 'dedicated', value: 'gpu', effect: 'NoSchedule' }],
    });
    const pod = makePod({
      tolerations: [{ key: 'dedicated', operator: 'Equal', value: 'gpu', effect: 'NoSchedule' }],
    });
    const result = checkTaintToleration(pod, node);
    expect(result.valid).toBe(true);
  });

  it('passes when taint is tolerated with Exists operator', () => {
    const node = makeNode({
      taints: [{ key: 'dedicated', value: 'gpu', effect: 'NoSchedule' }],
    });
    const pod = makePod({
      tolerations: [{ key: 'dedicated', operator: 'Exists', effect: 'NoSchedule' }],
    });
    const result = checkTaintToleration(pod, node);
    expect(result.valid).toBe(true);
  });

  it('rejects when toleration effect differs', () => {
    const node = makeNode({
      taints: [{ key: 'dedicated', value: 'gpu', effect: 'NoSchedule' }],
    });
    const pod = makePod({
      tolerations: [{ key: 'dedicated', operator: 'Equal', value: 'gpu', effect: 'NoExecute' }],
    });
    const result = checkTaintToleration(pod, node);
    expect(result.valid).toBe(false);
  });
});

describe('checkPodAffinity', () => {
  it('passes when no affinity rules', () => {
    const result = checkPodAffinity(makePod(), makeNode(), [makeNode()]);
    expect(result.valid).toBe(true);
  });

  it('passes when anti-affinity has no conflicts', () => {
    const pod = makePod({
      affinity: {
        podAntiAffinity: {
          requiredDuringSchedulingIgnoredDuringExecution: [
            { labelSelector: { app: 'web' }, topologyKey: 'kubernetes.io/hostname' },
          ],
        },
      },
    });
    const node = makeNode({ pods: [makePod({ labels: { app: 'api' } })] });
    const result = checkPodAffinity(pod, node, [node]);
    expect(result.valid).toBe(true);
  });

  it('rejects when anti-affinity has a conflict', () => {
    const pod = makePod({
      affinity: {
        podAntiAffinity: {
          requiredDuringSchedulingIgnoredDuringExecution: [
            { labelSelector: { app: 'web' }, topologyKey: 'kubernetes.io/hostname' },
          ],
        },
      },
    });
    const node = makeNode({ pods: [makePod({ labels: { app: 'web' } })] });
    const result = checkPodAffinity(pod, node, [node]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('PodAntiAffinityViolation');
  });

  it('passes pod affinity when target node has matching pod', () => {
    const existingPod = makePod({ name: 'existing', labels: { app: 'cache' } });
    const node = makeNode({ pods: [existingPod] });
    const pod = makePod({
      affinity: {
        podAffinity: {
          requiredDuringSchedulingIgnoredDuringExecution: [
            { labelSelector: { app: 'cache' }, topologyKey: 'kubernetes.io/hostname' },
          ],
        },
      },
    });
    const result = checkPodAffinity(pod, node, [node]);
    expect(result.valid).toBe(true);
  });

  it('rejects pod affinity when matching pod is on different node', () => {
    const otherNode = makeNode({
      name: 'worker-2',
      pods: [makePod({ name: 'existing', labels: { app: 'cache' } })],
    });
    const targetNode = makeNode({ name: 'worker-1', pods: [] });
    const pod = makePod({
      affinity: {
        podAffinity: {
          requiredDuringSchedulingIgnoredDuringExecution: [
            { labelSelector: { app: 'cache' }, topologyKey: 'kubernetes.io/hostname' },
          ],
        },
      },
    });
    const result = checkPodAffinity(pod, targetNode, [targetNode, otherNode]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('PodAffinityViolation');
  });
});

describe('validatePlacement (pipeline)', () => {
  it('runs checks in order and returns first failure', () => {
    const node = makeNode({
      capacity: { cpu: 100, memory: 128 },
      allocated: { cpu: 100, memory: 128 },
    });
    const pod = makePod({
      resources: { cpu: 500, memory: 512 },
      nodeSelector: { zone: 'nope' },
    });
    // Resources fail first
    const result = validatePlacement(pod, node, [node]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('NodeResourcesFit');
  });

  it('returns valid when all checks pass', () => {
    const result = validatePlacement(makePod(), makeNode(), [makeNode()]);
    expect(result.valid).toBe(true);
  });
});

describe('getValidNodes', () => {
  it('returns indices of valid nodes', () => {
    const nodes = [
      makeNode({ name: 'w1', capacity: { cpu: 100, memory: 128 }, allocated: { cpu: 100, memory: 0 } }),
      makeNode({ name: 'w2', capacity: { cpu: 4000, memory: 8192 } }),
      makeNode({ name: 'w3', capacity: { cpu: 4000, memory: 8192 } }),
    ];
    const pod = makePod({ resources: { cpu: 500, memory: 512 } });
    const valid = getValidNodes(pod, nodes);
    expect(valid).toEqual([1, 2]);
  });
});
