#!/usr/bin/env bash
# Push Weeztix env keys from .env.local to Vercel (production + preview + development).
# Gebruik: npm run env:push:weeztix
set -euo pipefail
cd "$(dirname "$0")/.."

KEYS=(
  WEEZTIX_API_URL
  WEEZTIX_CLIENT_ID
  WEEZTIX_CLIENT_SECRET
  WEEZTIX_REDIRECT_URI
  WEEZTIX_ACCESS_TOKEN
  WEEZTIX_REFRESH_TOKEN
  WEEZTIX_COMPANY_GUID
)

if [[ ! -f .env.local ]]; then
  echo ".env.local ontbreekt"
  exit 1
fi

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

for key in "${KEYS[@]}"; do
  val=$(grep -E "^${key}=" .env.local | tail -1 | cut -d= -f2- || true)
  if [[ -z "${val}" ]]; then
    echo "skip $key (leeg)"
    continue
  fi
  printf '%s' "$val" > "$tmpdir/$key"
  for envname in production preview development; do
    # remove existing then add (vercel has no simple upsert in all versions)
    npx vercel env rm "$key" "$envname" --yes >/dev/null 2>&1 || true
    cat "$tmpdir/$key" | npx vercel env add "$key" "$envname" --yes >/dev/null
    echo "ok $key → $envname"
  done
done

echo "Klaar. Redeploy production indien nodig: npx vercel --prod"
