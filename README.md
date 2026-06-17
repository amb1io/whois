# domains-reseller

Monorepo for **Domain Alert** — WHOIS/RDAP lookup, domain monitoring subscriptions, and email notifications when monitored domains change or expire.

Built on Cloudflare Workers, D1, KV, and Pages. The three packages share the same D1 database (`demos`) in local development via `--persist-to ../.wrangler`.

## Project structure

### [`dns-list/`](dns-list/)

Scheduled Cloudflare Worker (cron: daily at 00:00 UTC). No public HTTP routes.

| Area | Purpose |
|------|---------|
| `src/sync.ts` | Fetches the IANA RDAP bootstrap file and updates `rdap_whois_server` when publication date changes |
| `src/sync-notify.ts` | Reads `rdap_whois_notify`, refreshes `rdap_whois_domains` when WHOIS changes or on expiration day |
| `src/email/` | Sends notification emails via AWS SES using HTML templates |
| `templates/` | Editable email templates (`domain-updated.html`, `domain-expiring.html`) |
| `migrations/` | D1 schema for `rdap_whois_server` and `rdap_whois_last_processed` |

Secrets and config: copy `.dev.vars.example` to `.dev.vars` (SES credentials, `FRONTEND_URL`).

### [`dns-search/`](dns-search/)

HTTP API Worker (Hono) used by the frontend.

| Endpoint | Purpose |
|----------|---------|
| `POST /search` | Resolve domain RDAP (KV → D1 → upstream), return JSON |
| `POST /notify` | Create or update a row in `rdap_whois_notify` |

| Area | Purpose |
|------|---------|
| `src/routes/` | Route handlers for search and notify |
| `src/resolve-rdap.ts` | Shared RDAP resolution with cache layers |
| `migrations/` | D1 schema for `rdap_whois_domains` and `rdap_whois_notify` |

Uses D1 for persistence and KV for response cache. Includes Vitest tests (e.g. `.com.br` RDAP URL handling).

### [`frontend/`](frontend/)

Astro + Tailwind + HTMX + Alpine.js UI, deployed to Cloudflare Pages.

| Area | Purpose |
|------|---------|
| `src/pages/index.astro` | Main page: search, WHOIS results, monitor modal |
| `src/components/` | `SearchForm`, `WhoisResults`, `MonitorModal`, layout pieces |
| `.env` | `PUBLIC_DNS_SEARCH_API_URL`, `PUBLIC_DNS_NOTIFY_API_URL` for local API URLs |

Supports deep links: `?q=example.com` auto-fills the search form and loads results.

## Shared infrastructure

| Resource | Used by | Role |
|----------|---------|------|
| D1 `demos` | `dns-list`, `dns-search` | RDAP servers, cached domains, notify subscriptions |
| KV `CACHE` | `dns-search` only | Fast RDAP response cache |
| AWS SES | `dns-list` only | Email alerts to `notify_at` addresses |

RDAP helper logic is duplicated per worker (`dns-list/src/`, `dns-search/src/`) so each package stays self-contained.

## Getting started

```bash
npm install

# Apply migrations (shared local D1 state)
npm run migrate:dns-list:local
npm run migrate:dns-search:local

# Run services (use separate terminals)
npm run dev:dns-search   # http://localhost:8787
npm run dev:dns-list     # cron via GET /__scheduled
npm run dev:frontend     # http://localhost:4321
```

Trigger the dns-list cron locally:

```bash
curl "http://localhost:8787/__scheduled?cron=0+0+*+*+*"   # if dns-list on 8787
```

Run dns-search tests:

```bash
npm run test -w dns-search
```

## Deploy

```bash
npm run migrate:dns-list:remote
npm run migrate:dns-search:remote
npm run deploy:dns-list
npm run deploy:dns-search
npm run deploy:frontend
```

Set production secrets for `dns-list` with `wrangler secret put` (`AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`) and update `FRONTEND_URL` / frontend API URLs in each package's `wrangler.jsonc` or environment.
