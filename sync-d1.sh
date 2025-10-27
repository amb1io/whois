#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SITE_DIR="$ROOT_DIR/site"
WORKER_DIR="$ROOT_DIR/worker-domain-monitoring"

SITE_STATE="$SITE_DIR/.wrangler/state"
SITE_TMP="$SITE_DIR/.wrangler/tmp"
WORKER_STATE="$WORKER_DIR/.wrangler/state"
WORKER_TMP="$WORKER_DIR/.wrangler/tmp"

mkdir -p "$SITE_DIR/.wrangler" "$WORKER_DIR/.wrangler"

if [ -d "$SITE_STATE" ]; then
  echo "Syncing site → worker state..."
  rsync -a --delete "$SITE_STATE" "$WORKER_DIR/.wrangler/"
fi

if [ -d "$WORKER_STATE" ]; then
  echo "Syncing worker → site state..."
  rsync -a --delete "$WORKER_STATE" "$SITE_DIR/.wrangler/"
fi

echo "Syncing temporary files..."
rsync -a --delete "$SITE_TMP" "$WORKER_DIR/.wrangler/" 2>/dev/null || true
rsync -a --delete "$WORKER_TMP" "$SITE_DIR/.wrangler/" 2>/dev/null || true

echo "Done."
