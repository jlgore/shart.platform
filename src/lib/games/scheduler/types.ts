export interface ResourceRequests {
  cpu: number;    // millicores
  memory: number; // MiB
}

export interface Toleration {
  key: string;
  operator: 'Equal' | 'Exists';
  value?: string;
  effect: 'NoSchedule' | 'NoExecute' | 'PreferNoSchedule';
}

export interface Taint {
  key: string;
  value?: string;
  effect: 'NoSchedule' | 'NoExecute' | 'PreferNoSchedule';
}

export interface PodAffinityTerm {
  labelSelector: Record<string, string>;
  topologyKey: string;
}

export interface PodAffinity {
  requiredDuringSchedulingIgnoredDuringExecution?: PodAffinityTerm[];
}

export interface PodAntiAffinity {
  requiredDuringSchedulingIgnoredDuringExecution?: PodAffinityTerm[];
}

export interface GamePod {
  name: string;
  labels: Record<string, string>;
  resources: ResourceRequests;
  nodeSelector?: Record<string, string>;
  tolerations?: Toleration[];
  affinity?: {
    podAffinity?: PodAffinity;
    podAntiAffinity?: PodAntiAffinity;
  };
  retriedOnce?: boolean;
}

export interface GameNode {
  name: string;
  labels: Record<string, string>;
  taints?: Taint[];
  capacity: ResourceRequests;
  allocated: ResourceRequests;
  pods: GamePod[];
}

export type ValidationFailureReason =
  | 'NodeResourcesFit'
  | 'MatchNodeSelector'
  | 'TaintToleration'
  | 'PodAffinityViolation'
  | 'PodAntiAffinityViolation';

export interface ValidationResult {
  valid: boolean;
  reason?: ValidationFailureReason;
  message?: string;
  details?: string;
}

export interface RoundConcepts {
  resources: boolean;
  nodeSelector: boolean;
  taints: boolean;
  affinity: boolean;
}

export interface RoundConfig {
  round: number;
  concepts: RoundConcepts;
  nodeCount: number;
  podCount: number;
  timeLimit: number | null;
  pointsPerPod: number;
  preAllocFactor: number; // 0-1, how heavily nodes are pre-loaded
}

export type SchedulerAction =
  | { type: 'INIT_ROUND'; nodes: GameNode[]; pods: GamePod[] }
  | { type: 'DRAG_START'; podIndex: number }
  | { type: 'DRAG_END' }
  | { type: 'DROP_POD'; nodeIndex: number; podIndex: number }
  | { type: 'NEXT_WAVE'; nodes: GameNode[]; pods: GamePod[] }
  | { type: 'WRONG_DROP_PENALTY'; podIndex: number; penaltyPods: GamePod[] };

export interface SchedulerGameState {
  nodes: GameNode[];
  podQueue: GamePod[];
  draggingPodIndex: number | null;
  placedCount: number;
  activeIndex: number | null;
  penaltyBuffer: GamePod[];
}
