#!/usr/bin/env bash
set -euo pipefail

zip="$1"

export CHROME_SERVICE_ACCOUNT_PRIVATE_KEY="${PRIVATE_KEY//\\n/$'\n'}"

pnpm --filter @lambe/extension exec wxt submit --chrome-zip "$zip"
