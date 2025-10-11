import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { buildOgSvg } from '../../../lib/og/buildOgImage';
import path from 'node:path';
import { getResvg, getFontOptions } from '../../../lib/og/resvg';

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getCollection('blog', ({ data }) => data.draft !== true);
  return posts.map((p) => ({ params: { slug: p.slug } }));
};

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug as string;
  const posts = await getCollection('blog');
  const post = posts.find((p) => p.slug === slug);

  if (!post) {
    return new Response('Not found', { status: 404 });
  }

  const svg = await buildOgSvg({
    title: post.data.title,
    description: post.data.description,
    templatePath: path.join(process.cwd(), 'public', 'og-blank.svg'),
  });

  // Render SVG to PNG via @resvg/resvg-wasm (init once per process)
  let png: Uint8Array;
  try {
    const Resvg = await getResvg();
    const fontOptions = await getFontOptions();
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, ...fontOptions });
    png = resvg.render().asPng();
  } catch (err) {
    return new Response(
      `@resvg/resvg-wasm not available or failed to run.\n${String(err)}`,
      { status: 500, headers: { 'content-type': 'text/plain' } }
    );
  }

  return new Response(png, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      // Cache aggressively; images are content-addressed by slug
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
