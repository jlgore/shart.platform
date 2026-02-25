import type { GameNode, GamePod, RoundConfig, Taint, Toleration } from './types';

// Seeded PRNG (mulberry32)
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// ─── Node type profiles ────────────────────────────────────────────────────

interface NodeProfile {
  cpu: number;
  memory: number;
  instanceType: string;
  taint?: Taint;
}

const NODE_PROFILES: Record<string, NodeProfile> = {
  general:    { cpu: 3000, memory: 6144,  instanceType: 'general'   },
  compute:    { cpu: 4000, memory: 4096,  instanceType: 'compute'   },
  memory:     { cpu: 2000, memory: 8192,  instanceType: 'memory'    },
  'high-cpu': { cpu: 8000, memory: 8192,  instanceType: 'high-cpu'  },
  'high-mem': { cpu: 4000, memory: 16384, instanceType: 'high-mem'  },
  gpu: {
    cpu: 4000, memory: 8192, instanceType: 'gpu',
    taint: { key: 'nvidia.com/gpu', value: 'present', effect: 'NoSchedule' },
  },
  spot: {
    cpu: 4000, memory: 8192, instanceType: 'spot',
    taint: { key: 'node.kubernetes.io/lifecycle', value: 'spot', effect: 'NoSchedule' },
  },
};

// Fixed node slots in the order they join the cluster across waves.
// New node types unlock at wave milestones.
const NODE_SEQUENCE: { type: string; zone: string; name: string }[] = [
  { type: 'general',    zone: 'us-east-1a', name: 'node-general-1' },   // always
  { type: 'compute',    zone: 'us-east-1b', name: 'node-compute-1' },   // always
  { type: 'memory',     zone: 'us-west-2a', name: 'node-memory-1'  },   // always
  { type: 'high-cpu',   zone: 'us-east-1a', name: 'node-hicpu-1'   },   // +wave 3
  { type: 'gpu',        zone: 'us-east-1b', name: 'node-gpu-1'     },   // +wave 5
  { type: 'high-mem',   zone: 'us-west-2a', name: 'node-himem-1'   },   // +wave 8
  { type: 'spot',       zone: 'us-east-1a', name: 'node-spot-1'    },   // +wave 11
];

function getNodeCountForWave(wave: number): number {
  if (wave <= 2)  return 3;
  if (wave <= 4)  return 4;
  if (wave <= 7)  return 5;
  if (wave <= 10) return 6;
  return 7;
}

// ─── Pod name vocabulary ───────────────────────────────────────────────────

const POD_PREFIXES = [
  'api', 'web', 'worker', 'cache', 'db', 'proxy', 'monitor',
  'queue', 'auth', 'log', 'search', 'ml', 'batch', 'cron', 'gateway',
  'ingress', 'collector', 'exporter', 'controller', 'operator',
];

// ─── Wave config ───────────────────────────────────────────────────────────

export function getWaveConfig(wave: number): RoundConfig {
  const w = wave;

  const concepts = {
    resources:    true,
    nodeSelector: w >= 3,
    taints:       w >= 5,
    affinity:     w >= 8,
  };

  let podCount: number;
  if (w <= 2)  podCount = 5 + (w - 1);
  else if (w <= 5)  podCount = 7;
  else if (w <= 9)  podCount = 7 + (w - 5);   // 8–11
  else podCount = Math.min(14, 11 + Math.floor((w - 9) / 2));

  let timeLimit: number | null = null;
  if (w >= 12) {
    timeLimit = Math.max(45, 90 - (w - 12) * 5);
  }

  const pointsPerPod  = Math.min(500, 100 + (w - 1) * 25);
  const preAllocFactor = Math.min(0.55, 0.08 + (w - 1) * 0.04);
  const nodeCount     = getNodeCountForWave(w);

  return { round: w, concepts, nodeCount, podCount, timeLimit, pointsPerPod, preAllocFactor };
}

/** Alias kept for backwards compatibility */
export const getRoundConfig = getWaveConfig;

// ─── Wave generation ───────────────────────────────────────────────────────

export function generateWave(
  wave: number,
  seed: number = 42,
): { nodes: GameNode[]; pods: GamePod[] } {
  const config = getWaveConfig(wave);
  const rng = mulberry32(seed + wave * 1000);
  const nodes = buildNodes(wave, config, rng);
  const pods  = buildPods(config, nodes, rng);
  return { nodes, pods };
}

/** Alias kept for backwards compatibility */
export const generateRound = generateWave;

// ─── Node generation ───────────────────────────────────────────────────────

function buildNodes(wave: number, config: RoundConfig, rng: () => number): GameNode[] {
  const slots = NODE_SEQUENCE.slice(0, config.nodeCount);
  const f = config.preAllocFactor;

  return slots.map((slot) => {
    const profile = NODE_PROFILES[slot.type];
    const cpuCap = profile.cpu;
    const memCap = profile.memory;

    const allocCpu = randInt(rng, cpuCap * f * 0.3, cpuCap * f);
    const allocMem = randInt(rng, memCap * f * 0.3, memCap * f);

    const labels: Record<string, string> = {
      'kubernetes.io/hostname': slot.name,
    };

    if (config.concepts.nodeSelector) {
      labels['topology.kubernetes.io/zone']        = slot.zone;
      labels['node.kubernetes.io/instance-type']   = profile.instanceType;
    }

    const taints: Taint[] = [];
    if (config.concepts.taints && profile.taint) {
      taints.push(profile.taint);
    }

    return {
      name: slot.name,
      labels,
      taints: taints.length > 0 ? taints : undefined,
      capacity:  { cpu: cpuCap, memory: memCap },
      allocated: { cpu: Math.round(allocCpu), memory: Math.round(allocMem) },
      pods: [],
    };
  });
}

// ─── Pod generation ────────────────────────────────────────────────────────

function buildPods(config: RoundConfig, nodes: GameNode[], rng: () => number): GamePod[] {
  const pods: GamePod[] = [];
  const usedNames = new Set<string>();

  const gpuNodes  = nodes.filter((n) => n.labels['node.kubernetes.io/instance-type'] === 'gpu');
  const spotNodes = nodes.filter((n) => n.labels['node.kubernetes.io/instance-type'] === 'spot');
  const taintedNodes = nodes.filter((n) => n.taints && n.taints.length > 0);
  const untaintedNodes = nodes.filter((n) => !n.taints || n.taints.length === 0);

  for (let i = 0; i < config.podCount; i++) {
    let name: string;
    do {
      name = `${pick(rng, POD_PREFIXES)}-${randInt(rng, 100, 999)}`;
    } while (usedNames.has(name));
    usedNames.add(name);

    const appLabel = name.split('-')[0];
    const pod: GamePod = {
      name,
      labels: { app: appLabel },
      resources: {
        cpu:    pick(rng, [100, 200, 250, 500, 750, 1000, 1500]),
        memory: pick(rng, [128, 256, 512, 1024, 2048, 4096]),
      },
    };

    // ── nodeSelector ──────────────────────────────────────────────────────
    if (config.concepts.nodeSelector && rng() > 0.45) {
      // Pick a non-tainted node as selector target so the pod can always fit
      const pool = untaintedNodes.length > 0 ? untaintedNodes : nodes;
      const targetNode = pick(rng, pool);
      const selectorKey = pick(rng, [
        'topology.kubernetes.io/zone',
        'node.kubernetes.io/instance-type',
      ]);
      if (targetNode.labels[selectorKey]) {
        pod.nodeSelector = { [selectorKey]: targetNode.labels[selectorKey] };
      }
    }

    // ── GPU pod: requires GPU node (toleration + nodeSelector) ────────────
    if (gpuNodes.length > 0 && config.concepts.taints && rng() > 0.72) {
      const gpuNode = pick(rng, gpuNodes);
      const taint = gpuNode.taints?.[0];
      if (taint) {
        pod.tolerations = [{
          key: taint.key, operator: 'Equal', value: taint.value, effect: taint.effect,
        }];
        pod.nodeSelector = { 'node.kubernetes.io/instance-type': 'gpu' };
        pod.resources = {
          cpu:    pick(rng, [500, 1000, 2000]),
          memory: pick(rng, [1024, 2048, 4096]),
        };
      }
    }
    // ── Spot pod: requires spot toleration ───────────────────────────────
    else if (spotNodes.length > 0 && config.concepts.taints && rng() > 0.70 && !pod.tolerations) {
      const spotNode = pick(rng, spotNodes);
      const taint = spotNode.taints?.[0];
      if (taint) {
        pod.tolerations = [{
          key: taint.key, operator: 'Equal', value: taint.value, effect: taint.effect,
        }];
        pod.nodeSelector = { 'node.kubernetes.io/instance-type': 'spot' };
      }
    }
    // ── Generic tainted node toleration ──────────────────────────────────
    else if (taintedNodes.length > 0 && config.concepts.taints && rng() > 0.60 && !pod.tolerations) {
      const targetNode = pick(rng, taintedNodes);
      const taint = targetNode.taints![0];
      pod.tolerations = [{
        key: taint.key, operator: 'Equal', value: taint.value, effect: taint.effect,
      }];
    }

    // ── Pod affinity / anti-affinity ──────────────────────────────────────
    if (config.concepts.affinity && i > 2) {
      if (rng() > 0.6) {
        pod.affinity = {
          podAntiAffinity: {
            requiredDuringSchedulingIgnoredDuringExecution: [{
              labelSelector: { app: appLabel },
              topologyKey: 'kubernetes.io/hostname',
            }],
          },
        };
      } else if (rng() > 0.5 && pods.length > 0) {
        const targetPod = pick(rng, pods);
        pod.affinity = {
          podAffinity: {
            requiredDuringSchedulingIgnoredDuringExecution: [{
              labelSelector: { app: targetPod.labels.app },
              topologyKey: 'kubernetes.io/hostname',
            }],
          },
        };
      }
    }

    pods.push(pod);
  }

  return pods;
}

// ─── Penalty pods ──────────────────────────────────────────────────────────

export function getPenaltyCount(wave: number): number {
  if (wave <= 5)  return 2;
  if (wave <= 12) return 3;
  return 4;
}

export function generatePenaltyPods(
  failedPod: GamePod,
  count: number,
  wave: number,
  seed: number,
): GamePod[] {
  const rng = mulberry32(seed ^ (wave * 1337));
  const pods: GamePod[] = [];
  const usedNames = new Set<string>([failedPod.name]);

  for (let i = 0; i < count; i++) {
    let name: string;
    do {
      name = `${pick(rng, POD_PREFIXES)}-${randInt(rng, 100, 999)}`;
    } while (usedNames.has(name));
    usedNames.add(name);

    pods.push({
      name,
      labels: { app: name.split('-')[0], penalty: 'true' },
      resources: {
        cpu:    pick(rng, [100, 200, 250, 500]),
        memory: pick(rng, [128, 256, 512]),
      },
    });
  }

  return pods;
}
