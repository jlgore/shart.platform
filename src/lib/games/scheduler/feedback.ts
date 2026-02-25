import type { FeedbackMessage } from '../types';
import type { ValidationFailureReason } from './types';

const failureFeedback: Record<ValidationFailureReason, { title: string; body: string }> = {
  NodeResourcesFit: {
    title: 'Resource Limits Exceeded',
    body: 'Placing an oversized pod on a full node causes the kernel to OOMKill processes to reclaim memory — your pod or its neighbors die without warning. In a cascading failure, evicted pods reschedule onto other nodes and trigger the same OOM cycle cluster-wide. NodeResourcesFit prevents this by rejecting pods the node cannot physically accommodate.',
  },
  MatchNodeSelector: {
    title: 'Node Selector Mismatch',
    body: 'A GPU workload landing on a CPU-only node will crash or hang immediately because the device it expects does not exist; a workload that ignores AZ pinning can end up in the wrong region and break latency SLAs or data-residency requirements. MatchNodeSelector enforces that the node\'s labels satisfy every constraint the pod declares before scheduling proceeds.',
  },
  TaintToleration: {
    title: 'Untolerated Taint',
    body: 'Without toleration enforcement, general workloads flood reserved GPU or spot nodes, exhausting expensive capacity that was set aside for specific jobs — and the workloads those nodes were reserved for get stuck pending. When a critical node is tainted for maintenance, workloads without the matching toleration pile onto it anyway and get evicted mid-run. TaintToleration ensures only pods that explicitly accept a node\'s conditions can land on it.',
  },
  PodAffinityViolation: {
    title: 'Pod Affinity Unsatisfied',
    body: 'Separating co-located services — such as a sidecar proxy and its application, or a cache and its consumer — adds a network hop where there was none, inflating p99 latency and introducing a failure boundary that breaks correctness assumptions like local cache coherence. Pod affinity rules encode these co-location requirements so the scheduler cannot silently violate them.',
  },
  PodAntiAffinityViolation: {
    title: 'Pod Anti-Affinity Conflict',
    body: 'Two replicas on the same node is a silent single point of failure: when that node dies, both replicas die simultaneously and your service goes fully down despite appearing highly available. Pod anti-affinity rules prevent the scheduler from ever placing co-located replicas, guaranteeing that node failures stay partial outages.',
  },
};

export function getFailureFeedback(
  reason: ValidationFailureReason,
  details: string
): FeedbackMessage {
  const info = failureFeedback[reason];
  return {
    type: 'error',
    title: info.title,
    body: info.body,
    details,
    ruleViolated: reason,
  };
}

export function getSuccessFeedback(podName: string, nodeName: string): FeedbackMessage {
  return {
    type: 'success',
    title: 'Scheduled',
    body: `Pod "${podName}" successfully placed on "${nodeName}".`,
  };
}
