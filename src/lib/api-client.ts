/**
 * Server-side API client for platform-api
 * Used in SSR pages to fetch CTF data
 */

type Fetcher = import('@cloudflare/workers-types').Fetcher;

// Fallback for when runtime env isn't available
const DEFAULT_API_BASE = import.meta.env.PROD
  ? 'https://platform.shart.cloud'
  : 'http://localhost:8787';

export interface ApiClientOptions {
  cookieHeader?: string;
  sessionToken?: string;
  binding?: Fetcher;
  apiBase?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(
  path: string,
  options: ApiClientOptions & RequestInit = {}
): Promise<T> {
  const { sessionToken, cookieHeader, binding, apiBase, ...fetchOptions } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers,
  };

  if (cookieHeader) {
    (headers as Record<string, string>)['Cookie'] = cookieHeader;
  } else if (sessionToken) {
    (headers as Record<string, string>)['Cookie'] = `better-auth.session_token=${sessionToken}`;
  }

  const requestInit = { ...fetchOptions, headers } as RequestInit;
  const res = binding
    ? await binding.fetch(`https://platform-api${path}`, requestInit as any)
    : await fetch(`${apiBase || DEFAULT_API_BASE}${path}`, requestInit);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error || `API error: ${res.status}`);
  }

  return res.json();
}

// Types matching platform-api
export interface Question {
  id: string;
  phase_id: string;
  phase_number: number;
  phase_name: string;
  question_number: number;
  question_text: string;
  base_points: number;
  hints: Array<{
    index: number;
    cost: number;
    text: string | null;
    unlocked: boolean;
  }>;
  is_answered: boolean;
  points_awarded: number | null;
}

export interface PlayerStatus {
  user_id: string;
  display_name: string | null;
  total_points: number;
  questions_answered: number;
  questions_total: number;
  honeytoken_trips: Array<{
    token_name: string;
    tripped_at: string;
  }>;
  achievements: Array<{
    id: string;
    name: string;
    description: string;
    icon: string | null;
    points: number;
    earned_at: string;
  }>;
  ghost_protocol_eligible: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  total_points: number;
  questions_answered: number;
  achievements_count: number;
}

export interface Instance {
  id: string;
  ctf_slug: string;
  registered_at: string;
  last_seen_at: string | null;
  is_active: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  points: number;
  condition_type: string;
  earned: boolean;
}

// API functions
type FetchOpts = Pick<ApiClientOptions, 'apiBase' | 'binding'>;

export async function getQuestions(ctf: string, authCookieHeader: string, opts?: FetchOpts): Promise<Question[]> {
  const data = await fetchApi<{ questions: Question[] }>(
    `/api/ctf/questions?ctf=${ctf}`,
    { cookieHeader: authCookieHeader, ...opts }
  );
  return data.questions;
}

export async function getStatus(ctf: string, authCookieHeader: string, opts?: FetchOpts): Promise<PlayerStatus> {
  return fetchApi<PlayerStatus>(`/api/ctf/status?ctf=${ctf}`, { cookieHeader: authCookieHeader, ...opts });
}

export async function getLeaderboard(limit = 50, offset = 0, opts?: FetchOpts): Promise<LeaderboardEntry[]> {
  const data = await fetchApi<{ leaderboard: LeaderboardEntry[] }>(
    `/api/ctf/leaderboard?limit=${limit}&offset=${offset}`,
    { ...opts }
  );
  return data.leaderboard;
}

export async function getInstances(authCookieHeader: string, opts?: FetchOpts): Promise<Instance[]> {
  const data = await fetchApi<{ instances: Instance[] }>(
    '/api/ctf/instances',
    { cookieHeader: authCookieHeader, ...opts }
  );
  return data.instances;
}

export async function getAchievements(ctf: string, authCookieHeader?: string, opts?: FetchOpts): Promise<Achievement[]> {
  const data = await fetchApi<{ achievements: Achievement[] }>(
    `/api/ctf/achievements?ctf=${ctf}`,
    { cookieHeader: authCookieHeader, ...opts }
  );
  return data.achievements;
}

export async function submitAnswer(
  questionId: string,
  answer: string,
  authCookieHeader: string,
  opts?: FetchOpts
): Promise<{ correct: boolean; already_answered: boolean; points_awarded: number }> {
  return fetchApi('/api/ctf/questions/submit', {
    method: 'POST',
    cookieHeader: authCookieHeader,
    ...opts,
    body: JSON.stringify({ question_id: questionId, answer }),
  });
}

export async function unlockHint(
  questionId: string,
  hintIndex: number,
  authCookieHeader: string,
  opts?: FetchOpts
): Promise<{ success: boolean; hint: { index: number; text: string; cost: number } }> {
  return fetchApi('/api/ctf/questions/hint', {
    method: 'POST',
    cookieHeader: authCookieHeader,
    ...opts,
    body: JSON.stringify({ question_id: questionId, hint_index: hintIndex }),
  });
}

export interface CourseProgressData {
  completed_docs: string[];
  last_doc_path: string | null;
}

export async function getCourseProgress(
  courseSlug: string,
  authCookieHeader: string,
  opts?: FetchOpts
): Promise<CourseProgressData> {
  return fetchApi<CourseProgressData>(
    `/api/courses/${encodeURIComponent(courseSlug)}/progress`,
    { cookieHeader: authCookieHeader, ...opts }
  );
}

export async function registerInstance(
  ctfSlug: string,
  authCookieHeader: string,
  opts?: FetchOpts
): Promise<{ instance_id: string; instance_secret: string; ctf_slug: string; kubectl_command: string }> {
  return fetchApi('/api/ctf/register', {
    method: 'POST',
    cookieHeader: authCookieHeader,
    ...opts,
    body: JSON.stringify({ ctf_slug: ctfSlug }),
  });
}
