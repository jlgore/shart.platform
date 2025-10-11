import type { GitHubContent, GitHubFetchOptions } from './types.js';

const resolveToken = () => {
  try {
    const fromImport = (import.meta as any)?.env?.GITHUB_TOKEN as string | undefined;
    const fromProcess = typeof process !== 'undefined' ? process.env.GITHUB_TOKEN : undefined;
    return fromImport || fromProcess;
  } catch {
    return typeof process !== 'undefined' ? process.env.GITHUB_TOKEN : undefined;
  }
};

const readmeHtmlCache: Map<string, string> = new Map();
const readmeRawCache: Map<string, { content: string; sha: string; downloadUrl: string }> = new Map();

export class GitHubREADMEFetcher {
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

  async fetchREADME(repo: string, branch: string = 'main'): Promise<string> {
    const cacheKey = `${repo}@${branch}`;
    const cached = readmeRawCache.get(cacheKey);
    if (cached) return cached.content;
    const url = `${this.baseUrl}/repos/${repo}/contents/README.md?ref=${branch}`;
    const response = await this.fetchWithAuth(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch README for ${repo}@${branch}: ${response.statusText}`);
    }

    const data: GitHubContent = await response.json();

    if (data.encoding !== 'base64') {
      throw new Error(`Unexpected encoding: ${data.encoding}`);
    }

    // Decode base64 content
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    readmeRawCache.set(cacheKey, { content, sha: data.sha, downloadUrl: data.download_url });
    return content;
  }

  // Fetch README rendered by GitHub as HTML to avoid bundling a Markdown parser.
  // Note: Uses the dedicated README endpoint with HTML Accept header.
  async fetchREADMEHtml(repo: string, branch: string = 'main'): Promise<string> {
    const cacheKey = `${repo}@${branch}`;
    const cached = readmeHtmlCache.get(cacheKey);
    if (cached) return cached;
    const url = `${this.baseUrl}/repos/${repo}/readme?ref=${branch}`;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3.html',
      'User-Agent': 'shart-platform-labs'
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch README HTML for ${repo}@${branch}: ${response.statusText}`);
    }
    // The body is raw HTML
    const html = await response.text();
    readmeHtmlCache.set(cacheKey, html);
    return html;
  }

  async fetchREADMEWithMetadata(repo: string, branch: string = 'main'): Promise<{
    content: string;
    sha: string;
    downloadUrl: string;
  }> {
    const cacheKey = `${repo}@${branch}`;
    const cached = readmeRawCache.get(cacheKey);
    if (cached) return { content: cached.content, sha: cached.sha, downloadUrl: cached.downloadUrl };
    const url = `${this.baseUrl}/repos/${repo}/contents/README.md?ref=${branch}`;
    const response = await this.fetchWithAuth(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch README for ${repo}@${branch}: ${response.statusText}`);
    }

    const data: GitHubContent = await response.json();

    if (data.encoding !== 'base64') {
      throw new Error(`Unexpected encoding: ${data.encoding}`);
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8');

    const result = { content, sha: data.sha, downloadUrl: data.download_url };
    readmeRawCache.set(cacheKey, result);
    return result;
  }

  async getBranchLastModified(repo: string, branch: string): Promise<string> {
    const url = `${this.baseUrl}/repos/${repo}/branches/${branch}`;
    const response = await this.fetchWithAuth(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch branch info for ${repo}@${branch}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.commit.commit.committer.date;
  }
}

// Default instance for convenience
export const readmeFetcher = new GitHubREADMEFetcher();

export async function fetchREADME(repo: string, branch?: string, options?: GitHubFetchOptions): Promise<string> {
  const fetcher = options ? new GitHubREADMEFetcher(options) : readmeFetcher;
  return fetcher.fetchREADME(repo, branch);
}

export async function fetchREADMEWithMetadata(repo: string, branch?: string, options?: GitHubFetchOptions) {
  const fetcher = options ? new GitHubREADMEFetcher(options) : readmeFetcher;
  return fetcher.fetchREADMEWithMetadata(repo, branch);
}

export async function fetchREADMEHtml(repo: string, branch?: string, options?: GitHubFetchOptions): Promise<string> {
  const fetcher = options ? new GitHubREADMEFetcher(options) : readmeFetcher;
  return fetcher.fetchREADMEHtml(repo, branch);
}
