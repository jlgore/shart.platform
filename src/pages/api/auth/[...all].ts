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
  return auth.handler(request);
};
