import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database, Env } from './types';
import { createDb } from './db';
import {
  checkAndIncrementRateLimit,
  createSession,
  validateSessionForWS,
  updateLastActive,
  completeSession,
} from './session';

export { LabContainer } from './container';

// ============================================================================
// Trusted origins
// ============================================================================

const TRUSTED_ORIGINS = [
  'https://shart.cloud',
  'https://www.shart.cloud',
  'https://dev.shart.cloud',
  'https://labs.shart.cloud',
  'http://localhost:4321',
  'http://localhost:8788',
  'http://localhost:8787',
];

// ============================================================================
// App setup
// ============================================================================

type Variables = {
  db: Kysely<Database>;
  userId?: string;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: TRUSTED_ORIGINS,
    credentials: true,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use('*', async (c, next) => {
  c.set('db', createDb(c.env));
  await next();
});

// ============================================================================
// Auth middleware
// Validates better-auth session token against the shared D1 sessions table.
// ============================================================================

async function requireAuth(c: any, next: any) {
  const db = c.get('db') as Kysely<Database>;
  const authHeader = c.req.header('Authorization');
  const cookieHeader = c.req.header('Cookie') || '';
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const cookieToken = cookieHeader.match(/better-auth\.session_token=([^;]+)/)?.[1];
  const sessionToken = bearerToken || cookieToken;

  if (!sessionToken) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const session = await db
    .selectFrom('sessions')
    .where('token', '=', sessionToken)
    .where('expiresAt', '>', new Date().toISOString())
    .select(['userId'])
    .executeTakeFirst();

  if (!session) {
    return c.json({ error: 'Invalid or expired session' }, 401);
  }

  c.set('userId', session.userId);
  await next();
}

// ============================================================================
// Feature flag check
// ============================================================================

async function checkFeatureFlag(env: Env): Promise<boolean> {
  const flag = await env.SESSIONS.get('feature:labs:enabled');
  return flag !== 'false'; // default enabled if key is absent
}

// ============================================================================
// Health
// ============================================================================

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ============================================================================
// POST /api/labs/sessions — Create a new lab session and provision container
// ============================================================================

const createSessionSchema = z.object({
  lab_id: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  time_limit_minutes: z.number().int().min(5).max(120).optional(),
});

app.post('/api/labs/sessions', requireAuth, zValidator('json', createSessionSchema), async (c) => {
  const userId = c.get('userId') as string;
  const db = c.get('db') as Kysely<Database>;
  const { lab_id: labId, time_limit_minutes: timeLimitMinutes } = c.req.valid('json');

  // Feature flag
  if (!(await checkFeatureFlag(c.env))) {
    return c.json({ error: 'Lab sessions are temporarily disabled' }, 503);
  }

  // Rate limit — atomic D1 check+increment prevents TOCTOU race
  const rateLimit = await checkAndIncrementRateLimit(db, userId);
  if (!rateLimit.allowed) {
    return c.json({
      error: 'Daily lab limit reached. Try again tomorrow.',
      remaining: 0,
      resets_at: rateLimit.resetsAt,
    }, 429);
  }

  // Create session in D1 + KV
  const { sessionId, expiresAt } = await createSession(
    c.env,
    db,
    userId,
    labId,
    timeLimitMinutes
  );

  // Provision container — get the DO stub and run the internal setup call
  const containerId = c.env.LAB_CONTAINER.idFromName(sessionId);
  const container = c.env.LAB_CONTAINER.get(containerId);
  await container.fetch(
    new Request('https://container.internal/__lab/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, labId, userId }),
    })
  );

  return c.json({
    session_id: sessionId,
    expires_at: expiresAt,
    ws_url: `wss://labs.shart.cloud/ws/${sessionId}`,
  });
});

// ============================================================================
// GET /ws/:sessionId — WebSocket proxy to container ttyd
//
// xterm.js connects here. We validate the session then proxy the WebSocket
// upgrade directly to the LabContainer DO, which forwards to ttyd on port 7681.
// ============================================================================

app.get('/ws/:sessionId', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426);
  }

  // Validate Origin to prevent cross-site WebSocket hijacking
  const origin = c.req.header('Origin');
  if (origin && !TRUSTED_ORIGINS.includes(origin)) {
    return new Response('Forbidden origin', { status: 403 });
  }

  const sessionId = c.req.param('sessionId');
  const { valid, reason, kvSession } = await validateSessionForWS(c.env, sessionId);

  if (!valid || !kvSession) {
    return new Response(reason ?? 'Session invalid', { status: 410 });
  }

  // Update heartbeat (fire-and-forget — don't block the WS upgrade)
  const db = c.get('db') as Kysely<Database>;
  c.executionCtx.waitUntil(updateLastActive(db, sessionId));

  // Proxy WebSocket to container
  const containerId = c.env.LAB_CONTAINER.idFromName(kvSession.containerKey);
  const container = c.env.LAB_CONTAINER.get(containerId);
  return container.fetch(c.req.raw);
});

// ============================================================================
// POST /api/labs/complete — Completion webhook (called by gymctl inside container)
//
// gymctl signs the request with HMAC-SHA256 using COMPLETION_WEBHOOK_SECRET.
// Header: X-Gymctl-Signature: sha256=<hex>
// ============================================================================

const completionSchema = z.object({
  session_id: z.string().min(1).max(200),
  user_id: z.string().min(1).max(36),
  lab_id: z.string().min(1).max(100),
  checks_passed: z.number().int().min(0),
  checks_total: z.number().int().min(0),
});

// Note: intentionally NOT using zValidator middleware here — body must be read
// as raw text for HMAC verification before parsing, to prevent body-consumption
// ordering issues that would let zValidator eat the stream first.
app.post('/api/labs/complete', async (c) => {
  const db = c.get('db') as Kysely<Database>;

  // Read raw body text first — HMAC must be verified before any parsing
  const body = await c.req.text();

  // Verify HMAC signature
  const sig = c.req.header('X-Gymctl-Signature');
  if (!sig || !sig.startsWith('sha256=')) {
    return c.json({ error: 'Missing signature' }, 401);
  }

  const isValid = await verifyHmac(body, sig.slice(7), c.env.COMPLETION_WEBHOOK_SECRET);
  if (!isValid) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  // Parse and validate only after HMAC is confirmed
  let bodyJson: unknown;
  try {
    bodyJson = JSON.parse(body);
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const parsed = completionSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body' }, 400);
  }
  const { session_id, user_id, lab_id, checks_passed, checks_total } = parsed.data;

  // Verify session exists and is active
  const session = await db
    .selectFrom('lab_sessions')
    .where('session_id', '=', session_id)
    .where('user_id', '=', user_id)
    .where('status', '=', 'active')
    .select(['session_id'])
    .executeTakeFirst();

  if (!session) {
    return c.json({ error: 'Session not found or already completed' }, 404);
  }

  await completeSession(c.env, db, session_id, user_id, lab_id, checks_passed, checks_total);

  return c.json({ success: true });
});

// ============================================================================
// GET /api/labs/sessions/:userId/:labId — Check if an active session exists
// ============================================================================

app.get('/api/labs/sessions/:userId/:labId', requireAuth, async (c) => {
  const requestingUserId = c.get('userId') as string;
  const { userId, labId } = c.req.param();

  // Students can only check their own sessions
  if (requestingUserId !== userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const db = c.get('db') as Kysely<Database>;
  const session = await db
    .selectFrom('lab_sessions')
    .where('user_id', '=', userId)
    .where('lab_id', '=', labId)
    .where('status', '=', 'active')
    .orderBy('started_at', 'desc')
    .select(['session_id', 'expires_at', 'started_at'])
    .executeTakeFirst();

  if (!session) {
    return c.json({ session: null });
  }

  return c.json({
    session: {
      session_id: session.session_id,
      expires_at: session.expires_at,
      started_at: session.started_at,
      ws_url: `wss://labs.shart.cloud/ws/${session.session_id}`,
    },
  });
});

// ============================================================================
// GET /api/labs/completions/:userId — Lab completion history
// ============================================================================

app.get('/api/labs/completions/:userId', requireAuth, async (c) => {
  const requestingUserId = c.get('userId') as string;
  const { userId } = c.req.param();

  if (requestingUserId !== userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const db = c.get('db') as Kysely<Database>;
  const completions = await db
    .selectFrom('lab_completions')
    .where('user_id', '=', userId)
    .orderBy('completed_at', 'desc')
    .selectAll()
    .execute();

  return c.json({ completions });
});

// ============================================================================
// GET /api/labs/admin/usage — Monthly container usage summary (admin only)
// Requires requesting user to be in the ADMIN_USER_IDS env var (comma-separated).
// ============================================================================

app.get('/api/labs/admin/usage', requireAuth, async (c) => {
  const userId = c.get('userId') as string;
  const adminIds = (c.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!adminIds.includes(userId)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // First day of current UTC month as unix timestamp
  const now = new Date();
  const monthStart = Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000
  );

  // Join usage_events with lab_sessions to get per-session active seconds.
  // Active seconds = sum of sleeping.occurred_at - started.occurred_at for each pair.
  const result = await c.env.DB.prepare(
    `SELECT
       e.session_id,
       ls.user_id,
       ls.lab_id,
       SUM(CASE WHEN e.event_type = 'started'  THEN -e.occurred_at
                WHEN e.event_type = 'sleeping' THEN  e.occurred_at
                ELSE 0 END) AS active_seconds
     FROM usage_events e
     JOIN lab_sessions ls ON ls.session_id = e.session_id
     WHERE e.occurred_at >= ?
     GROUP BY e.session_id, ls.user_id, ls.lab_id
     ORDER BY ls.user_id, e.session_id`
  )
    .bind(monthStart)
    .all<{ session_id: string; user_id: string; lab_id: string; active_seconds: number }>();

  const rows = result.results ?? [];

  // Aggregate per user
  const byUser: Record<string, { user_id: string; sessions: number; total_seconds: number }> = {};
  let grandTotal = 0;
  for (const row of rows) {
    const seconds = Math.max(0, row.active_seconds ?? 0);
    grandTotal += seconds;
    if (!byUser[row.user_id]) {
      byUser[row.user_id] = { user_id: row.user_id, sessions: 0, total_seconds: 0 };
    }
    byUser[row.user_id].sessions++;
    byUser[row.user_id].total_seconds += seconds;
  }

  return c.json({
    month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
    grand_total_seconds: grandTotal,
    by_user: Object.values(byUser),
    sessions: rows,
  });
});

// ============================================================================
// Error handling
// ============================================================================

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;

// ============================================================================
// Helpers
// ============================================================================

async function verifyHmac(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const sigBytes = hexToBytes(signature);
  return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(body));
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
