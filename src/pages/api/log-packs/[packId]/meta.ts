import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const packId = params.packId!;
  const packs = await getCollection('logPacks', ({ data }) => data.draft !== true);
  const entry = packs.find((p) => p.data.packId === packId);
  if (!entry) {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
  }
  const { title, description, packId: id, r2Key, sha256, sizeBytes, sources, difficulty, tags } = entry.data as any;
  return new Response(
    JSON.stringify({
      title,
      description,
      packId: id,
      r2Key,
      sha256,
      sizeBytes,
      sources,
      difficulty,
      tags,
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }
  );
};

