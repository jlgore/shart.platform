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
  }),
});

export const collections = {
  blog: blogCollection,
  bios: biosCollection,
  ctf: ctfCollection,
  labs: labsCollection,
  // Catalog of site-hosted log packs used in the Log Lab
  logPacks: defineCollection({
    type: 'content',
    schema: z.object({
      title: z.string(),
      description: z.string(),
      packId: z.string(), // e.g., 'starter-vpc-cloudtrail'
      r2Key: z.string(), // key/path in R2 bucket, e.g., 'packs/starter-vpc-cloudtrail.tar.gz'
      sha256: z.string().length(64), // lowercase hex digest for integrity check
      sizeBytes: z.number(), // compressed size
      sources: z.array(
        z.enum(['vpc_flow', 'cloudtrail', 'alb', 'guardduty', 'cloudwatch', 'azure_activity', 'gcp_audit'])
      ),
      difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    }),
  }),
};
