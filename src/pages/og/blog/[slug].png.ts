import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { buildOgSvg, hostnameFromSite } from '../../../lib/og/buildOgImage';
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

  const templatePath = path.join(process.cwd(), 'public', 'og-win95-base.svg');
  const siteHostname = hostnameFromSite(import.meta.env.SITE ?? 'shart.platform');

  const svg = await buildOgSvg(
    {
      title: post.data.title,
      description: post.data.description,
      category: 'BLOG',
      // Surface tags as bullets if the frontmatter has them, otherwise leave empty
      bullets: (post.data.tags ?? []).slice(0, 3) as [string?, string?, string?],
      siteHostname,
      windowTitle: `${siteHostname} // Blog`,
    },
    templatePath
  );

  let png: Uint8Array;
  try {
    const Resvg = await getResvg();
    const fontOptions = await getFontOptions();
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, ...fontOptions });
    png = resvg.render().asPng();
  } catch (err) {
    return new Response(`OG render failed.\n${String(err)}`, {
      status: 500,
      headers: { 'content-type': 'text/plain' },
    });
  }

  return new Response(png as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
