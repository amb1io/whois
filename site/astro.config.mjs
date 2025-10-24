// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    mode: 'pages',
    platformProxy: {
      enabled: true,
      bindings: {
        domain_monitor: {
          d1DatabaseId: '8b21eb9b-08fb-47e5-889c-cd2a68181e0b'
        }
      }
    }
  }),
  vite: {
    plugins: [tailwindcss()],
    server: {
      watch: {
        ignored: ['**/.wrangler/**', '**/prisma/dev.db*']
      }
    }
  }
});
