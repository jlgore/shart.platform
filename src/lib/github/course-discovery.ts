import { GitHubREADMEFetcher } from './readme-fetcher.js';

export interface CourseDiscoveryInput {
  repo: string;
  ref: string;
  weekPattern: string;
  labPattern: string;
  token?: string;
}

export interface CourseDoc {
  path: string;
  kind: 'week' | 'lab';
  weekNumber: number;
  title: string;
}

const WEEK_DOC_RE = /^week-(\d+)\/README\.md$/i;
const LAB_DOC_RE = /^week-(\d+)\/labs\/([^/]+)\/README\.md$/i;
const LAB_DOC_ALT_RE = /^week-(\d+)\/(lab-[^/]+)\/README\.md$/i;

function toTitleFromSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function inferCourseDocFromPath(path: string): CourseDoc | null {
  const weekMatch = path.match(WEEK_DOC_RE);
  if (weekMatch) {
    const weekNumber = Number.parseInt(weekMatch[1], 10);
    return {
      path,
      kind: 'week',
      weekNumber,
      title: `Week ${weekNumber}`,
    };
  }

  const labMatch = path.match(LAB_DOC_RE);
  if (labMatch) {
    const weekNumber = Number.parseInt(labMatch[1], 10);
    const rawLabSlug = labMatch[2].replace(/^lab-\d+-/, '');
    return {
      path,
      kind: 'lab',
      weekNumber,
      title: toTitleFromSlug(rawLabSlug),
    };
  }

  const altLabMatch = path.match(LAB_DOC_ALT_RE);
  if (altLabMatch) {
    const weekNumber = Number.parseInt(altLabMatch[1], 10);
    const rawLabSlug = altLabMatch[2].replace(/^lab-\d+-/, '');
    return {
      path,
      kind: 'lab',
      weekNumber,
      title: toTitleFromSlug(rawLabSlug),
    };
  }

  return null;
}

export async function discoverCourseDocs(input: CourseDiscoveryInput): Promise<CourseDoc[]> {
  const fetcher = new GitHubREADMEFetcher({ token: input.token });
  const files = await fetcher.listRepoFiles(input.repo, input.ref);

  const weekRegex = new RegExp(input.weekPattern);
  const labRegex = new RegExp(input.labPattern);

  return files
    .filter((path) => weekRegex.test(path) || labRegex.test(path))
    .map(inferCourseDocFromPath)
    .filter((doc): doc is CourseDoc => doc !== null)
    .sort((a, b) => {
      if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber;
      if (a.kind !== b.kind) return a.kind === 'week' ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
}
