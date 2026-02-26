import { betterAuth } from 'better-auth';
import { D1Dialect } from 'kysely-d1';
import { Kysely } from 'kysely';
import type { Env } from './types';
import type { AuthMethod } from './security';

type SessionLookupResult = {
  userId: string;
  authMethod: AuthMethod;
};

function detectAuthMethod(headers: Headers): AuthMethod | null {
  const authHeader = headers.get('Authorization');
  const cookieHeader = headers.get('Cookie') || '';
  if (authHeader?.startsWith('Bearer ')) return 'bearer';
  if (/better-auth\.session_token/.test(cookieHeader)) return 'cookie';
  return null;
}

export async function resolveSessionFromRequest(
  env: Env,
  headers: Headers
): Promise<SessionLookupResult | null> {
  const authMethod = detectAuthMethod(headers);
  if (!authMethod) return null;

  const auth = createAuth(env);

  const currentSession = await auth.api.getSession({ headers }).catch(() => null);
  if (!currentSession) return null;

  return {
    userId: currentSession.user.id,
    authMethod,
  };
}

export function createAuth(env: Env) {
  // Create Kysely instance with D1 dialect for better-auth
  const db = new Kysely<any>({
    dialect: new D1Dialect({ database: env.DB }) as any,
  });

  const isProd = env.ENVIRONMENT === 'production';
  const emailFrom = env.AUTH_FROM_EMAIL || 'SHART Cloud <onboarding@resend.dev>';
  const trustedOrigins = [
    'https://shart.cloud',
    'https://www.shart.cloud',
    'https://platform.shart.cloud',
    ...(isProd
      ? []
      : [
          'http://localhost:4321',
          'http://localhost:8787',
          'http://localhost:8788',
        ]),
  ];

  const sendVerificationEmail = async ({ user, url }: { user: { email: string; name?: string | null }; url: string }) => {
    if (!env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not configured; skipping verification email send');
      return;
    }

    const subject = 'Verify your SHART.CLOUD account';
    const displayName = user.name || user.email;
    const text = `Hey ${displayName},\n\nVerify your account: ${url}\n\nIf you did not sign up, you can ignore this email.`;
    const html = `<p>Hey ${displayName},</p><p>Verify your account:</p><p><a href="${url}">${url}</a></p><p>If you did not sign up, you can ignore this email.</p>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom,
        to: user.email,
        subject,
        text,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend error: ${res.status} ${body}`);
    }
  };

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
    trustedOrigins,
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
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
