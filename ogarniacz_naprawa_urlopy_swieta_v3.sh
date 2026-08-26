#!/usr/bin/env bash
set -Eeuo pipefail

PATCH_ID="OGARNIACZ_NAPRAWA_URLOPY_SWIETA_V3"
REPO="/c/GitHub/Projects/Ogarniacz/Ogarniacz"
BACKUP_ROOT="/c/GitHub/Projects/Ogarniacz/Ogarniacz_patch_backups"

echo "============================================================"
echo " Ogarniacz — naprawa patcha urlopy + polskie święta"
echo " Patch: ${PATCH_ID}"
echo " Repo:  ${REPO}"
echo "============================================================"

if [[ ! -d "${REPO}/.git" ]]; then
  echo "BŁĄD: Nie znaleziono repozytorium: ${REPO}"
  exit 1
fi

cd "${REPO}"

if ! command -v node >/dev/null 2>&1; then
  echo "BŁĄD: Nie znaleziono Node.js."
  exit 1
fi

echo
echo "Node: $(node --version)"
echo "npm:  $(npm --version)"

STEMPEL="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${PATCH_ID}_${STEMPEL}"
mkdir -p "${BACKUP_DIR}"

echo
echo "== Stan Git przed naprawą =="
git --no-pager status --short --branch || true

echo
echo "== Backup plików naprawianych =="
PLIKI=(
  "src/modules/czas/WidokiCzasu.tsx"
  "vite.config.ts"
  ".gitignore"
)

if [[ -f "src/domain/ustaleniaGlosowe.ts" ]]; then
  PLIKI+=("src/domain/ustaleniaGlosowe.ts")
fi

for plik in "${PLIKI[@]}"; do
  if [[ -f "${plik}" ]]; then
    mkdir -p "${BACKUP_DIR}/$(dirname "${plik}")"
    cp -p "${plik}" "${BACKUP_DIR}/${plik}"
  fi
done

echo "Backup: ${BACKUP_DIR}"

echo
echo "== Przeniesienie starych backupów poza repo =="
if [[ -d ".patch-backups" ]]; then
  mkdir -p "${BACKUP_ROOT}"
  STARE="${BACKUP_ROOT}/stare_backupy_z_repo_${STEMPEL}"
  mv ".patch-backups" "${STARE}"
  echo "Przeniesiono .patch-backups -> ${STARE}"
else
  echo "Brak .patch-backups w repo — OK"
fi

export PATCH_ID

node <<'NODE'
const fs = require('fs')
const path = require('path')

const root = process.cwd()
const p = (rel) => path.join(root, rel)
const read = (rel) => fs.readFileSync(p(rel), 'utf8')
const write = (rel, text) => fs.writeFileSync(p(rel), text, 'utf8')

function replaceOnce(text, oldText, newText, label) {
  const first = text.indexOf(oldText)
  if (first < 0) throw new Error(`${label}: nie znaleziono kotwicy`)
  const second = text.indexOf(oldText, first + oldText.length)
  if (second >= 0) throw new Error(`${label}: kotwica występuje więcej niż raz`)
  return text.slice(0, first) + newText + text.slice(first + oldText.length)
}

console.log('== 1/4 Naprawa nieprawidłowych znaków w WidokiCzasu.tsx ==')
{
  const rel = 'src/modules/czas/WidokiCzasu.tsx'
  let text = read(rel)

  const startMarker = 'function SekcjaKalendarzaGrafiku()'
  const endMarker = 'export function WidokGrafiku()'
  const start = text.indexOf(startMarker)
  const end = text.indexOf(endMarker, start >= 0 ? start : 0)

  if (start < 0 || end < 0 || end <= start) {
    throw new Error('WidokiCzasu.tsx: nie znaleziono sekcji kalendarza dodanej przez patch v2')
  }

  const before = text.slice(0, start)
  let section = text.slice(start, end)
  const after = text.slice(end)

  const escapedBackticks = (section.match(/\\`/g) || []).length
  const escapedTemplates = (section.match(/\\\$\{/g) || []).length

  section = section
    .replace(/\\`/g, '`')
    .replace(/\\\$\{/g, '${')

  text = before + section + after
  write(rel, text)

  console.log(`  usunięto błędne \\ przed backtickami: ${escapedBackticks}`)
  console.log(`  usunięto błędne \\ przed \${...}: ${escapedTemplates}`)

  if (/\\`/.test(section) || /\\\$\{/.test(section)) {
    throw new Error('WidokiCzasu.tsx: nadal pozostały nieprawidłowe escape w sekcji kalendarza')
  }
}

console.log('== 2/4 Wykluczenie .patch-backups z Vitest ==')
{
  const rel = 'vite.config.ts'
  let text = read(rel)

  if (text.includes("import { defineConfig } from 'vitest/config'")) {
    text = text.replace(
      "import { defineConfig } from 'vitest/config'",
      "import { configDefaults, defineConfig } from 'vitest/config'",
    )
  } else if (!text.includes('configDefaults')) {
    throw new Error('vite.config.ts: nie rozpoznano importu vitest/config')
  }

  if (!text.includes("'**/.patch-backups/**'")) {
    const anchor = "  test: {\n"
    if (!text.includes(anchor)) {
      throw new Error('vite.config.ts: nie znaleziono sekcji test')
    }
    text = text.replace(
      anchor,
      anchor + "    exclude: [...configDefaults.exclude, '**/.patch-backups/**'],\n",
    )
  }

  write(rel, text)
}

console.log('== 3/4 Dodanie .patch-backups do .gitignore ==')
{
  const rel = '.gitignore'
  let text = fs.existsSync(p(rel)) ? read(rel) : ''
  const lines = text.split(/\r?\n/)
  if (!lines.includes('.patch-backups/')) {
    if (text.length && !text.endsWith('\n')) text += '\n'
    text += '\n# Lokalne kopie tworzone przez patche Ogarniacza\n.patch-backups/\n'
  }
  write(rel, text)
}

console.log('== 4/4 Naprawa kontraktu rankingu ASAP ==')
{
  const rel = 'src/domain/ustaleniaGlosowe.ts'
  if (fs.existsSync(p(rel))) {
    let text = read(rel)

    // Test projektu wymaga, aby ASAP był zawsze przed zwykłym elementem zaległym.
    // Obecnie NORMAL(200)+ZALEGŁE(450)=650, więc ASAP=500 przegrywał.
    if (text.includes("case 'ASAP': return 500")) {
      text = text.replace("case 'ASAP': return 500", "case 'ASAP': return 800")
      console.log('  ASAP: 500 -> 800')
    } else if (text.includes("case 'ASAP': return 800")) {
      console.log('  ASAP już ma wagę 800 — pomijam')
    } else {
      console.log('  Nie znaleziono dokładnej starej wartości ASAP=500 — nie modyfikuję tej części')
    }

    write(rel, text)
  } else {
    console.log('  Brak src/domain/ustaleniaGlosowe.ts — pomijam')
  }
}

console.log('== Kontrola statyczna zmian ==')
{
  const czas = read('src/modules/czas/WidokiCzasu.tsx')
  if (czas.includes('ustawBladUrlopu(\\`')) {
    throw new Error('WidokiCzasu.tsx: błędny backtick nadal występuje')
  }

  const vite = read('vite.config.ts')
  if (!vite.includes("'**/.patch-backups/**'")) {
    throw new Error('vite.config.ts: brak wykluczenia backupów')
  }

  console.log('  OK: TSX bez błędnych escape z patcha v2')
  console.log('  OK: Vitest ignoruje .patch-backups')
  console.log('  OK: .patch-backups jest ignorowane przez Git')
}
NODE

echo
echo "== TypeScript =="
npm run typecheck

echo
echo "== Testy związane z naprawą =="
npx vitest run \
  src/services/KalendarzPracyService.test.ts \
  src/services/PlanerService.test.ts \
  src/domain/ustaleniaGlosowe.test.ts

echo
echo "== Pełny zestaw testów =="
npm test

echo
echo "== Build produkcyjny =="
npm run build

echo
echo "============================================================"
echo " NAPRAWA ZAKOŃCZONA POMYŚLNIE"
echo "============================================================"
echo
echo "Naprawiono:"
echo '  - błędne sekwencje escape w WidokiCzasu.tsx'
echo "  - Vitest nie skanuje już .patch-backups"
echo "  - stare backupy przeniesiono poza repo"
echo "  - .patch-backups dodano do .gitignore"
echo "  - ranking ASAP podniesiono z 500 do 800, zgodnie z istniejącym testem"
echo
echo "Backup tej naprawy:"
echo "  ${BACKUP_DIR}"
echo
echo "Stan Git:"
git --no-pager status --short
echo
echo "Jeśli wszystko jest OK, uruchom aplikację:"
echo "  npm run dev"
