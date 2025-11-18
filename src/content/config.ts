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

// Labs collection for GitHub-based tutorials with branch progression
const labsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(['cloud-security', 'kubernetes', 'iam', 'ai', 'general']),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    tags: z.array(z.string()).default([]),

    // GitHub integration
    githubRepo: z.string(), // e.g., 'shart-cloud/aws-iam-lab'

    // Branch progression configuration
    branchPattern: z.string().default('branch-{step}-*'), // pattern for branch discovery
    totalSteps: z.number().optional(), // discovered at build time
    stepTitles: z.array(z.string()).optional(), // custom step names

    // Tutorial metadata
    estimatedTime: z.number(), // minutes per step
    prerequisites: z.array(z.string()).default([]),
    learningObjectives: z.array(z.string()),

    // Status and visibility
    isActive: z.boolean().default(true),
    draft: z.boolean().default(false),
    publishedDate: z.coerce.date(),
    lastUpdated: z.coerce.date().optional(),
    // Optional client-side variable schema for placeholder replacement in README content
    variables: z
      .array(
        z.object({
          key: z.string(), // e.g., 'WEB_SERVER_PUBLIC_IP'
          label: z.string().optional(),
          pattern: z.string().optional(), // optional regex for validation
          example: z.string().optional(),
        })
      )
      .default([]),
  }),
});

export const collections = {
  blog: blogCollection,
  bios: biosCollection,
  ctf: ctfCollection,
  labs: labsCollection,
  // Speaking engagements, conferences, streams, etc.
  events: defineCollection({
    type: 'content',
    schema: z.object({
      title: z.string(),
      description: z.string(),
      // Support date or datetime; coerce to Date
      startDate: z.coerce.date(),
      endDate: z.coerce.date().optional(), // for multi-day events
      allDay: z.boolean().default(false),
      speakers: z.array(z.string()).default([]), // free-text list
      // Optional: bios slugs to resolve rich speaker info from `bios` collection
      speakerBios: z.array(z.string()).default([]),
      // Optional timezone details for display (e.g., 'America/New_York' and label 'ET')
      timeZone: z.string().optional(),
      timeZoneLabel: z.string().optional(),
      location: z.string().optional(),
      url: z.string().url().optional(), // external event link/registration
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    }),
  }),
};
