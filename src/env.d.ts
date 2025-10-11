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
