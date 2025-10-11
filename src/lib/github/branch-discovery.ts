import type { GitHubBranch, BranchStep, LabBranches, GitHubFetchOptions } from './types.js';
import { fetchREADME } from './readme-fetcher.js';

const resolveToken = () => {
  try {
    const fromImport = (import.meta as any)?.env?.GITHUB_TOKEN as string | undefined;
    const fromProcess = typeof process !== 'undefined' ? process.env.GITHUB_TOKEN : undefined;
    return fromImport || fromProcess;
  } catch {
    return typeof process !== 'undefined' ? process.env.GITHUB_TOKEN : undefined;
  }
};

const branchCache: Map<string, GitHubBranch[]> = new Map();

export class GitHubBranchDiscovery {
  private baseUrl: string;
  private token?: string;

  constructor(options: GitHubFetchOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://api.github.com';
    this.token = options.token ?? resolveToken();
  }

  private async fetchWithAuth(url: string): Promise<Response> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'shart-platform-labs'
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return fetch(url, { headers });
  }

  async fetchAllBranches(repo: string): Promise<GitHubBranch[]> {
    const cached = branchCache.get(repo);
    if (cached) return cached;
    const url = `${this.baseUrl}/repos/${repo}/branches`;
    const response = await this.fetchWithAuth(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch branches for ${repo}: ${response.statusText}`);
    }

    const data = await response.json();
    branchCache.set(repo, data);
    return data;
  }

  extractStepNumber(branchName: string, pattern: string): number | null {
    // Convert pattern like 'branch-{step}-*' to regex
    const regexPattern = pattern
      .replace(/\{step\}/g, '(\\d+)')
      .replace(/\*/g, '.*')
      .replace(/\-/g, '\\-');

    const regex = new RegExp(`^${regexPattern}$`);
    const match = branchName.match(regex);

    return match ? parseInt(match[1], 10) : null;
  }

  matchesPattern(branchName: string, pattern: string): boolean {
    return this.extractStepNumber(branchName, pattern) !== null;
  }

  async extractStepTitle(repo: string, branchName: string): Promise<string | undefined> {
    try {
      const readmeContent = await fetchREADME(repo, branchName, { token: this.token });

      // Extract first H1 heading from README
      const h1Match = readmeContent.match(/^#\s+(.+)$/m);
      if (h1Match) {
        return h1Match[1].trim();
      }

      // Fallback: clean up branch name
      return branchName
        .replace(/^branch-\d+-/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    } catch (error) {
      console.warn(`Failed to extract title for branch ${branchName}:`, error);
      return undefined;
    }
  }

  async discoverLabBranches(repo: string, pattern: string = 'branch-{step}-*'): Promise<LabBranches> {
    // 1. Fetch all branches from GitHub API
    const branches = await this.fetchAllBranches(repo);

    // 2. Filter branches matching pattern
    const stepBranches = branches.filter(branch =>
      this.matchesPattern(branch.name, pattern)
    );

    // 3. Parse step numbers and sort
    const sortedSteps = stepBranches
      .map(branch => ({
        stepNumber: this.extractStepNumber(branch.name, pattern)!,
        branchName: branch.name,
        sha: branch.commit.sha
      }))
      .sort((a, b) => a.stepNumber - b.stepNumber);

    // 4. Fetch README content for each step in parallel
    const steps = await Promise.all(
      sortedSteps.map(async (step): Promise<BranchStep> => {
        try {
          const [readmeContent, title] = await Promise.all([
            fetchREADME(repo, step.branchName, { token: this.token }),
            this.extractStepTitle(repo, step.branchName)
          ]);

          return {
            ...step,
            readmeContent,
            title
          };
        } catch (error) {
          console.error(`Failed to fetch content for step ${step.stepNumber} (${step.branchName}):`, error);
          return {
            ...step,
            readmeContent: `# Error\n\nFailed to load content for step ${step.stepNumber}`,
            title: `Step ${step.stepNumber}`
          };
        }
      })
    );

    return {
      repo,
      steps,
      totalSteps: steps.length
    };
  }
}

// Default instance for convenience
export const branchDiscovery = new GitHubBranchDiscovery();

export async function discoverLabBranches(repo: string, pattern?: string): Promise<LabBranches> {
  return branchDiscovery.discoverLabBranches(repo, pattern);
}
