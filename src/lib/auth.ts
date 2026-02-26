import { betterAuth } from 'better-auth';
import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

export interface AuthSession {
  user: SessionUser;
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
}

// Create auth instance - must be called with runtime env
export function createAuth(env: { DB: D1Database; BETTER_AUTH_SECRET: string; ENVIRONMENT?: string }) {
  const runtimeEnv = env.ENVIRONMENT?.toLowerCase();
  const isProd = runtimeEnv ? runtimeEnv === 'production' : import.meta.env.PROD;
  const isDevDeploy = runtimeEnv === 'development';
  const baseURL = isProd
    ? 'https://shart.cloud'
    : isDevDeploy
      ? 'https://dev.shart.cloud'
      : 'http://localhost:8788';

  // Create Kysely instance with D1 dialect
  const db = new Kysely<any>({
    dialect: new D1Dialect({ database: env.DB }),
  });

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
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutes
      },
    },
    account: {
      modelName: 'accounts',
    },
    verification: {
      modelName: 'verifications',
    },
    baseURL,
    trustedOrigins: [
      'https://shart.cloud',
      'https://www.shart.cloud',
      'https://platform.shart.cloud',
      ...(isProd ? [] : ['https://dev.shart.cloud']),
      ...(isProd
        ? []
        : [
            'http://localhost:4321',
            'http://localhost:8788',
            'http://127.0.0.1:8788',
          ]),
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
      requireEmailVerification: true,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
