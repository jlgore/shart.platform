/**
 * Auth helper utilities for SSR pages
 */

import type { AstroGlobal } from 'astro';

/**
 * Extract raw cookie header from request
 */
export function getAuthCookieHeader(Astro: AstroGlobal): string | null {
  return Astro.request.headers.get('cookie');
}

/**
 * Require authentication - redirects to login if not authenticated
 * Returns cookie header if authenticated
 */
export function requireAuth(Astro: AstroGlobal): string {
  const user = Astro.locals.user;
  const cookieHeader = getAuthCookieHeader(Astro);

  if (!user || !cookieHeader) {
    const returnUrl = encodeURIComponent(Astro.url.pathname);
    throw Astro.redirect(`/auth/login?redirect=${returnUrl}`);
  }

  return cookieHeader;
}
