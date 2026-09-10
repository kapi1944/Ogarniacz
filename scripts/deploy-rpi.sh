#!/usr/bin/env bash
set -euo pipefail

katalog_aplikacji="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$katalog_aplikacji"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Zatrzymano: katalog roboczy zawiera lokalne zmiany. Zapisz je lub rozwiąż ręcznie przed wdrożeniem."
  exit 1
fi

git pull --ff-only
npm ci
npm run build:production
sudo systemctl restart ogarniacz
sudo systemctl --no-pager --full status ogarniacz
curl --fail --silent --show-error http://127.0.0.1:8787/health
echo
if command -v tailscale >/dev/null 2>&1; then
  sudo tailscale serve status
fi
echo "Ogarniacz odpowiada lokalnie; dostęp zdalny prowadzi przez HTTPS Tailscale Serve."
