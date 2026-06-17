/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_DNS_SEARCH_API_URL: string;
  readonly PUBLIC_DNS_NOTIFY_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
