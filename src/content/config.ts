import { defineCollection, z } from 'astro:content';

const blogCollection = defineCollection({
  type: 'content',
  schema: z
    .object({
      title: z.string(),
      description: z.string(),
      date: z.coerce.date(),
      author: z.string(),
      category: z.enum(['cloud-security', 'ctf-writeups', 'tutorials', 'rants']),
      tags: z.array(z.string()),
      difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
      readTime: z.number(),
      image: z.string().optional(),
      draft: z.boolean().default(false),

      // Linked-list style external posts
      isLinkPost: z.boolean().default(false),
      externalLink: z
        .string()
        .url()
        .optional()
        .refine((url) => {
          if (!url) return true;
          try {
            const host = new URL(url).hostname.replace(/^www\./, '');
            return host === 'jaredgore.com' || host === 'lizgore.com';
          } catch {
            return false;
          }
        }, 'externalLink must be on jaredgore.com or lizgore.com'),
    })
    .superRefine((val, ctx) => {
      if (val.isLinkPost && !val.externalLink) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'externalLink is required when isLinkPost is true' });
      }
    }),
});

const biosCollection = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    role: z.string(),
    bio: z.string(),
    image: z.string().optional(),
    bluesky: z.string().optional(),
    github: z.string().optional(),
    website: z.string().optional(),
    order: z.number(),
  }),
});

// CTF challenges collection
const ctfCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    launchDate: z.coerce.date(),
    category: z.enum(['aws', 'azure', 'gcp', 'kubernetes', 'iam', 'ai']),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    repoUrl: z.string().url(),
    downloads: z
      .array(
        z.object({
          label: z.string(),
          url: z.string().url(),
        })
      )
      .default([]),
    tags: z.array(z.string()).default([]),
    isReleased: z.boolean().default(false),
    releaseLabel: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = {
  blog: blogCollection,
  bios: biosCollection,
  ctf: ctfCollection,
};
