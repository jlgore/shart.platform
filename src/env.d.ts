/// <reference types="astro/client" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DISCORD_SERVER_INVITE?: string;
  readonly DISCORD_INVITE_URL?: string;
  readonly PUBLIC_DUCKDB_ASSETS_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Cloudflare runtime bindings
type D1Database = import('@cloudflare/workers-types').D1Database;

interface CloudflareEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  API_BASE_URL?: string;
  ENVIRONMENT?: string;
}

type Runtime = import('@astrojs/cloudflare').Runtime<CloudflareEnv>;

declare namespace App {
  interface Locals extends Runtime {
    user: import('./lib/auth').SessionUser | null;
  }
}
