// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  integrations: [
    react(),
    mdx(),
    tailwind({
      applyBaseStyles: true,
    }),
  ],

  site: 'https://shart.cloud',
  adapter: cloudflare({
    imageService: 'compile'
  }),
  vite: {
    ssr: {
      external: ['node:path', 'node:fs/promises']
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'monaco': ['monaco-editor', '@monaco-editor/react'],
            'duckdb': ['@duckdb/duckdb-wasm'],
            'resvg': ['@resvg/resvg-js', '@resvg/resvg-wasm']
          }
        }
      }
    }
  }
});