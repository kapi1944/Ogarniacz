#!/usr/bin/env bash
set -euo pipefail

if ! command -v tailscale >/dev/null 2>&1; then
  echo "Brak Tailscale. Zainstaluj oficjalny pakiet dla Raspberry Pi i wykonaj: sudo tailscale up"
  exit 1
fi

if ! systemctl is-active --quiet tailscaled; then
  echo "Usługa tailscaled nie działa."
  exit 1
fi

curl --fail --silent --show-error http://127.0.0.1:8787/health >/dev/null
sudo tailscale serve --bg 8787

nazwa_dns="$(sudo tailscale status --json | node -e "let dane='';process.stdin.on('data',x=>dane+=x);process.stdin.on('end',()=>process.stdout.write(JSON.parse(dane).Self.DNSName.replace(/\\.$/,'')))")"
adres_https="https://${nazwa_dns}"
curl --fail --silent --show-error "${adres_https}/health" >/dev/null
sudo tailscale serve status
echo "HTTPS działa: ${adres_https}"
echo "Ustaw ten origin w CORS_ALLOWED_ORIGINS oraz jako VITE_SYNC_API_URL w następnym buildzie klienta."
