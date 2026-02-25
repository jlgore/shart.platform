import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import type { Database, Env } from './types';

export function createDb(env: Env): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new D1Dialect({ database: env.DB }) as any,
  });
}

// Helper to generate UUIDs (nanoid is lighter than uuid)
export function generateId(): string {
  // Using crypto.randomUUID() which is available in Workers
  return crypto.randomUUID();
}

// Hash instance secret for storage
export async function hashInstanceSecret(secret: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time byte comparison (prevents timing attacks)
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// Derive a per-instance flag value for a given challenge.
// Uses HMAC-SHA256(flagKey, challengeId) truncated to 16 hex chars.
// The flag_key is stored plaintext server-side and never exposed to players.
// Cluster seeding uses the same derivation so flags are unique per instance.
export async function deriveFlag(flagKey: string, challengeId: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(flagKey),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(challengeId));
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return 'CTF{' + hex.slice(0, 16) + '}';
}

// Verify instance secret
export async function verifyInstanceSecret(
  secret: string,
  hashedSecret: string,
  salt: string
): Promise<boolean> {
  const hashed = await hashInstanceSecret(secret, salt);
  const enc = new TextEncoder();
  return timingSafeEqual(enc.encode(hashed), enc.encode(hashedSecret));
}
