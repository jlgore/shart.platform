/**
 * Auth helper utilities for SSR pages
 */

import type { AstroGlobal } from 'astro';

/**
 * Extract session token from request cookies
 */
export function getSessionToken(Astro: AstroGlobal): string | null {
  const cookieHeader = Astro.request.headers.get('cookie') || '';
  const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Require authentication - redirects to login if not authenticated
 * Returns the session token if authenticated
 */
export function requireAuth(Astro: AstroGlobal): string {
  const user = Astro.locals.user;
  const sessionToken = getSessionToken(Astro);

  if (!user || !sessionToken) {
    const returnUrl = encodeURIComponent(Astro.url.pathname);
    throw Astro.redirect(`/auth/login?redirect=${returnUrl}`);
  }

  return sessionToken;
}
