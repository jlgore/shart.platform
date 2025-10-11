import type { MiddlewareHandler } from 'astro';

// Basic CSP suitable for DuckDB WASM (CDN worker) + Monaco
// If you later enable cross-origin isolation (SAB), uncomment COOP/COEP below

export const onRequest: MiddlewareHandler = async (context, next) => {
  const res = await next();

  const reqUrl = new URL(context.request.url);
  const selfOrigin = `${reqUrl.protocol}//${reqUrl.host}`;
  const devOrigins = [
    'http://localhost:4321',
    'http://127.0.0.1:4321',
    'https://dev.shart.cloud',
    'https://shart.cloud',
  ];

  const connectOrigins = [selfOrigin, ...devOrigins];
  const isDev = import.meta.env.DEV === true || import.meta.env.MODE === 'development';
  const duckdbAssetsBase = (import.meta as any).env?.PUBLIC_DUCKDB_ASSETS_BASE as string | undefined;
  let duckdbOrigin: string | undefined;
  try {
    duckdbOrigin = duckdbAssetsBase ? new URL(duckdbAssetsBase).origin : undefined;
  } catch {}

  // Build CSP directives programmatically for dev vs prod
  const scriptSrc = ["'self'", "'wasm-unsafe-eval'"]; // allow wasm eval; needed by duckdb
  if (isDev) {
    scriptSrc.push("'unsafe-eval'", "'unsafe-inline'");
  }
  const workerSrc = ["'self'"]; // vendored workers loaded from same or CDN origin
  const styleSrc = ["'self'", "'unsafe-inline'"]; // keep inline styles for now
  const imgSrc = ["'self'", 'data:', 'blob:'];
  const fontSrc = ["'self'", 'data:'];
  const connectSrc = ["'self'", ...connectOrigins];
  if (duckdbOrigin) {
    workerSrc.push(duckdbOrigin);
    connectSrc.push(duckdbOrigin);
  }

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `script-src ${scriptSrc.join(' ')}`,
    `worker-src ${workerSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    `img-src ${imgSrc.join(' ')}`,
    `font-src ${fontSrc.join(' ')}`,
    `connect-src ${Array.from(new Set(connectSrc)).join(' ')}`,
    "frame-ancestors 'none'",
  ].join('; ');

  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');

  // Optional: enable cross-origin isolation for best DuckDB performance (threads/COI bundle)
  // res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  // res.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

  return res;
};
