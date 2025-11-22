import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);

  // Redirect www to apex domain
  if (url.hostname === 'www.shart.cloud') {
    url.hostname = 'shart.cloud';
    return Response.redirect(url.toString(), 301);
  }

  return next();
});
