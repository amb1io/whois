# domains-reseller

Monorepo for **Domain Alert** — WHOIS/RDAP lookup, domain monitoring subscriptions, and email notifications when monitored domains change or expire.

Built on Cloudflare Workers, D1, KV, and Pages. The three packages share the same D1 database (`domain-monitor`) in local development via `--persist-to ../.wrangler`.

## Project structure

### [`whois-scheduler/`](whois-scheduler/)

Scheduled Cloudflare Worker (cron: daily at 00:00 UTC). No public HTTP routes.

| Area | Purpose |
|------|---------|
| `src/sync.ts` | Fetches the IANA RDAP bootstrap file and updates `rdap_whois_server` when publication date changes |
| `src/sync-notify.ts` | Reads `rdap_whois_notify`, refreshes `rdap_whois_domains` when WHOIS changes or on expiration day |
| `src/email/` | Sends notification emails via AWS SES using HTML templates |
| `templates/` | Editable email templates (`domain-updated.html`, `domain-expiring.html`) |
| `migrations/` | D1 schema for `rdap_whois_server` and `rdap_whois_last_processed` |

Secrets and config: copy `.dev.vars.example` to `.dev.vars` (SES credentials, `FRONTEND_URL`).

### [`whois-api-search/`](whois-api-search/)

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

### [`whois-frontend/`](whois-frontend/)

Astro + Tailwind + HTMX + Alpine.js UI, deployed to Cloudflare Workers.

| Area | Purpose |
|------|---------|
| `src/pages/index.astro` | Main page: search, WHOIS results, monitor modal |
| `src/components/` | `SearchForm`, `WhoisResults`, `MonitorModal`, layout pieces |
| `.env` | `PUBLIC_DNS_SEARCH_API_URL`, `PUBLIC_DNS_NOTIFY_API_URL` for local API URLs |

Supports deep links: `?q=example.com` auto-fills the search form and loads results.

## Shared infrastructure

| Resource | Used by | Role |
|----------|---------|------|
| D1 `domain-monitor` | `whois-scheduler`, `whois-api-search` | RDAP servers, cached domains, notify subscriptions |
| KV `CACHE` | `whois-api-search` only | Fast RDAP response cache |
| AWS SES | `whois-scheduler` only | Email alerts to `notify_at` addresses |

RDAP helper logic is duplicated per worker (`whois-scheduler/src/`, `whois-api-search/src/`) so each package stays self-contained.

## Getting started

```bash
npm install

# Apply migrations (shared local D1 state)
npm run migrate:whois-scheduler:local
npm run migrate:whois-api-search:local

# Run services (use separate terminals)
npm run dev:whois-api-search   # http://localhost:8787
npm run dev:whois-scheduler    # cron via GET /__scheduled
npm run dev:whois-frontend     # http://localhost:4321
```

Trigger the whois-scheduler cron locally:

```bash
curl "http://localhost:8789/__scheduled?cron=0+0+*+*+*"   # if whois-scheduler on 8789
```

Run whois-api-search tests:

```bash
npm run test -w whois-api-search
```

## Deploy

```bash
npm run migrate:whois-scheduler:remote
npm run migrate:whois-api-search:remote
npm run deploy:whois-scheduler
npm run deploy:whois-api-search
npm run deploy:whois-frontend
```

Set production secrets for `whois-scheduler` with `wrangler secret put` (`AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`) and update `FRONTEND_URL` / API URLs in each package's `wrangler.jsonc` or environment.
