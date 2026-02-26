import { defineMiddleware } from 'astro:middleware';
import { createAuth } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);

  // Redirect www to apex domain
  if (url.hostname === 'www.shart.cloud') {
    url.hostname = 'shart.cloud';
    return Response.redirect(url.toString(), 301);
  }

  context.locals.user = null;
  const env = context.locals.runtime?.env;
  if (env?.DB && env?.BETTER_AUTH_SECRET) {
    const auth = createAuth(env);
    const session = await auth.api.getSession({ headers: context.request.headers }).catch(() => null);
    if (session?.user) {
      context.locals.user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image ?? null,
      };
    }
  }

  return next();
});
