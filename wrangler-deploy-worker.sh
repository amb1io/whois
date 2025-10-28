#!/usr/bin/env bash
set -euo pipefail

npm install --prefix worker-domain-monitoring --loglevel error
npx --yes --prefix worker-domain-monitoring wrangler deploy --config worker-domain-monitoring/wrangler.toml
