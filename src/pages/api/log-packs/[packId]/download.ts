import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals, request }) => {
  const packId = params.packId!;
  const packs = await getCollection('logPacks', ({ data }) => data.draft !== true);
  const entry = packs.find((p) => p.data.packId === packId);
  if (!entry) return new Response('Not Found', { status: 404 });
  const { r2Key, sizeBytes } = entry.data as any;

  // Try Cloudflare Workers R2 binding first (env.PACKS). This streams from private bucket without CORS.
  const env = locals?.runtime?.env as { PACKS?: R2Bucket } | undefined;
  if (env?.PACKS) {
    const obj = await env.PACKS.get(r2Key);
    if (!obj) return new Response('Not Found', { status: 404 });
    const headers = new Headers(obj.httpMetadata as any);
    headers.set('content-type', 'application/gzip');
    if (sizeBytes) headers.set('content-length', String(sizeBytes));
    headers.set('cache-control', 'private, no-store');
    return new Response(obj.body, { status: 200, headers });
  }

  // Fallback: proxy from base URL env (PUBLIC_R2_LOGS_BASE_URL)
  const base = import.meta.env.PUBLIC_R2_LOGS_BASE_URL;
  const upstream = base
    ? new URL(r2Key, base.endsWith('/') ? base : base + '/').toString()
    : new URL(r2Key.startsWith('/') ? r2Key : `/${r2Key}`, request.url).toString();
  const res = await fetch(upstream, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    return new Response('Upstream fetch failed', { status: 502 });
  }
  const headers = new Headers(res.headers);
  headers.set('cache-control', 'private, no-store');
  return new Response(res.body, { status: 200, headers });
};

// Cloudflare type annotation for local dev
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type R2Bucket = {
  get: (key: string) => Promise<{ body: ReadableStream; httpMetadata?: Record<string, string> } | null>;
};
