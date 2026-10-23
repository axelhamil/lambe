#!/usr/bin/env bash
set -euo pipefail

output="${GITHUB_OUTPUT:-/dev/stdout}"
missing=()

for name in CHROME_EXTENSION_ID CHROME_PUBLISHER_ID CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL CHROME_SERVICE_ACCOUNT_PRIVATE_KEY; do
  if [ -z "${!name:-}" ]; then
    missing+=("$name")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "::notice::Chrome Web Store publish skipped, missing secrets: ${missing[*]}. See docs/store/publishing.md."
  echo "configured=false" >> "$output"
  exit 0
fi

echo "configured=true" >> "$output"
