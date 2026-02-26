// Cloudflare Worker environment bindings
export interface Env {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  SESSIONS: KVNamespace;
  LAB_CONTAINER: DurableObjectNamespace;
  COMPLETION_WEBHOOK_SECRET: string;
  ADMIN_USER_IDS?: string; // comma-separated list of admin user IDs
  ENVIRONMENT?: string;
}

// ============================================================================
// Database table types (lab tables added to shared shart-ctf-db)
// ============================================================================

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LabSession {
  session_id: string;    // {userId}:{labId}:{attemptId}
  user_id: string;
  lab_id: string;
  attempt_id: string;
  container_key: string; // same as session_id
  started_at: number;    // unix timestamp
  expires_at: number;
  last_active_at: number;
  status: 'active' | 'sleeping' | 'completed' | 'expired';
}

export interface LabCompletion {
  completion_id: string;
  session_id: string;
  user_id: string;
  lab_id: string;
  completed_at: number;
  checks_passed: number;
  checks_total: number;
  score: number;
}

export interface UsageEvent {
  event_id: string;
  session_id: string;
  event_type: 'started' | 'sleeping' | 'woke';
  occurred_at: number;
  instance_type: string;
}

export interface RateLimit {
  bucket_key: string;
  scope: string;
  identifier: string;
  bucket_start: number;
  window_ms: number;
  count: number;
  expires_at: string;
  updated_at: string;
}

// Kysely Database interface (only tables this worker needs)
export interface Database {
  sessions: Session;       // auth sessions — read-only for auth validation
  lab_sessions: LabSession;
  lab_completions: LabCompletion;
  usage_events: UsageEvent;
  rate_limits: RateLimit;  // shared rate limiting table (also used by platform-api)
}

// ============================================================================
// KV value shapes
// ============================================================================

export interface KVSession {
  attemptId: string;
  containerKey: string;
  labId: string;
  startedAt: number;
  expiresAt: number;
}
