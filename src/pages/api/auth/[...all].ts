import type { APIRoute } from 'astro';
import { createAuth } from '../../../lib/auth';

export const prerender = false;

export const ALL: APIRoute = async ({ request, locals }) => {
  const { env } = locals.runtime;

  if (!env.DB || !env.BETTER_AUTH_SECRET) {
    return new Response(JSON.stringify({ error: 'Auth not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const auth = createAuth(env);
  const res = await auth.handler(request);

  if ((env.ENVIRONMENT || '').toLowerCase() === 'development') {
    const pathname = new URL(request.url).pathname;
    const isSignInEmail = pathname.endsWith('/api/auth/sign-in/email');
    if (isSignInEmail) {
      const setCookie = res.headers.get('set-cookie') || '';
      const hasSetCookie = setCookie.length > 0;
      const hasSharedDomain = /domain=\.shart\.cloud/i.test(setCookie);
      const hasSecure = /;\s*secure/i.test(setCookie);
      const hasPathRoot = /path=\//i.test(setCookie);
      console.log('[auth-debug] sign-in response cookie attrs', {
        hasSetCookie,
        hasSharedDomain,
        hasSecure,
        hasPathRoot,
      });
    }
  }

  return res;
};
