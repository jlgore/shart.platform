import type { GamePod, GameNode, ValidationResult, Taint, Toleration } from './types';

/**
 * Validates pod placement on a node, mirroring real kube-scheduler filter plugins.
 * Runs checks in the same order as the scheduler: resources, selectors, taints, affinity.
 */
export function validatePlacement(
  pod: GamePod,
  node: GameNode,
  allNodes: GameNode[]
): ValidationResult {
  const resourceCheck = checkNodeResourcesFit(pod, node);
  if (!resourceCheck.valid) return resourceCheck;

  const selectorCheck = checkMatchNodeSelector(pod, node);
  if (!selectorCheck.valid) return selectorCheck;

  const taintCheck = checkTaintToleration(pod, node);
  if (!taintCheck.valid) return taintCheck;

  const affinityCheck = checkPodAffinity(pod, node, allNodes);
  if (!affinityCheck.valid) return affinityCheck;

  return { valid: true };
}

/**
 * Filter 1: NodeResourcesFit — checks CPU and memory capacity
 */
export function checkNodeResourcesFit(pod: GamePod, node: GameNode): ValidationResult {
  const availableCpu = node.capacity.cpu - node.allocated.cpu;
  const availableMemory = node.capacity.memory - node.allocated.memory;

  if (pod.resources.cpu > availableCpu) {
    return {
      valid: false,
      reason: 'NodeResourcesFit',
      message: 'Insufficient CPU',
      details: `Pod requests ${pod.resources.cpu}m CPU but node "${node.name}" only has ${availableCpu}m available (${node.allocated.cpu}m/${node.capacity.cpu}m used).`,
    };
  }

  if (pod.resources.memory > availableMemory) {
    return {
      valid: false,
      reason: 'NodeResourcesFit',
      message: 'Insufficient memory',
      details: `Pod requests ${pod.resources.memory}Mi memory but node "${node.name}" only has ${availableMemory}Mi available (${node.allocated.memory}Mi/${node.capacity.memory}Mi used).`,
    };
  }

  return { valid: true };
}

/**
 * Filter 2: MatchNodeSelector — pod.nodeSelector must match node labels
 */
export function checkMatchNodeSelector(pod: GamePod, node: GameNode): ValidationResult {
  if (!pod.nodeSelector) return { valid: true };

  for (const [key, value] of Object.entries(pod.nodeSelector)) {
    if (node.labels[key] !== value) {
      return {
        valid: false,
        reason: 'MatchNodeSelector',
        message: 'Node selector mismatch',
        details: `Pod requires label "${key}=${value}" but node "${node.name}" ${
          node.labels[key] !== undefined
            ? `has "${key}=${node.labels[key]}"`
            : `does not have label "${key}"`
        }.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Filter 3: TaintToleration — NoSchedule taints must have matching tolerations
 */
export function checkTaintToleration(pod: GamePod, node: GameNode): ValidationResult {
  if (!node.taints || node.taints.length === 0) return { valid: true };

  for (const taint of node.taints) {
    if (taint.effect !== 'NoSchedule') continue;

    const tolerated = (pod.tolerations || []).some((t) => tolerationMatchesTaint(t, taint));

    if (!tolerated) {
      return {
        valid: false,
        reason: 'TaintToleration',
        message: 'Untolerated taint',
        details: `Node "${node.name}" has taint "${taint.key}=${taint.value || ''}:${taint.effect}" but pod has no matching toleration.`,
      };
    }
  }

  return { valid: true };
}

function tolerationMatchesTaint(toleration: Toleration, taint: Taint): boolean {
  if (toleration.effect !== taint.effect) return false;

  if (toleration.operator === 'Exists') {
    return toleration.key === taint.key;
  }

  return toleration.key === taint.key && toleration.value === taint.value;
}

/**
 * Filter 4: Inter-pod affinity and anti-affinity
 */
export function checkPodAffinity(
  pod: GamePod,
  targetNode: GameNode,
  allNodes: GameNode[]
): ValidationResult {
  if (!pod.affinity) return { valid: true };

  // Pod affinity: requires co-location with matching pods
  const affinityTerms = pod.affinity.podAffinity?.requiredDuringSchedulingIgnoredDuringExecution;
  if (affinityTerms && affinityTerms.length > 0) {
    for (const term of affinityTerms) {
      const hasMatchOnTargetNode = targetNode.pods.some((p) =>
        matchesLabelSelector(p.labels, term.labelSelector)
      );

      if (!hasMatchOnTargetNode) {
        // Check if any node in the cluster has a matching pod
        const anyNodeHasMatch = allNodes.some((n) =>
          n.pods.some((p) => matchesLabelSelector(p.labels, term.labelSelector))
        );

        if (anyNodeHasMatch) {
          const selectorStr = Object.entries(term.labelSelector)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');
          return {
            valid: false,
            reason: 'PodAffinityViolation',
            message: 'Pod affinity not satisfied',
            details: `Pod requires co-location with pods matching {${selectorStr}} but no matching pod exists on node "${targetNode.name}".`,
          };
        }
      }
    }
  }

  // Pod anti-affinity: prevents co-location with matching pods
  const antiAffinityTerms =
    pod.affinity.podAntiAffinity?.requiredDuringSchedulingIgnoredDuringExecution;
  if (antiAffinityTerms && antiAffinityTerms.length > 0) {
    for (const term of antiAffinityTerms) {
      const hasConflict = targetNode.pods.some((p) =>
        matchesLabelSelector(p.labels, term.labelSelector)
      );

      if (hasConflict) {
        const selectorStr = Object.entries(term.labelSelector)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        return {
          valid: false,
          reason: 'PodAntiAffinityViolation',
          message: 'Pod anti-affinity conflict',
          details: `Pod has anti-affinity against pods matching {${selectorStr}} but node "${targetNode.name}" already has a matching pod.`,
        };
      }
    }
  }

  return { valid: true };
}

function matchesLabelSelector(
  labels: Record<string, string>,
  selector: Record<string, string>
): boolean {
  for (const [key, value] of Object.entries(selector)) {
    if (labels[key] !== value) return false;
  }
  return true;
}

/**
 * Returns all valid node indices for a pod.
 */
export function getValidNodes(pod: GamePod, nodes: GameNode[]): number[] {
  return nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => validatePlacement(pod, node, nodes).valid)
    .map(({ index }) => index);
}

export interface SuboptimalReason {
  title: string;
  explanation: string;
}

/**
 * Checks whether a valid placement is nonetheless suboptimal.
 * Returns a reason if the chosen node is wasteful, null if it's a good fit.
 *
 * Rules (only apply when node labels are present, i.e. wave 3+):
 *   1. GPU node with no GPU requirement → wasting accelerator capacity
 *   2. Spot node with no spot toleration → wasting preemptible capacity
 *   3. High-CPU node (≥8 vCPU) with small CPU pod (≤500m) AND alternatives exist
 *   4. High-mem node (≥16 GiB) with small memory pod (≤512Mi) AND alternatives exist
 */
export function getSuboptimalReason(
  pod: GamePod,
  chosenNode: GameNode,
  allNodes: GameNode[],
): SuboptimalReason | null {
  const instanceType = chosenNode.labels['node.kubernetes.io/instance-type'];
  if (!instanceType) return null; // labels not unlocked yet (wave 1–2)

  // Helper: does at least one OTHER valid node exist?
  const hasAlternative = allNodes.some(
    (n) => n.name !== chosenNode.name && validatePlacement(pod, n, allNodes).valid,
  );

  // 1 ── GPU node waste ──────────────────────────────────────────────────
  if (instanceType === 'gpu') {
    const hasGpuNeed =
      pod.tolerations?.some((t) => t.key === 'nvidia.com/gpu') ||
      pod.nodeSelector?.['node.kubernetes.io/instance-type'] === 'gpu';
    if (!hasGpuNeed) {
      return {
        title: 'GPU Node Wasted',
        explanation: `${chosenNode.name} is reserved for GPU workloads. This pod has no GPU requirement — scheduling it here denies that slot to workloads that actually need accelerators.`,
      };
    }
  }

  // 2 ── Spot node waste ────────────────────────────────────────────────
  if (instanceType === 'spot') {
    const hasSpotNeed =
      pod.tolerations?.some((t) => t.key === 'node.kubernetes.io/lifecycle') ||
      pod.nodeSelector?.['node.kubernetes.io/instance-type'] === 'spot';
    if (!hasSpotNeed) {
      return {
        title: 'Spot Capacity Wasted',
        explanation: `${chosenNode.name} is a spot instance meant for fault-tolerant batch workloads. Spot capacity should be reserved for pods that explicitly tolerate eviction — not general services.`,
      };
    }
  }

  // 3 ── High-CPU node underutilized ────────────────────────────────────
  if (instanceType === 'high-cpu' && hasAlternative) {
    const wantsCpu =
      pod.resources.cpu > 500 ||
      pod.nodeSelector?.['node.kubernetes.io/instance-type'] === 'high-cpu';
    if (!wantsCpu) {
      return {
        title: 'High-CPU Node Underutilized',
        explanation: `${chosenNode.name} has ${chosenNode.capacity.cpu / 1000} vCPUs but this pod only requests ${pod.resources.cpu}m. Reserve high-CPU nodes for compute-intensive workloads and use a general-purpose node instead.`,
      };
    }
  }

  // 4 ── High-mem node underutilized ────────────────────────────────────
  if (instanceType === 'high-mem' && hasAlternative) {
    const wantsMem =
      pod.resources.memory > 512 ||
      pod.nodeSelector?.['node.kubernetes.io/instance-type'] === 'high-mem';
    if (!wantsMem) {
      return {
        title: 'High-Memory Node Underutilized',
        explanation: `${chosenNode.name} has ${chosenNode.capacity.memory / 1024} GiB RAM but this pod only requests ${pod.resources.memory} MiB. Reserve memory-optimized nodes for memory-hungry workloads.`,
      };
    }
  }

  return null;
}
