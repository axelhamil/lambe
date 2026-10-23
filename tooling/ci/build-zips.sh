#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

output="${GITHUB_OUTPUT:-/dev/stdout}"

pnpm --filter @lambe/extension exec wxt zip -b chrome
pnpm --filter @lambe/extension check:manifest

LAMBE_STORE=1 pnpm --filter @lambe/extension exec wxt zip -b chrome
LAMBE_STORE=1 pnpm --filter @lambe/extension check:manifest

unpacked=(apps/extension/.output/*-chrome.zip)
store=(apps/extension/.output/*-chrome-store.zip)

if [ "${#unpacked[@]}" -ne 1 ] || [ "${#store[@]}" -ne 1 ]; then
  echo "::error::Expected 1 unpacked and 1 store zip, found ${#unpacked[@]} and ${#store[@]}"
  exit 1
fi

echo "unpacked=$(realpath "${unpacked[0]}")" >> "$output"
echo "store=$(realpath "${store[0]}")" >> "$output"
