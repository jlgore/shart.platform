import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database, Env, QuestionWithProgress, Hint, PlayerStatus, LeaderboardEntry } from './types';
import { createDb, generateId, hashInstanceSecret, verifyInstanceSecret, deriveFlag } from './db';
import { createAuth } from './auth';
import { nanoid } from 'nanoid';
import {
  TRUSTED_ORIGINS,
  buildRateLimitBucket,
  extractRequestOrigin,
  isRateLimitExceeded,
  shouldRejectCsrfForCookieAuth,
  type AuthMethod,
} from './security';

// ============================================================================
// Validation Schemas
// ============================================================================

const VALID_CTF_SLUGS = ['shart-cloud', 'shart-dev', 'shart-enterprise'] as const;

const ctfQuerySchema = z.object({
  ctf: z.enum(VALID_CTF_SLUGS).optional().default('shart-cloud'),
});

const submitAnswerSchema = z.object({
  question_id: z.string().min(1).max(36),
  answer: z.string().min(1).max(500),
});

const unlockHintSchema = z.object({
  question_id: z.string().min(1).max(36),
  hint_index: z.number().int().min(0).max(10),
});

const registerInstanceSchema = z.object({
  ctf_slug: z.enum(VALID_CTF_SLUGS).optional().default('shart-cloud'),
});

const honeytokenTelemetrySchema = z.object({
  instance_id: z.string().min(1).max(36),
  instance_secret: z.string().min(1).max(64),
  token_name: z.string().min(1).max(255),
  token_path: z.string().max(1024).optional(),
  metadata: z.record(z.string().max(64), z.union([z.string().max(256), z.number(), z.boolean(), z.null()])).refine(v => Object.keys(v).length <= 20, 'Too many metadata keys').optional(),
});

const heartbeatSchema = z.object({
  instance_id: z.string().min(1).max(36),
  instance_secret: z.string().min(1).max(64),
});

const flagSubmitSchema = z.object({
  instance_id: z.string().min(1).max(36),
  instance_secret: z.string().min(1).max(64),
  challenge_id: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, 'Invalid challenge ID'),
  value: z.string().min(1).max(100),
});

const leaderboardQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
  offset: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0)).optional(),
});

type Variables = {
  db: Kysely<Database>;
  userId?: string;
  authMethod?: AuthMethod;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

type RateLimitConfig = {
  scope: string;
  windowMs: number;
  max: number;
  keyResolver?: (c: any) => string;
};

function getClientIp(c: any): string {
  const forwarded = c.req.header('x-forwarded-for');
  return c.req.header('cf-connecting-ip') || forwarded?.split(',')[0]?.trim() || 'unknown';
}

function getRequestOrigin(c: any): string | null {
  return extractRequestOrigin(c.req.header('Origin'), c.req.header('Referer'));
}

async function requireTrustedOriginForCookieAuth(c: any, next: any) {
  const origin = getRequestOrigin(c);
  const authMethod = c.get('authMethod') as AuthMethod | undefined;
  if (shouldRejectCsrfForCookieAuth(authMethod, origin, TRUSTED_ORIGINS)) {
    return c.json({ error: 'CSRF validation failed' }, 403);
  }

  await next();
}

function withRateLimit(config: RateLimitConfig) {
  return async (c: any, next: any) => {
    const db = c.get('db') as Kysely<Database> | undefined;
    if (!db) {
      await next();
      return;
    }

    const now = Date.now();
    const identity = (config.keyResolver?.(c) || getClientIp(c)).slice(0, 160);
    const bucket = buildRateLimitBucket(config.scope, identity, config.windowMs, now);

    await db
      .insertInto('rate_limits')
      .values({
        bucket_key: bucket.bucketKey,
        scope: config.scope,
        identifier: identity,
        bucket_start: bucket.bucketStart,
        window_ms: config.windowMs,
        count: 1,
        expires_at: bucket.expiresAt,
        updated_at: bucket.nowIso,
      })
      .onConflict((oc) =>
        oc.column('bucket_key').doUpdateSet((eb) => ({
          count: eb('count', '+', 1),
          updated_at: bucket.nowIso,
          expires_at: bucket.expiresAt,
        }))
      )
      .execute();

    const current = await db
      .selectFrom('rate_limits')
      .where('bucket_key', '=', bucket.bucketKey)
      .select('count')
      .executeTakeFirst();

    if (isRateLimitExceeded(current?.count ?? 0, config.max)) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      c.header('Retry-After', String(Math.max(retryAfterSeconds, 1)));
      return c.json({ error: 'Too many requests, slow down' }, 429);
    }

    if (Math.random() < 0.01) {
      await db
        .deleteFrom('rate_limits')
        .where('expires_at', '<', bucket.nowIso)
        .execute();
    }

    await next();
  };
}

// ============================================================================
// Middleware
// ============================================================================

app.use('*', logger());
app.use('*', cors({
  origin: [...TRUSTED_ORIGINS],
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Initialize database for all requests
app.use('*', async (c, next) => {
  c.set('db', createDb(c.env));
  await next();
});

// Auth middleware
async function requireAuth(c: any, next: any) {
  const db = c.get('db') as Kysely<Database>;
  const authHeader = c.req.header('Authorization');
  const cookieHeader = c.req.header('Cookie') || '';
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : undefined;
  const cookieToken = cookieHeader.match(/better-auth\.session_token=([^;]+)/)?.[1];
  const sessionToken = bearerToken || cookieToken;

  if (!sessionToken) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const session = await db
    .selectFrom('sessions')
    .where('token', '=', sessionToken)
    .where('expiresAt', '>', new Date().toISOString())
    .selectAll()
    .executeTakeFirst();

  if (!session) {
    return c.json({ error: 'Invalid or expired session' }, 401);
  }

  c.set('authMethod', bearerToken ? 'bearer' : 'cookie');
  c.set('userId', session.userId);
  await next();
}

async function optionalAuth(c: any, next: any) {
  const db = c.get('db') as Kysely<Database>;
  const authHeader = c.req.header('Authorization');
  const cookieHeader = c.req.header('Cookie') || '';
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : undefined;
  const cookieToken = cookieHeader.match(/better-auth\.session_token=([^;]+)/)?.[1];
  const sessionToken = bearerToken || cookieToken;

  if (sessionToken) {
    const session = await db
      .selectFrom('sessions')
      .where('token', '=', sessionToken)
      .where('expiresAt', '>', new Date().toISOString())
      .selectAll()
      .executeTakeFirst();
    if (session) {
      c.set('authMethod', bearerToken ? 'bearer' : 'cookie');
      c.set('userId', session.userId);
    }
  }
  await next();
}

// ============================================================================
// Health & Auth
// ============================================================================

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.all('/api/auth/*', async (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

// ============================================================================
// Questions API
// ============================================================================

app.get('/api/ctf/questions', requireAuth, zValidator('query', ctfQuerySchema), async (c) => {
  const db = c.get('db') as Kysely<Database>;
  const userId = c.get('userId') as string;
  const { ctf: ctfSlug } = c.req.valid('query');

  const allQuestions = await db
    .selectFrom('questions')
    .innerJoin('phases', 'questions.phase_id', 'phases.id')
    .where('phases.ctf_slug', '=', ctfSlug)
    .select([
      'questions.id', 'questions.phase_id', 'questions.question_number',
      'questions.question_text', 'questions.base_points', 'questions.hints',
      'phases.phase_number', 'phases.name as phase_name',
    ])
    .orderBy('phases.phase_number', 'asc')
    .orderBy('questions.question_number', 'asc')
    .execute();

  const userSubmissions = await db
    .selectFrom('submissions')
    .where('user_id', '=', userId)
    .where('is_correct', '=', 1)
    .select(['question_id', 'points_awarded'])
    .execute();

  const answeredMap = new Map(userSubmissions.map((s) => [s.question_id, s.points_awarded]));

  const unlockedHints = await db
    .selectFrom('unlocked_hints')
    .where('user_id', '=', userId)
    .select(['question_id', 'hint_index'])
    .execute();

  const unlockedHintsMap = new Map<string, Set<number>>();
  for (const h of unlockedHints) {
    if (!unlockedHintsMap.has(h.question_id)) unlockedHintsMap.set(h.question_id, new Set());
    unlockedHintsMap.get(h.question_id)!.add(h.hint_index);
  }

  const questions: QuestionWithProgress[] = allQuestions.map((q) => {
    const hints: Hint[] = JSON.parse(q.hints);
    const unlocked = unlockedHintsMap.get(q.id) || new Set();
    return {
      id: q.id,
      phase_id: q.phase_id,
      phase_number: q.phase_number,
      phase_name: q.phase_name,
      question_number: q.question_number,
      question_text: q.question_text,
      base_points: q.base_points,
      hints: hints.map((hint, i) => ({
        index: i,
        cost: hint.cost,
        text: unlocked.has(i) ? hint.text : null,
        unlocked: unlocked.has(i),
      })),
      is_answered: answeredMap.has(q.id),
      points_awarded: answeredMap.get(q.id) || null,
    };
  });

  return c.json({ questions });
});

app.post(
  '/api/ctf/questions/submit',
  requireAuth,
  requireTrustedOriginForCookieAuth,
  withRateLimit({
    scope: 'submit-answer',
    windowMs: 60_000,
    max: 30,
    keyResolver: (c) => c.get('userId') ?? getClientIp(c),
  }),
  zValidator('json', submitAnswerSchema),
  async (c) => {
  const db = c.get('db') as Kysely<Database>;
  const userId = c.get('userId') as string;
  const { question_id, answer } = c.req.valid('json');

  const existingCorrect = await db
    .selectFrom('submissions')
    .where('user_id', '=', userId)
    .where('question_id', '=', question_id)
    .where('is_correct', '=', 1)
    .selectAll()
    .executeTakeFirst();

  if (existingCorrect) {
    return c.json({ correct: true, already_answered: true, points_awarded: existingCorrect.points_awarded });
  }

  const question = await db
    .selectFrom('questions')
    .where('id', '=', question_id)
    .selectAll()
    .executeTakeFirst();

  if (!question) return c.json({ error: 'Question not found' }, 404);

  const isCorrect = answer.trim().toLowerCase() === question.answer.trim().toLowerCase();

  const hintsUsed = await db
    .selectFrom('unlocked_hints')
    .where('user_id', '=', userId)
    .where('question_id', '=', question_id)
    .select(db.fn.count('id').as('count'))
    .executeTakeFirst();

  const hintCount = Number(hintsUsed?.count || 0);
  let pointsAwarded = 0;

  if (isCorrect) {
    const hints: Hint[] = JSON.parse(question.hints);
    const hintCosts = hints.slice(0, hintCount).reduce((sum, h) => sum + h.cost, 0);
    pointsAwarded = Math.max(0, question.base_points - hintCosts);
    const inserted = await db
      .insertInto('submissions')
      .values({
        id: generateId(),
        user_id: userId,
        question_id,
        submitted_answer: answer,
        is_correct: 1,
        hints_used: hintCount,
        points_awarded: pointsAwarded,
        submitted_at: new Date().toISOString(),
      })
      .onConflict((oc) => oc.columns(['user_id', 'question_id']).doNothing())
      .executeTakeFirst();

    if (Number(inserted.numInsertedOrUpdatedRows ?? 0) === 0) {
      const concurrentCorrect = await db
        .selectFrom('submissions')
        .where('user_id', '=', userId)
        .where('question_id', '=', question_id)
        .where('is_correct', '=', 1)
        .select(['points_awarded'])
        .executeTakeFirst();

      return c.json({
        correct: true,
        already_answered: true,
        points_awarded: concurrentCorrect?.points_awarded ?? pointsAwarded,
      });
    }

    await db.updateTable('player_profiles')
      .set((eb) => ({ total_points: eb('total_points', '+', pointsAwarded), updated_at: new Date().toISOString() }))
      .where('user_id', '=', userId)
      .execute();

    return c.json({ correct: true, already_answered: false, points_awarded: pointsAwarded });
  }

  await db.insertInto('submissions').values({
    id: generateId(),
    user_id: userId,
    question_id,
    submitted_answer: answer,
    is_correct: 0,
    hints_used: hintCount,
    points_awarded: 0,
    submitted_at: new Date().toISOString(),
  }).execute();

  return c.json({ correct: false, already_answered: false, points_awarded: 0 });
});

app.post(
  '/api/ctf/questions/hint',
  requireAuth,
  requireTrustedOriginForCookieAuth,
  withRateLimit({
    scope: 'unlock-hint',
    windowMs: 60_000,
    max: 20,
    keyResolver: (c) => c.get('userId') ?? getClientIp(c),
  }),
  zValidator('json', unlockHintSchema),
  async (c) => {
  const db = c.get('db') as Kysely<Database>;
  const userId = c.get('userId') as string;
  const { question_id, hint_index } = c.req.valid('json');

  const alreadyAnswered = await db
    .selectFrom('submissions')
    .where('user_id', '=', userId)
    .where('question_id', '=', question_id)
    .where('is_correct', '=', 1)
    .selectAll()
    .executeTakeFirst();

  if (alreadyAnswered) return c.json({ error: 'Question already answered' }, 400);

  const existing = await db
    .selectFrom('unlocked_hints')
    .where('user_id', '=', userId)
    .where('question_id', '=', question_id)
    .where('hint_index', '=', hint_index)
    .selectAll()
    .executeTakeFirst();

  if (existing) return c.json({ error: 'Hint already unlocked' }, 400);

  const question = await db.selectFrom('questions').where('id', '=', question_id).selectAll().executeTakeFirst();
  if (!question) return c.json({ error: 'Question not found' }, 404);

  const hints: Hint[] = JSON.parse(question.hints);
  if (hint_index < 0 || hint_index >= hints.length) return c.json({ error: 'Invalid hint index' }, 400);

  if (hint_index > 0) {
    const prev = await db
      .selectFrom('unlocked_hints')
      .where('user_id', '=', userId)
      .where('question_id', '=', question_id)
      .where('hint_index', '=', hint_index - 1)
      .selectAll()
      .executeTakeFirst();
    if (!prev) return c.json({ error: 'Must unlock hints in order' }, 400);
  }

  await db.insertInto('unlocked_hints').values({
    id: generateId(), user_id: userId, question_id, hint_index, unlocked_at: new Date().toISOString(),
  }).execute();

  return c.json({ success: true, hint: { index: hint_index, text: hints[hint_index].text, cost: hints[hint_index].cost } });
});

// ============================================================================
// Instance Registration & Telemetry
// ============================================================================

app.post(
  '/api/ctf/register',
  requireAuth,
  requireTrustedOriginForCookieAuth,
  withRateLimit({
    scope: 'register-instance',
    windowMs: 5 * 60_000,
    max: 10,
    keyResolver: (c) => c.get('userId') ?? getClientIp(c),
  }),
  zValidator('json', registerInstanceSchema),
  async (c) => {
  const db = c.get('db') as Kysely<Database>;
  const userId = c.get('userId') as string;
  const { ctf_slug: ctfSlug } = c.req.valid('json');

  const ctf = await db.selectFrom('ctfs').where('slug', '=', ctfSlug).where('is_active', '=', 1).selectAll().executeTakeFirst();
  if (!ctf) return c.json({ error: 'CTF not found' }, 404);

  const instanceId = generateId();
  const instanceSecret = nanoid(32);
  const flagKey = nanoid(48);
  const hashedSecret = await hashInstanceSecret(instanceSecret, c.env.INSTANCE_SECRET_SALT);

  await db.updateTable('instances').set({ is_active: 0 }).where('user_id', '=', userId).where('ctf_slug', '=', ctfSlug).execute();

  const now = new Date().toISOString();
  await db.insertInto('instances').values({
    id: instanceId, user_id: userId, instance_secret: hashedSecret, flag_key: flagKey, ctf_slug: ctfSlug, is_active: 1, registered_at: now,
  }).execute();

  const profile = await db.selectFrom('player_profiles').where('user_id', '=', userId).selectAll().executeTakeFirst();
  if (!profile) {
    await db.insertInto('player_profiles').values({ user_id: userId, display_name: null, total_points: 0, created_at: now, updated_at: now }).execute();
  }

  return c.json({
    instance_id: instanceId,
    instance_secret: instanceSecret,
    ctf_slug: ctfSlug,
    kubectl_command: `kubectl create secret generic shart-telemetry --from-literal=INSTANCE_ID=${instanceId} --from-literal=INSTANCE_SECRET=${instanceSecret} --from-literal=API_URL=https://platform.shart.cloud/api/ctf/telemetry -n kube-system`,
  });
});

app.get('/api/ctf/instances', requireAuth, async (c) => {
  const db = c.get('db') as Kysely<Database>;
  const userId = c.get('userId') as string;
  const instances = await db
    .selectFrom('instances')
    .where('user_id', '=', userId)
    .select(['id', 'ctf_slug', 'registered_at', 'last_seen_at', 'is_active'])
    .orderBy('registered_at', 'desc')
    .execute();
  return c.json({ instances });
});

app.post(
  '/api/ctf/telemetry/honeytoken',
  withRateLimit({
    scope: 'telemetry-honeytoken',
    windowMs: 60_000,
    max: 120,
    keyResolver: (c) => getClientIp(c),
  }),
  zValidator('json', honeytokenTelemetrySchema),
  async (c) => {
  const db = c.get('db') as Kysely<Database>;
  const { instance_id, instance_secret, token_name, token_path, metadata } = c.req.valid('json');

  const instance = await db.selectFrom('instances').where('id', '=', instance_id).where('is_active', '=', 1).selectAll().executeTakeFirst();
  if (!instance) return c.json({ error: 'Instance not found' }, 404);

  const valid = await verifyInstanceSecret(instance_secret, instance.instance_secret, c.env.INSTANCE_SECRET_SALT);
  if (!valid) return c.json({ error: 'Invalid secret' }, 401);

  await db.insertInto('honeytoken_trips').values({
    id: generateId(), instance_id, user_id: instance.user_id, token_name, token_path: token_path || null, metadata: JSON.stringify(metadata || {}), tripped_at: new Date().toISOString(),
  }).execute();

  await db.updateTable('instances').set({ last_seen_at: new Date().toISOString() }).where('id', '=', instance_id).execute();

  return c.json({ success: true });
});

app.post(
  '/api/ctf/telemetry/heartbeat',
  withRateLimit({
    scope: 'telemetry-heartbeat',
    windowMs: 60_000,
    max: 300,
    keyResolver: (c) => getClientIp(c),
  }),
  zValidator('json', heartbeatSchema),
  async (c) => {
  const db = c.get('db') as Kysely<Database>;
  const { instance_id, instance_secret } = c.req.valid('json');

  const instance = await db.selectFrom('instances').where('id', '=', instance_id).where('is_active', '=', 1).selectAll().executeTakeFirst();
  if (!instance) return c.json({ error: 'Instance not found' }, 404);

  const valid = await verifyInstanceSecret(instance_secret, instance.instance_secret, c.env.INSTANCE_SECRET_SALT);
  if (!valid) return c.json({ error: 'Invalid secret' }, 401);

  await db.updateTable('instances').set({ last_seen_at: new Date().toISOString() }).where('id', '=', instance_id).execute();

  return c.json({ success: true });
});

app.post(
  '/api/ctf/flag/submit',
  withRateLimit({
    // Per-IP: prevent brute-force scanning from a single source
    scope: 'flag-submit',
    windowMs: 5 * 60_000,
    max: 20,
    keyResolver: (c) => getClientIp(c),
  }),
  zValidator('json', flagSubmitSchema),
  async (c) => {
  const db = c.get('db') as Kysely<Database>;
  const { instance_id, instance_secret, challenge_id, value } = c.req.valid('json');

  const instance = await db
    .selectFrom('instances')
    .where('id', '=', instance_id)
    .where('is_active', '=', 1)
    .selectAll()
    .executeTakeFirst();
  if (!instance) return c.json({ error: 'Instance not found' }, 404);

  const valid = await verifyInstanceSecret(instance_secret, instance.instance_secret, c.env.INSTANCE_SECRET_SALT);
  if (!valid) return c.json({ error: 'Invalid secret' }, 401);

  // Challenge must exist
  const challenge = await db
    .selectFrom('ctf_challenges')
    .where('id', '=', challenge_id)
    .where('ctf_slug', '=', instance.ctf_slug)
    .selectAll()
    .executeTakeFirst();
  if (!challenge) return c.json({ error: 'Challenge not found' }, 404);

  // Already accepted — return duplicate without re-validating
  const existing = await db
    .selectFrom('ctf_flag_submissions')
    .where('instance_id', '=', instance_id)
    .where('challenge_id', '=', challenge_id)
    .where('accepted', '=', 1)
    .select(['points_awarded'])
    .executeTakeFirst();
  if (existing) {
    return c.json({ accepted: true, already_submitted: true, points_awarded: existing.points_awarded, message: 'Already solved — nice work!' });
  }

  // Per-instance+challenge rate limit: max 10 attempts to prevent brute force
  const recentAttempts = await db
    .selectFrom('ctf_flag_submissions')
    .where('instance_id', '=', instance_id)
    .where('challenge_id', '=', challenge_id)
    .select(db.fn.count('id').as('count'))
    .executeTakeFirst();
  if (Number(recentAttempts?.count ?? 0) >= 10) {
    return c.json({ error: 'Too many attempts for this challenge' }, 429);
  }

  // Derive the expected flag for this instance+challenge
  if (!instance.flag_key) {
    return c.json({ error: 'Instance not configured for flag submission — re-register' }, 400);
  }
  const expected = await deriveFlag(instance.flag_key, challenge_id);

  // Constant-time string comparison
  const enc = new TextEncoder();
  const aBytes = enc.encode(value.trim());
  const bBytes = enc.encode(expected);
  let diff = aBytes.length === bBytes.length ? 0 : 1;
  const len = Math.min(aBytes.length, bBytes.length);
  for (let i = 0; i < len; i++) diff |= aBytes[i] ^ bBytes[i];
  const accepted = diff === 0;

  const points = accepted ? challenge.base_points : 0;
  const now = new Date().toISOString();

  await db.insertInto('ctf_flag_submissions').values({
    id: generateId(),
    instance_id,
    user_id: instance.user_id,
    challenge_id,
    submitted_value: value,
    accepted: accepted ? 1 : 0,
    points_awarded: points,
    submitted_at: now,
  }).execute();

  if (accepted) {
    await db.updateTable('player_profiles')
      .set((eb) => ({ total_points: eb('total_points', '+', points), updated_at: now }))
      .where('user_id', '=', instance.user_id)
      .execute();
  }

  await db.updateTable('instances').set({ last_seen_at: now }).where('id', '=', instance_id).execute();

  return c.json({
    accepted,
    already_submitted: false,
    points_awarded: points,
    message: accepted
      ? `Correct! +${points} points awarded.`
      : 'Incorrect flag. Keep digging.',
  });
});

// ============================================================================
// Status & Leaderboard
// ============================================================================

app.get('/api/ctf/status', requireAuth, zValidator('query', ctfQuerySchema), async (c) => {
  const db = c.get('db') as Kysely<Database>;
  const userId = c.get('userId') as string;
  const { ctf: ctfSlug } = c.req.valid('query');

  const profile = await db.selectFrom('player_profiles').where('user_id', '=', userId).selectAll().executeTakeFirst();
  if (!profile) return c.json({ error: 'Profile not found' }, 404);

  const questionsAnswered = await db
    .selectFrom('submissions')
    .innerJoin('questions', 'submissions.question_id', 'questions.id')
    .innerJoin('phases', 'questions.phase_id', 'phases.id')
    .where('submissions.user_id', '=', userId)
    .where('submissions.is_correct', '=', 1)
    .where('phases.ctf_slug', '=', ctfSlug)
    .select(db.fn.count('submissions.id').as('count'))
    .executeTakeFirst();

  const totalQuestions = await db
    .selectFrom('questions')
    .innerJoin('phases', 'questions.phase_id', 'phases.id')
    .where('phases.ctf_slug', '=', ctfSlug)
    .select(db.fn.count('questions.id').as('count'))
    .executeTakeFirst();

  const trips = await db
    .selectFrom('honeytoken_trips')
    .where('user_id', '=', userId)
    .select(['token_name', 'tripped_at'])
    .orderBy('tripped_at', 'desc')
    .execute();

  const achievements = await db
    .selectFrom('user_achievements')
    .innerJoin('achievements', 'user_achievements.achievement_id', 'achievements.id')
    .where('user_achievements.user_id', '=', userId)
    .where('achievements.ctf_slug', '=', ctfSlug)
    .select(['achievements.id', 'achievements.name', 'achievements.description', 'achievements.icon', 'achievements.points', 'user_achievements.earned_at'])
    .execute();

  const status: PlayerStatus = {
    user_id: userId,
    display_name: profile.display_name,
    total_points: profile.total_points,
    questions_answered: Number(questionsAnswered?.count || 0),
    questions_total: Number(totalQuestions?.count || 0),
    honeytoken_trips: trips.map((t) => ({ token_name: t.token_name, tripped_at: t.tripped_at })),
    achievements: achievements.map((a) => ({ id: a.id, name: a.name, description: a.description, icon: a.icon, points: a.points, earned_at: a.earned_at })),
    ghost_protocol_eligible: trips.length === 0,
  };

  return c.json(status);
});

app.get('/api/ctf/leaderboard', optionalAuth, zValidator('query', leaderboardQuerySchema), async (c) => {
  const db = c.get('db') as Kysely<Database>;
  const { limit = 50, offset = 0 } = c.req.valid('query');

  const players = await db
    .selectFrom('player_profiles')
    .innerJoin('users', 'player_profiles.user_id', 'users.id')
    .where('player_profiles.total_points', '>', 0)
    .select(['player_profiles.user_id', 'player_profiles.display_name', 'player_profiles.total_points', 'users.name'])
    .orderBy('player_profiles.total_points', 'desc')
    .limit(limit)
    .offset(offset)
    .execute();

  const requestingUserId = c.get('userId');
  const leaderboard: LeaderboardEntry[] = players.map((p, i) => ({
    rank: offset + i + 1,
    // Only expose user_id to the authenticated user viewing their own entry
    user_id: requestingUserId && requestingUserId === p.user_id ? p.user_id : undefined,
    display_name: p.display_name || p.name || 'Anonymous',
    total_points: p.total_points,
    questions_answered: 0,
    achievements_count: 0,
  }));

  return c.json({ leaderboard });
});

app.get('/api/ctf/achievements', optionalAuth, zValidator('query', ctfQuerySchema), async (c) => {
  const db = c.get('db') as Kysely<Database>;
  const userId = c.get('userId');
  const { ctf: ctfSlug } = c.req.valid('query');

  const achievements = await db
    .selectFrom('achievements')
    .where('ctf_slug', '=', ctfSlug)
    .where('is_secret', '=', 0)
    .select(['id', 'name', 'description', 'icon', 'points', 'condition_type'])
    .execute();

  let earnedIds = new Set<string>();
  if (userId) {
    const earned = await db.selectFrom('user_achievements').where('user_id', '=', userId).select('achievement_id').execute();
    earnedIds = new Set(earned.map((e) => e.achievement_id));
  }

  return c.json({ achievements: achievements.map((a) => ({ ...a, earned: earnedIds.has(a.id) })) });
});

// ============================================================================
// Course Progress API
// ============================================================================

const courseProgressMarkSchema = z.object({
  doc_path: z.string().min(1).max(500).regex(/^[a-zA-Z0-9/_\-\.]+$/, 'Invalid path characters'),
  completed: z.boolean(),
});

const COURSE_SLUG_RE = /^[a-z0-9-]+$/;

app.get('/api/courses/:courseSlug/progress', requireAuth, async (c) => {
  const db = c.get('db') as Kysely<Database>;
  const userId = c.get('userId') as string;
  const courseSlug = c.req.param('courseSlug');

  if (!COURSE_SLUG_RE.test(courseSlug) || courseSlug.length > 100) {
    return c.json({ error: 'Invalid course slug' }, 400);
  }

  const row = await db
    .selectFrom('course_progress')
    .where('user_id', '=', userId)
    .where('course_slug', '=', courseSlug)
    .select(['completed_docs', 'last_doc_path'])
    .executeTakeFirst();

  if (!row) {
    return c.json({ completed_docs: [], last_doc_path: null });
  }

  const completedDocs: string[] = JSON.parse(row.completed_docs);
  return c.json({ completed_docs: completedDocs, last_doc_path: row.last_doc_path });
});

app.post(
  '/api/courses/:courseSlug/progress/mark',
  requireAuth,
  requireTrustedOriginForCookieAuth,
  zValidator('json', courseProgressMarkSchema),
  async (c) => {
    const db = c.get('db') as Kysely<Database>;
    const userId = c.get('userId') as string;
    const courseSlug = c.req.param('courseSlug');
    const { doc_path, completed } = c.req.valid('json');

    if (!COURSE_SLUG_RE.test(courseSlug) || courseSlug.length > 100) {
      return c.json({ error: 'Invalid course slug' }, 400);
    }

    const existing = await db
      .selectFrom('course_progress')
      .where('user_id', '=', userId)
      .where('course_slug', '=', courseSlug)
      .select('completed_docs')
      .executeTakeFirst();

    let completedDocs: string[] = existing ? JSON.parse(existing.completed_docs) : [];

    if (completed) {
      if (!completedDocs.includes(doc_path)) {
        completedDocs.push(doc_path);
      }
    } else {
      completedDocs = completedDocs.filter((d) => d !== doc_path);
    }

    const now = Math.floor(Date.now() / 1000);

    await db
      .insertInto('course_progress')
      .values({
        id: generateId(),
        user_id: userId,
        course_slug: courseSlug,
        completed_docs: JSON.stringify(completedDocs),
        last_doc_path: doc_path,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.columns(['user_id', 'course_slug']).doUpdateSet({
          completed_docs: JSON.stringify(completedDocs),
          last_doc_path: doc_path,
          updated_at: now,
        })
      )
      .execute();

    return c.json({ success: true, completed_docs: completedDocs });
  }
);

// ============================================================================
// Error Handling
// ============================================================================

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
