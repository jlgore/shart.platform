import type { Kysely } from 'kysely';
import type { Database, Env, KVSession, LabSession } from './types';

// Default lab time limit in minutes
const DEFAULT_TIME_LIMIT_MINUTES = 60;

// Max lab starts per student per day
const DAILY_RATE_LIMIT = 5;

// ============================================================================
// Rate limiting — D1-based atomic counter (replaces racy KV approach)
//
// Uses the shared rate_limits table (same as platform-api) with an atomic
// INSERT ... ON CONFLICT DO UPDATE to avoid the TOCTOU race that existed
// when using KV's non-atomic read-then-write pattern.
// ============================================================================

const LAB_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours, aligns to UTC days

export async function checkAndIncrementRateLimit(
  db: Kysely<Database>,
  userId: string
): Promise<{ allowed: boolean; remaining: number; resetsAt: number }> {
  const now = Date.now();
  // Align bucket to UTC calendar day (windowMs=86400000 aligns to epoch midnight)
  const bucketStart = Math.floor(now / LAB_RATE_LIMIT_WINDOW_MS) * LAB_RATE_LIMIT_WINDOW_MS;
  const resetAt = bucketStart + LAB_RATE_LIMIT_WINDOW_MS;
  const bucketKey = `lab-daily:${userId}:${bucketStart}`;
  const nowIso = new Date(now).toISOString();
  const expiresAt = new Date(resetAt + LAB_RATE_LIMIT_WINDOW_MS).toISOString();

  // Atomic increment: insert with count=1, or increment existing count
  await db
    .insertInto('rate_limits')
    .values({
      bucket_key: bucketKey,
      scope: 'lab-daily',
      identifier: userId,
      bucket_start: bucketStart,
      window_ms: LAB_RATE_LIMIT_WINDOW_MS,
      count: 1,
      expires_at: expiresAt,
      updated_at: nowIso,
    })
    .onConflict((oc) =>
      oc.column('bucket_key').doUpdateSet((eb) => ({
        count: eb('count', '+', 1),
        updated_at: nowIso,
      }))
    )
    .execute();

  const current = await db
    .selectFrom('rate_limits')
    .where('bucket_key', '=', bucketKey)
    .select('count')
    .executeTakeFirst();

  const count = current?.count ?? 1;
  const resetsAt = Math.ceil(resetAt / 1000);
  const allowed = count <= DAILY_RATE_LIMIT;

  return { allowed, remaining: Math.max(0, DAILY_RATE_LIMIT - count), resetsAt };
}

// ============================================================================
// Session management
// ============================================================================

function kvSessionKey(userId: string, labId: string): string {
  return `session:${userId}:${labId}`;
}

export async function createSession(
  env: Env,
  db: Kysely<Database>,
  userId: string,
  labId: string,
  timeLimitMinutes = DEFAULT_TIME_LIMIT_MINUTES
): Promise<{ sessionId: string; expiresAt: number }> {
  const attemptId = crypto.randomUUID();
  const sessionId = `${userId}:${labId}:${attemptId}`;
  const containerKey = sessionId;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + timeLimitMinutes * 60;

  // Write to D1
  await db
    .insertInto('lab_sessions')
    .values({
      session_id: sessionId,
      user_id: userId,
      lab_id: labId,
      attempt_id: attemptId,
      container_key: containerKey,
      started_at: now,
      expires_at: expiresAt,
      last_active_at: now,
      status: 'active',
    })
    .execute();

  // Write to KV with TTL = time limit (auto-expires)
  const kvValue: KVSession = { attemptId, containerKey, labId, startedAt: now, expiresAt };
  await env.SESSIONS.put(kvSessionKey(userId, labId), JSON.stringify(kvValue), {
    expirationTtl: timeLimitMinutes * 60,
  });

  return { sessionId, expiresAt };
}

export async function getKVSession(
  env: Env,
  userId: string,
  labId: string
): Promise<KVSession | null> {
  const raw = await env.SESSIONS.get(kvSessionKey(userId, labId));
  if (!raw) return null;
  return JSON.parse(raw) as KVSession;
}

export async function validateSessionForWS(
  env: Env,
  sessionId: string
): Promise<{ valid: boolean; reason?: string; kvSession?: KVSession }> {
  // Session ID format: {userId}:{labId}:{attemptId}
  const parts = sessionId.split(':');
  if (parts.length !== 3) {
    return { valid: false, reason: 'invalid session id format' };
  }
  const [userId, labId] = parts;

  const kvSession = await getKVSession(env, userId, labId);
  if (!kvSession) {
    return { valid: false, reason: 'session not found or expired' };
  }

  if (kvSession.containerKey !== sessionId) {
    return { valid: false, reason: 'session id mismatch' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > kvSession.expiresAt) {
    return { valid: false, reason: 'session expired' };
  }

  return { valid: true, kvSession };
}

export async function updateLastActive(db: Kysely<Database>, sessionId: string): Promise<void> {
  await db
    .updateTable('lab_sessions')
    .set({ last_active_at: Math.floor(Date.now() / 1000) })
    .where('session_id', '=', sessionId)
    .execute();
}

export async function completeSession(
  env: Env,
  db: Kysely<Database>,
  sessionId: string,
  userId: string,
  labId: string,
  checksPassed: number,
  checksTotal: number
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const score = checksTotal > 0 ? checksPassed / checksTotal : 0;

  await db
    .insertInto('lab_completions')
    .values({
      completion_id: crypto.randomUUID(),
      session_id: sessionId,
      user_id: userId,
      lab_id: labId,
      completed_at: now,
      checks_passed: checksPassed,
      checks_total: checksTotal,
      score,
    })
    .execute();

  await db
    .updateTable('lab_sessions')
    .set({ status: 'completed', last_active_at: now })
    .where('session_id', '=', sessionId)
    .execute();

  // Remove KV session so a new attempt can be started
  await env.SESSIONS.delete(kvSessionKey(userId, labId));
}
