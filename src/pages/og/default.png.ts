import type { APIRoute } from 'astro';
import { buildOgSvg, hostnameFromSite } from '../../lib/og/buildOgImage';
import path from 'node:path';
import { getResvg, getFontOptions } from '../../lib/og/resvg';

export const prerender = true;

export const GET: APIRoute = async () => {
  const templatePath = path.join(process.cwd(), 'public', 'og-win95-base.svg');
  const siteHostname = hostnameFromSite(import.meta.env.SITE ?? 'shart.platform');

  const svg = await buildOgSvg(
    {
      title: 'SHART.PLATFORM',
      description: 'Cloud security training — Courses, Labs, CTFs, Games',
      bullets: [
        'Hands-on labs in real AWS & Kubernetes environments',
        'CTF challenges that teach by breaking things',
        'Games that make scheduling and RBAC click',
      ],
      category: 'SHART',
      label: 'Cloud Security Training',
      siteHostname,
      windowTitle: `${siteHostname} // Training Terminal`,
    },
    templatePath
  );

  try {
    const Resvg = await getResvg();
    const fontOptions = await getFontOptions();
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, ...fontOptions });
    const png = resvg.render().asPng();
    return new Response(png as unknown as BodyInit, {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    return new Response(`OG render failed.\n${String(err)}`, {
      status: 500,
      headers: { 'content-type': 'text/plain' },
    });
  }
};
