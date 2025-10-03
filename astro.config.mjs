// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';

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
});
