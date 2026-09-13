#!/usr/bin/env bash
set -euo pipefail

katalog_aplikacji="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plik_jednostki_repo="$katalog_aplikacji/deploy/rpi/ogarniacz.service"
plik_jednostki_systemowej="/etc/systemd/system/ogarniacz.service"
plik_env_repo="$katalog_aplikacji/deploy/rpi/ogarniacz.env.example"
plik_env_systemowy="/etc/ogarniacz/ogarniacz.env"
adres_health="http://127.0.0.1:8787/health"
liczba_prob_health=15
odstep_prob_health=1
cd "$katalog_aplikacji"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Zatrzymano: śledzone pliki zawierają lokalne zmiany. Zapisz je lub rozwiąż ręcznie przed wdrożeniem."
  exit 1
fi

git pull --ff-only
npm ci
npm run build:production

if [[ ! -f "$plik_env_systemowy" ]]; then
  echo "Zatrzymano: brakuje $plik_env_systemowy. Skrypt nie tworzy ani nie nadpisuje pliku z sekretami."
  exit 1
fi

brakujace_zmienne=()
opcjonalne_zmienne=" OWNER_BOOTSTRAP_TOKEN SYNC_USER_ID SYNC_ACCESS_KEY "
while IFS= read -r nazwa_zmiennej; do
  if [[ "$opcjonalne_zmienne" == *" $nazwa_zmiennej "* ]]; then
    continue
  fi
  if ! sudo grep --quiet --extended-regexp "^[[:space:]]*${nazwa_zmiennej}=" "$plik_env_systemowy"; then
    brakujace_zmienne+=("$nazwa_zmiennej")
  fi
done < <(sed -nE 's/^([A-Z][A-Z0-9_]*)=.*/\1/p' "$plik_env_repo")

if (( ${#brakujace_zmienne[@]} > 0 )); then
  echo "OSTRZEŻENIE: $plik_env_systemowy nie zawiera wymaganych wpisów:"
  printf '  - %s\n' "${brakujace_zmienne[@]}"
  echo "Uzupełnij je ręcznie. Skrypt nie wyświetla ani nie zmienia istniejących wartości."
fi

if ! sudo cmp --silent "$plik_jednostki_repo" "$plik_jednostki_systemowej"; then
  echo "Aktualizuję jednostkę systemd ogarniacz.service."
  sudo install -m 0644 "$plik_jednostki_repo" "$plik_jednostki_systemowej"
  sudo systemctl daemon-reload
fi

sudo systemctl enable ogarniacz
sudo systemctl restart ogarniacz

plik_odpowiedzi_health="$(mktemp)"
trap 'rm -f "$plik_odpowiedzi_health"' EXIT
health_ok=false
for ((numer_proby = 1; numer_proby <= liczba_prob_health; numer_proby++)); do
  kod_http="$(curl --silent --output "$plik_odpowiedzi_health" --write-out '%{http_code}' "$adres_health" || true)"
  if [[ "$kod_http" == "200" ]] && node -e '
    const fs = require("node:fs");
    const health = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (health.status !== "ok" || health.service !== "ogarniacz-api" || health.database !== "connected") process.exit(1);
  ' "$plik_odpowiedzi_health" 2>/dev/null; then
    health_ok=true
    break
  fi
  if (( numer_proby < liczba_prob_health )); then
    sleep "$odstep_prob_health"
  fi
done

if [[ "$health_ok" != true ]]; then
  echo "Błąd: Ogarniacz nie zwrócił prawidłowego JSON health z HTTP 200 po $liczba_prob_health próbach."
  sudo journalctl -u ogarniacz -n 100 --no-pager || true
  exit 1
fi

sudo systemctl --no-pager --full status ogarniacz
if command -v tailscale >/dev/null 2>&1; then
  sudo tailscale serve status
fi
echo "Ogarniacz odpowiada prawidłowo na $adres_health."
