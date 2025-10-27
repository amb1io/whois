// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const basePath = process.env.ASTRO_BASE_PATH ?? "/";

const dnsPolyfillPath = fileURLToPath(
  new URL("./src/polyfills/dns-promises.ts", import.meta.url)
);
const netPolyfillPath = fileURLToPath(
  new URL("./src/polyfills/net.ts", import.meta.url)
);
const prismaDefaultEsmPath = fileURLToPath(
  new URL("./src/lib/prisma-client-default.ts", import.meta.url)
);
const prismaDefaultPath = fileURLToPath(
  new URL("./node_modules/.prisma/client/default.js", import.meta.url)
);

// https://astro.build/config
export default defineConfig({
  output: "server",
  base: basePath,
  adapter: cloudflare({
    mode: "pages",
    platformProxy: {
      enabled: true,
      bindings: {
        domain_monitor: {
          d1DatabaseId: "8b21eb9b-08fb-47e5-889c-cd2a68181e0b",
        },
      },
    },
  }),
  vite: {
    plugins: [tailwindcss()],
    server: {
      watch: {
        ignored: ["**/.wrangler/**", "**/prisma/dev.db*"],
      },
    },
    resolve: {
      alias: {
        "dns/promises": dnsPolyfillPath,
        net: netPolyfillPath,
        ".prisma/client/default": prismaDefaultEsmPath,
      },
    },
    ssr: {
      noExternal: [
        "@prisma/client",
        ".prisma/client",
        ".prisma/client/default",
      ],
    },
  },
});
