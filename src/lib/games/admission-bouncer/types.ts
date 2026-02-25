export type VerdictType = 'admit' | 'deny';

export type LineHighlight = 'violation' | 'ok' | 'neutral';

export interface YamlLine {
  text: string;
  highlight?: LineHighlight;
}

export interface PolicyRule {
  id: string;
  label: string;
  description: string;
}

export interface PodScenario {
  id: string;
  podName: string;
  namespace: string;
  yaml: YamlLine[];
  verdict: VerdictType;
  violatedRule?: string;
  explanation: string;
}

export interface LevelConfig {
  id: number;
  title: string;
  policyName: string;
  intro: string;
  rules: PolicyRule[];
  scenarios: PodScenario[];
  timeLimit: number;
  pointsPerCorrect: number;
}
