export type AuthMethod = 'bearer' | 'cookie';

export const TRUSTED_ORIGINS = [
  'https://shart.cloud',
  'https://www.shart.cloud',
  'http://localhost:4321',
  'http://localhost:8787',
  'http://localhost:8788',
] as const;

export function extractRequestOrigin(originHeader?: string, refererHeader?: string): string | null {
  if (originHeader) return originHeader;
  if (!refererHeader) return null;
  try {
    return new URL(refererHeader).origin;
  } catch {
    return null;
  }
}

export function shouldRejectCsrfForCookieAuth(
  authMethod: AuthMethod | undefined,
  requestOrigin: string | null,
  trustedOrigins: readonly string[] = TRUSTED_ORIGINS
): boolean {
  if (authMethod !== 'cookie') return false;
  if (!requestOrigin) return true;
  return !trustedOrigins.includes(requestOrigin);
}

export function buildRateLimitBucket(
  scope: string,
  identity: string,
  windowMs: number,
  nowMs: number
) {
  const bucketStart = Math.floor(nowMs / windowMs) * windowMs;
  const resetAt = bucketStart + windowMs;
  return {
    bucketKey: `${scope}:${identity}:${bucketStart}`,
    bucketStart,
    resetAt,
    nowIso: new Date(nowMs).toISOString(),
    expiresAt: new Date(resetAt + windowMs).toISOString(),
  };
}

export function isRateLimitExceeded(count: number, max: number): boolean {
  return count > max;
}
