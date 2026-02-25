import type { GitHubContent, GitHubFetchOptions, GitHubTreeResponse } from './types.js';

const resolveToken = () => {
  try {
    const fromImport = (import.meta as any)?.env?.GITHUB_TOKEN as string | undefined;
    const fromProcess = typeof process !== 'undefined' ? process.env.GITHUB_TOKEN : undefined;
    return fromImport || fromProcess;
  } catch {
    return typeof process !== 'undefined' ? process.env.GITHUB_TOKEN : undefined;
  }
};

function rewriteRelativeImageUrls(html: string, repo: string, filePath: string, ref: string): string {
  const fileDir = filePath.includes('/') ? filePath.split('/').slice(0, -1).join('/') : '';
  const rawBase = fileDir
    ? `https://raw.githubusercontent.com/${repo}/${ref}/${fileDir}/`
    : `https://raw.githubusercontent.com/${repo}/${ref}/`;

  return html.replace(/(<img\b[^>]+\bsrc=)(["'])([^"']+)\2/gi, (_match, prefix, quote, src) => {
    if (/^(https?:\/\/|\/\/|data:)/i.test(src)) return _match;
    try {
      const absolute = new URL(src, rawBase).href;
      return `${prefix}${quote}${absolute}${quote}`;
    } catch {
      return _match;
    }
  });
}

const readmeHtmlCache: Map<string, string> = new Map();
const readmeRawCache: Map<string, { content: string; sha: string; downloadUrl: string }> = new Map();
const markdownFileHtmlCache: Map<string, string> = new Map();
const markdownFileRawCache: Map<string, string> = new Map();
const repoTreeCache: Map<string, string[]> = new Map();

export class GitHubREADMEFetcher {
  private baseUrl: string;
  private token?: string;

  constructor(options: GitHubFetchOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://api.github.com';
    this.token = options.token ?? resolveToken();
  }

  private encodeContentPath(path: string): string {
    return path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
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

  async listRepoFiles(repo: string, ref: string = 'main'): Promise<string[]> {
    const cacheKey = `${repo}@${ref}`;
    const cached = repoTreeCache.get(cacheKey);
    if (cached) return cached;

    const url = `${this.baseUrl}/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch git tree for ${repo}@${ref}: ${response.statusText}`);
    }

    const data: GitHubTreeResponse = await response.json();
    const files = (data.tree || [])
      .filter((entry) => entry.type === 'blob')
      .map((entry) => entry.path);

    repoTreeCache.set(cacheKey, files);
    return files;
  }

  async fetchMarkdownFile(repo: string, filePath: string, ref: string = 'main'): Promise<string> {
    const cacheKey = `${repo}@${ref}:${filePath}`;
    const cached = markdownFileRawCache.get(cacheKey);
    if (cached) return cached;

    const encodedPath = this.encodeContentPath(filePath);
    const url = `${this.baseUrl}/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
    const response = await this.fetchWithAuth(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch file ${repo}@${ref}:${filePath}: ${response.statusText}`);
    }

    const data: GitHubContent = await response.json();
    if (data.type && data.type !== 'file') {
      throw new Error(`Expected a file at ${repo}:${filePath}, got ${data.type}`);
    }
    if (data.encoding !== 'base64') {
      throw new Error(`Unexpected encoding for ${filePath}: ${data.encoding}`);
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    markdownFileRawCache.set(cacheKey, content);
    return content;
  }

  async renderMarkdownToHtml(markdown: string, repoContext?: string): Promise<string> {
    const url = `${this.baseUrl}/markdown`;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'shart-platform-labs'
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const body = JSON.stringify({
      text: markdown,
      mode: 'gfm',
      ...(repoContext ? { context: repoContext } : {})
    });

    const response = await fetch(url, { method: 'POST', headers, body });
    if (!response.ok) {
      throw new Error(`Failed to render markdown HTML: ${response.statusText}`);
    }
    return response.text();
  }

  async fetchMarkdownFileHtml(repo: string, filePath: string, ref: string = 'main'): Promise<string> {
    const cacheKey = `${repo}@${ref}:${filePath}`;
    const cached = markdownFileHtmlCache.get(cacheKey);
    if (cached) return cached;

    const markdown = await this.fetchMarkdownFile(repo, filePath, ref);
    const rawHtml = await this.renderMarkdownToHtml(markdown, repo);
    const html = rewriteRelativeImageUrls(rawHtml, repo, filePath, ref);
    markdownFileHtmlCache.set(cacheKey, html);
    return html;
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

export async function listRepoFiles(repo: string, ref?: string, options?: GitHubFetchOptions): Promise<string[]> {
  const fetcher = options ? new GitHubREADMEFetcher(options) : readmeFetcher;
  return fetcher.listRepoFiles(repo, ref ?? 'main');
}

export async function fetchMarkdownFile(repo: string, filePath: string, ref?: string, options?: GitHubFetchOptions): Promise<string> {
  const fetcher = options ? new GitHubREADMEFetcher(options) : readmeFetcher;
  return fetcher.fetchMarkdownFile(repo, filePath, ref ?? 'main');
}

export async function fetchMarkdownFileHtml(repo: string, filePath: string, ref?: string, options?: GitHubFetchOptions): Promise<string> {
  const fetcher = options ? new GitHubREADMEFetcher(options) : readmeFetcher;
  return fetcher.fetchMarkdownFileHtml(repo, filePath, ref ?? 'main');
}
