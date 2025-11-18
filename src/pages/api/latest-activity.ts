import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

type ActivityItem = {
  type: 'blog' | 'lab' | 'ctf';
  title: string;
  href: string;
  date: string;
  timestamp: number;
  external?: boolean;
};

function normalizeContentDate(input: Date): { date: Date; timestamp: number } {
  const y = input.getUTCFullYear();
  const m = input.getUTCMonth();
  const d = input.getUTCDate();
  const normalized = new Date(Date.UTC(y, m, d, 12, 0, 0));
  return { date: normalized, timestamp: normalized.getTime() };
}

export const GET: APIRoute = async ({ url }) => {
  const searchParams = new URL(url).searchParams;
  const limit = parseInt(searchParams.get('limit') || '6');
  const include = searchParams.get('include')?.split(',') || ['blog', 'labs'];

  const items: ActivityItem[] = [];

  if (include.includes('blog')) {
    const posts = await getCollection('blog', ({ data }) => data.draft !== true);
    const blogItems = posts.map((post) => {
      const { date, timestamp } = normalizeContentDate(new Date(post.data.date));
      const isLinkPost = post.data.isLinkPost === true && typeof post.data.externalLink === 'string';
      const href = isLinkPost ? post.data.externalLink! : `/blog/${post.slug}`;
      return {
        type: 'blog' as const,
        title: post.data.title,
        href,
        date: date.toISOString(),
        timestamp,
        external: isLinkPost || undefined,
      };
    });
    items.push(...blogItems);
  }

  if (include.includes('labs')) {
    const labs = await getCollection('labs', ({ data }) => data.draft !== true && data.isActive !== false);
    const labItems = labs.map((lab) => {
      const chosenDate = lab.data.lastUpdated ?? lab.data.publishedDate;
      const { date, timestamp } = normalizeContentDate(new Date(chosenDate));
      return {
        type: 'lab' as const,
        title: lab.data.title,
        href: `/labs/${lab.slug}`,
        date: date.toISOString(),
        timestamp,
      };
    });
    items.push(...labItems);
  }

  if (include.includes('ctf')) {
    const ctf = await getCollection('ctf', ({ data }) => data.draft !== true && data.isReleased === true);
    const ctfItems = ctf.map((challenge) => {
      const { date, timestamp } = normalizeContentDate(new Date(challenge.data.launchDate));
      return {
        type: 'ctf' as const,
        title: challenge.data.title,
        href: `/ctf/${challenge.slug}`,
        date: date.toISOString(),
        timestamp,
      };
    });
    items.push(...ctfItems);
  }

  const latestActivity = items
    .filter((i) => Number.isFinite(i.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);

  return new Response(JSON.stringify({ activities: latestActivity }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=600'
    }
  });
};