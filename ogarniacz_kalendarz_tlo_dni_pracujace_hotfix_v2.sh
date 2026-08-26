#!/usr/bin/env bash
set -Eeuo pipefail

REPO="${1:-/c/GitHub/Projects/Ogarniacz/Ogarniacz}"
FILE="$REPO/src/modules/czas/WidokiCzasu.tsx"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$(dirname "$REPO")/.ogarniacz-patch-backup/kalendarz-dni-pracujace-hotfix-$STAMP"
LOG="$BACKUP_DIR/walidacja.log"

fail() {
  echo >&2
  echo "BŁĄD: $*" >&2
  exit 1
}

for cmd in git node npm; do
  command -v "$cmd" >/dev/null 2>&1 || fail "Brak polecenia '$cmd' w PATH."
done

[[ -d "$REPO/.git" ]] || fail "Nie znaleziono repo: $REPO"
[[ -f "$FILE" ]] || fail "Brak pliku: $FILE"

mkdir -p "$BACKUP_DIR"
cp -p "$FILE" "$BACKUP_DIR/WidokiCzasu.tsx.before"
: > "$LOG"

cd "$REPO"

echo "============================================================"
echo " Ogarniacz — HOTFIX tła dni pracujących"
echo "============================================================"
echo

echo "[1/4] Poprawa warunku urlopu"

node <<'NODE'
const fs = require('fs')

const file = 'src/modules/czas/WidokiCzasu.tsx'
let text = fs.readFileSync(file, 'utf8')

const oldExpr =
  'Boolean(pracuje) && !Boolean(urlopyTegoDnia) && !Boolean(swieto)'
const newExpr =
  'pracuje && urlopyTegoDnia.length === 0 && !swieto'

if (text.includes(newExpr)) {
  console.log('Warunek jest już poprawiony — nic nie zmieniam.')
} else if (text.includes(oldExpr)) {
  text = text.replace(oldExpr, newExpr)
  fs.writeFileSync(file, text.replace(/\r\n/g, '\n'), 'utf8')
  console.log('OK: poprawiono warunek dnia pracującego.')
} else {
  console.error('Nie znaleziono oczekiwanego warunku. Przerywam bez zgadywania.')
  process.exit(1)
}
NODE

echo
echo "[2/4] Podgląd zmiany"
git diff -- src/modules/czas/WidokiCzasu.tsx

FAILED=0

echo
echo "[3/4] Typecheck + build + lint"

if npm run typecheck 2>&1 | tee -a "$LOG"; then :; else FAILED=1; fi
if npm run build 2>&1 | tee -a "$LOG"; then :; else FAILED=1; fi
if npm run lint 2>&1 | tee -a "$LOG"; then :; else FAILED=1; fi

if [[ "$FAILED" -ne 0 ]]; then
  echo
  echo "Walidacja nie przeszła — przywracam tylko WidokiCzasu.tsx sprzed hotfixa."
  cp -p "$BACKUP_DIR/WidokiCzasu.tsx.before" "$FILE"
  fail "Hotfix cofnięty."
fi

echo
echo "[4/4] Kontrola końcowa"
grep -n "kalendarz-dzien--pracujacy" src/modules/czas/WidokiCzasu.tsx || true

echo
echo "============================================================"
echo " GOTOWE"
echo "============================================================"
echo "Warunek działa teraz jako:"
echo "  pracuje && urlopyTegoDnia.length === 0 && !swieto"
echo
echo "Czyli:"
echo "  - dzień pracujący + brak urlopu + brak święta => tło dnia pracującego"
echo "  - urlop => brak tła dnia pracującego"
echo "  - święto => brak tła dnia pracującego"
echo
echo "Backup: $BACKUP_DIR"
echo "Patch nie wykonał commit ani push."
