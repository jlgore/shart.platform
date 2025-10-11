import type { APIRoute } from 'astro';
import { buildOgSvg } from '../../lib/og/buildOgImage';
import path from 'node:path';
import { getResvg, getFontOptions } from '../../lib/og/resvg';

export const prerender = true;

export const GET: APIRoute = async () => {
  const svg = await buildOgSvg({
    title: 'SHART.CLOUD',
    author: 'Cloud Security, But Weird',
    description: 'Blog, CTFs, labs and irreverent training',
    templatePath: path.join(process.cwd(), 'public', 'og-blank.svg'),
  });

  try {
    const Resvg = await getResvg();
    const fontOptions = await getFontOptions();
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, ...fontOptions });
    const png = resvg.render().asPng();
    return new Response(png, {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    return new Response(
      `@resvg/resvg-wasm not available or failed to run.\n${String(err)}`,
      { status: 500, headers: { 'content-type': 'text/plain' } }
    );
  }
};
