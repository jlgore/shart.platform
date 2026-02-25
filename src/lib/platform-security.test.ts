import { describe, expect, it } from 'vitest';
import {
  TRUSTED_ORIGINS,
  buildRateLimitBucket,
  extractRequestOrigin,
  isRateLimitExceeded,
  shouldRejectCsrfForCookieAuth,
} from '../../platform-api/src/security';

describe('platform security helpers', () => {
  it('accepts trusted origin for cookie auth and rejects untrusted', () => {
    expect(shouldRejectCsrfForCookieAuth('cookie', TRUSTED_ORIGINS[0], TRUSTED_ORIGINS)).toBe(false);
    expect(shouldRejectCsrfForCookieAuth('cookie', 'https://evil.example', TRUSTED_ORIGINS)).toBe(true);
    expect(shouldRejectCsrfForCookieAuth('cookie', null, TRUSTED_ORIGINS)).toBe(true);
  });

  it('does not enforce CSRF for bearer auth', () => {
    expect(shouldRejectCsrfForCookieAuth('bearer', null, TRUSTED_ORIGINS)).toBe(false);
    expect(shouldRejectCsrfForCookieAuth(undefined, null, TRUSTED_ORIGINS)).toBe(false);
  });

  it('extracts origin from origin header or referer', () => {
    expect(extractRequestOrigin('https://shart.cloud', undefined)).toBe('https://shart.cloud');
    expect(extractRequestOrigin(undefined, 'https://www.shart.cloud/path?a=1')).toBe('https://www.shart.cloud');
    expect(extractRequestOrigin(undefined, 'not a valid url')).toBeNull();
  });

  it('builds stable rate-limit buckets', () => {
    const nowMs = 1_700_000_001_234;
    const bucket = buildRateLimitBucket('submit-answer', 'user-123', 60_000, nowMs);

    expect(bucket.bucketStart).toBe(1_699_999_980_000);
    expect(bucket.resetAt).toBe(1_700_000_040_000);
    expect(bucket.bucketKey).toBe('submit-answer:user-123:1699999980000');
    expect(bucket.nowIso).toBe('2023-11-14T22:13:21.234Z');
    expect(bucket.expiresAt).toBe('2023-11-14T22:15:00.000Z');
  });

  it('flags counts over max as exceeded', () => {
    expect(isRateLimitExceeded(10, 10)).toBe(false);
    expect(isRateLimitExceeded(11, 10)).toBe(true);
  });
});
