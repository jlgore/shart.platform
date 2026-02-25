export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

export interface GitHubContent {
  type?: string;
  content: string;
  sha: string;
  encoding: string;
  download_url: string;
}

export interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTreeResponse {
  sha: string;
  truncated: boolean;
  tree: GitHubTreeEntry[];
}

export interface BranchStep {
  stepNumber: number;
  branchName: string;
  title?: string;
  readmeContent: string;
  sha: string;
  lastModified?: string;
}

export interface LabBranches {
  repo: string;
  steps: BranchStep[];
  totalSteps: number;
}

export interface GitHubFetchOptions {
  token?: string;
  baseUrl?: string;
}
