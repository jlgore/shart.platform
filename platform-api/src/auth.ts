import { betterAuth } from 'better-auth';
import { D1Dialect } from 'kysely-d1';
import { Kysely } from 'kysely';
import type { Env } from './types';

export function createAuth(env: Env) {
  // Create Kysely instance with D1 dialect for better-auth
  const db = new Kysely<any>({
    dialect: new D1Dialect({ database: env.DB }) as any,
  });

  const isProd = env.ENVIRONMENT === 'production';

  return betterAuth({
    database: {
      db,
      type: 'sqlite',  // Use sqlite type for proper D1/SQLite date handling
    },
    secret: env.BETTER_AUTH_SECRET,
    // Map to existing plural table names
    user: {
      modelName: 'users',
    },
    session: {
      modelName: 'sessions',
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
    },
    account: {
      modelName: 'accounts',
    },
    verification: {
      modelName: 'verifications',
    },
    baseURL: isProd ? 'https://platform.shart.cloud' : 'http://localhost:8787',
    trustedOrigins: [
      'https://shart.cloud',
      'https://www.shart.cloud',
      'https://platform.shart.cloud',
      'http://localhost:4321',
      'http://localhost:8787',
      'http://localhost:8788',
    ],
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'],
        ipv6Subnet: 64,
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': {
          window: 60,
          max: 10,
        },
        '/sign-up/email': {
          window: 600,
          max: 5,
        },
        '/request-password-reset': {
          window: 600,
          max: 5,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
