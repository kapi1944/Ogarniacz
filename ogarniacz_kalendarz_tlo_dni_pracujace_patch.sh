#!/usr/bin/env bash
set -Eeuo pipefail

# Ogarniacz — kalendarz: tło dla dni pracujących z wykluczeniem urlopów
# Patch bez Codexa, adaptacyjny do aktualnego kodu.
#
# Domyślne repo:
#   C:\GitHub\Projects\Ogarniacz\Ogarniacz
#
# Patch:
# - wykorzystuje istniejące dane o dniu pracującym/urlopie/święcie,
# - dodaje klasę CSS WYŁĄCZNIE dla dnia pracującego bez urlopu,
# - jeśli w widoku jest informacja o święcie, także je wyklucza,
# - nie zmienia modelu urlopów ani polskich świąt,
# - robi kopię bezpieczeństwa tylko zmienianych plików,
# - uruchamia typecheck/build/lint,
# - w razie błędu cofa wyłącznie własne zmiany,
# - nie wykonuje commit/push/reset/stash.

REPO="${1:-/c/GitHub/Projects/Ogarniacz/Ogarniacz}"
PATCH_ID="OGARNIACZ_KALENDARZ_TLO_DNI_PRACUJACE_2026_08_27_V1"
STAMP="$(date +%Y%m%d-%H%M%S)"
PARENT_DIR="$(dirname "$REPO")"
BACKUP_DIR="$PARENT_DIR/.ogarniacz-patch-backup/kalendarz-dni-pracujace-$STAMP"
PATCHER="$BACKUP_DIR/patcher.mjs"
MANIFEST="$BACKUP_DIR/manifest.tsv"
LOG="$BACKUP_DIR/walidacja.log"

fail() {
  echo >&2
  echo "BŁĄD: $*" >&2
  echo "Patch nie wykonuje commit/push/reset/stash." >&2
  exit 1
}

note() { printf '%s\n' "$*"; }

for cmd in git node npm; do
  command -v "$cmd" >/dev/null 2>&1 || fail "Brak polecenia '$cmd' w PATH."
done

[[ -d "$REPO/.git" ]] || fail "Nie znaleziono repozytorium: $REPO"
[[ -f "$REPO/package.json" ]] || fail "Brak package.json w: $REPO"

cd "$REPO"
export GIT_PAGER=cat

mkdir -p "$BACKUP_DIR/files"
: > "$MANIFEST"
: > "$LOG"

note "============================================================"
note " Ogarniacz — tło dni pracujących w kalendarzu"
note " Patch: $PATCH_ID"
note " Repo:  $REPO"
note " Backup: $BACKUP_DIR"
note "============================================================"
note

note "[1/6] Stan Git przed zmianą"
git status --short --branch
git rev-parse HEAD > "$BACKUP_DIR/head-before.txt"
git status --porcelain=v1 > "$BACKUP_DIR/status-before.txt" || true
note

cat > "$PATCHER" <<'NODE'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const PATCH_ID = 'OGARNIACZ_KALENDARZ_TLO_DNI_PRACUJACE_2026_08_27_V1'
const root = process.cwd()
const backupDir = process.env.OGARNIACZ_BACKUP_DIR
const manifestPath = process.env.OGARNIACZ_MANIFEST

if (!backupDir || !manifestPath) throw new Error('Brak zmiennych katalogu backupu.')

const requireFromRepo = createRequire(path.join(root, 'package.json'))
let ts
try {
  ts = requireFromRepo('typescript')
} catch {
  throw new Error('Brak lokalnego pakietu typescript. Wykonaj npm install i uruchom patch ponownie.')
}

const P = p => p.split(path.sep).join('/')
const rel = p => P(path.relative(root, p))

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(e.name)) continue
    const f = path.join(dir, e.name)
    if (e.isDirectory()) walk(f, out)
    else out.push(f)
  }
  return out
}

function read(file) { return fs.readFileSync(file, 'utf8') }

function sf(file, text = read(file)) {
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
}

function nodes(rootNode, predicate) {
  const out = []
  function visit(n) {
    if (predicate(n)) out.push(n)
    ts.forEachChild(n, visit)
  }
  visit(rootNode)
  return out
}

function jsxAttr(opening, name) {
  return opening.attributes.properties.find(p =>
    ts.isJsxAttribute(p) && p.name?.text === name
  ) || null
}

function openingOf(node) {
  if (ts.isJsxElement(node)) return node.openingElement
  if (ts.isJsxSelfClosingElement(node)) return node
  return null
}

function getCallbackOfMap(node) {
  let cur = node.parent
  while (cur) {
    if (
      (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) &&
      cur.parent &&
      ts.isCallExpression(cur.parent) &&
      ts.isPropertyAccessExpression(cur.parent.expression) &&
      cur.parent.expression.name.text === 'map'
    ) return cur
    cur = cur.parent
  }
  return null
}

function scoreCell(node, sourceFile) {
  const opening = openingOf(node)
  if (!opening) return -1
  const cls = jsxAttr(opening, 'className')
  if (!cls) return -1

  const nodeText = node.getText(sourceFile)
  const clsText = cls.getText(sourceFile)
  let score = 0

  if (/kalendarz|calendar/i.test(clsText)) score += 50
  if (/dzien|day/i.test(clsText)) score += 25
  if (/urlop/i.test(nodeText)) score += 25
  if (/swiet|święt/i.test(nodeText)) score += 18
  if (/pracuj|robocz/i.test(nodeText)) score += 20
  if (/data|date/i.test(nodeText)) score += 8
  if (getCallbackOfMap(node)) score += 12

  return score
}

function variableExprs(callback, sourceFile, keywordRe) {
  const results = []

  for (const decl of nodes(callback, ts.isVariableDeclaration)) {
    if (!decl.initializer || !ts.isIdentifier(decl.name)) continue
    const initText = decl.initializer.getText(sourceFile)
    const name = decl.name.text
    const combined = `${name} ${initText}`
    if (keywordRe.test(combined)) {
      results.push({ expr: name, score: keywordRe.test(name) ? 20 : 10 })
    }
  }

  for (const pa of nodes(callback, ts.isPropertyAccessExpression)) {
    const t = pa.getText(sourceFile)
    if (keywordRe.test(t)) results.push({ expr: t, score: 8 })
  }

  const uniq = new Map()
  for (const r of results) {
    if (!uniq.has(r.expr) || uniq.get(r.expr).score < r.score) uniq.set(r.expr, r)
  }
  return [...uniq.values()].sort((a,b) => b.score-a.score)
}

function toClassNameReplacement(attr, sourceFile, condition) {
  const init = attr.initializer
  if (!init) {
    return `className={${condition} ? 'kalendarz-dzien--pracujacy' : ''}`
  }

  if (ts.isStringLiteral(init)) {
    const raw = init.text.replace(/`/g, '\\`')
    return `className={\`${raw} \${${condition} ? 'kalendarz-dzien--pracujacy' : ''}\`}`
  }

  if (ts.isJsxExpression(init) && init.expression) {
    const expr = init.expression.getText(sourceFile)
    return `className={\`\${${expr} ?? ''} \${${condition} ? 'kalendarz-dzien--pracujacy' : ''}\`}`
  }

  throw new Error('Nieobsługiwany format className komórki kalendarza.')
}

const files = walk(path.join(root, 'src')).filter(f => /\.(ts|tsx|css)$/.test(f))
const viewFiles = files.filter(f => f.endsWith('.tsx'))

const preferred = [
  path.join(root, 'src', 'modules', 'czas', 'WidokiCzasu.tsx'),
].filter(fs.existsSync)

const candidatesFiles = [...new Set([
  ...preferred,
  ...viewFiles.filter(f => /czas|kalendarz/i.test(f)),
])]

const cellCandidates = []

for (const file of candidatesFiles) {
  const text = read(file)
  if (!/kalendarz|calendar|urlop|swiet|święt/i.test(text)) continue
  const sourceFile = sf(file, text)
  const jsxNodes = nodes(sourceFile, n => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n))

  for (const node of jsxNodes) {
    const score = scoreCell(node, sourceFile)
    if (score < 35) continue
    const callback = getCallbackOfMap(node)
    if (!callback) continue

    const work = variableExprs(callback, sourceFile, /pracuj|robocz/i)
    const vacation = variableExprs(callback, sourceFile, /urlop/i)
    const holiday = variableExprs(callback, sourceFile, /swiet|święt/i)

    if (!work.length || !vacation.length) continue

    cellCandidates.push({
      file,
      text,
      sourceFile,
      node,
      callback,
      score: score + work[0].score + vacation[0].score + (holiday[0]?.score || 0),
      workExpr: work[0].expr,
      vacationExpr: vacation[0].expr,
      holidayExpr: holiday[0]?.expr || null,
    })
  }
}

cellCandidates.sort((a,b) => b.score-a.score)

console.log('Kandydaci komórki kalendarza:')
for (const c of cellCandidates.slice(0, 8)) {
  console.log(
    `  score=${c.score} ${rel(c.file)} | praca=${c.workExpr} | urlop=${c.vacationExpr}` +
    (c.holidayExpr ? ` | święto=${c.holidayExpr}` : '')
  )
}

if (!cellCandidates.length) {
  throw new Error(
    'Nie znalazłem komórki kalendarza z jednoczesną informacją o dniu pracującym i urlopie. Nie zapisano zmian.'
  )
}

const chosen = cellCandidates[0]
let viewText = chosen.text
const opening = openingOf(chosen.node)
const classAttr = jsxAttr(opening, 'className')
if (!classAttr) throw new Error('Wybrana komórka nie ma className.')

const conditionParts = [
  `Boolean(${chosen.workExpr})`,
  `!Boolean(${chosen.vacationExpr})`,
]
if (chosen.holidayExpr) conditionParts.push(`!Boolean(${chosen.holidayExpr})`)
const condition = conditionParts.join(' && ')

if (!viewText.includes('kalendarz-dzien--pracujacy')) {
  const replacement = toClassNameReplacement(classAttr, chosen.sourceFile, condition)
  viewText =
    viewText.slice(0, classAttr.getStart(chosen.sourceFile)) +
    replacement +
    viewText.slice(classAttr.getEnd())

  viewText += `\n// ${PATCH_ID}: dzień pracujący bez urlopu otrzymuje klasę tła kalendarza.\n`
}

const cssCandidates = [
  path.join(root, 'src', 'styles', 'glowny.css'),
  ...files.filter(f => f.endsWith('.css')),
].filter((f, i, arr) => fs.existsSync(f) && arr.indexOf(f) === i)

let cssFile = cssCandidates.find(f => /glowny\.css$/i.test(f)) || cssCandidates[0]
if (!cssFile) throw new Error('Nie znaleziono pliku CSS.')

let cssText = read(cssFile)

const cssBlock = `
/* ${PATCH_ID}
   Zwykły dzień pracujący otrzymuje subtelne tło.
   Urlop i święto są wykluczane już po stronie logiki widoku. */
.kalendarz-dzien--pracujacy {
  background-color: color-mix(
    in srgb,
    var(--kolor-akcent, var(--accent, #4f8cff)) 12%,
    transparent
  );
}
`

if (!cssText.includes(PATCH_ID)) cssText += cssBlock

const modifications = new Map()
if (viewText !== chosen.text) modifications.set(chosen.file, viewText)
if (cssText !== read(cssFile)) modifications.set(cssFile, cssText)

if (!modifications.size) {
  console.log('Patch wygląda na już zastosowany — brak nowych zmian.')
  process.exit(0)
}

// Walidacja planu przed zapisem
const planned = [...modifications.values()].join('\n')
if (!planned.includes('kalendarz-dzien--pracujacy')) {
  throw new Error('Plan nie zawiera klasy tła dnia pracującego.')
}
if (!planned.includes(chosen.vacationExpr)) {
  throw new Error('Plan nie zachowuje wykluczenia urlopu.')
}

for (const [file, content] of modifications) {
  const r = rel(file)
  const existed = fs.existsSync(file)
  fs.appendFileSync(manifestPath, `${existed ? 'EXISTED' : 'NEW'}\t${r}\n`, 'utf8')

  if (existed) {
    const backup = path.join(backupDir, 'files', r)
    fs.mkdirSync(path.dirname(backup), { recursive: true })
    fs.copyFileSync(file, backup)
  }

  fs.writeFileSync(file, content.replace(/\r\n/g, '\n'), 'utf8')
  console.log(`Zmieniono: ${r}`)
}

console.log('')
console.log(`Wybrany widok: ${rel(chosen.file)}`)
console.log(`Warunek dnia pracującego: ${chosen.workExpr}`)
console.log(`Warunek urlopu:           ${chosen.vacationExpr}`)
if (chosen.holidayExpr) console.log(`Warunek święta:           ${chosen.holidayExpr}`)
console.log(`CSS:                      ${rel(cssFile)}`)
NODE

restore_patch() {
  note
  note "Przywracam pliki zmienione przez TEN patch..."
  [[ -f "$MANIFEST" ]] || return 0
  mapfile -t entries < "$MANIFEST"
  for ((i=${#entries[@]}-1; i>=0; i--)); do
    line="${entries[$i]}"
    status="${line%%$'\t'*}"
    rel="${line#*$'\t'}"
    [[ -n "$rel" ]] || continue

    if [[ "$status" == "EXISTED" ]]; then
      mkdir -p "$(dirname "$rel")"
      cp -p "$BACKUP_DIR/files/$rel" "$rel"
    elif [[ "$status" == "NEW" ]]; then
      rm -f "$rel"
    fi
  done
}

note "[2/6] Analiza kalendarza i zastosowanie zmiany"
if ! OGARNIACZ_BACKUP_DIR="$BACKUP_DIR" OGARNIACZ_MANIFEST="$MANIFEST" node "$PATCHER"; then
  restore_patch
  fail "Nie udało się bezpiecznie zastosować oznaczenia dni pracujących."
fi
note

note "[3/6] Zakres zmian"
git status --short
echo
git diff --stat
note

has_script() {
  node -e 'const p=require("./package.json"); process.exit(p.scripts && p.scripts[process.argv[1]] ? 0 : 1)' "$1"
}

FAILED=0

note "[4/6] Typecheck / build"
if has_script typecheck; then
  { npm run typecheck; } 2>&1 | tee -a "$LOG" || FAILED=1
fi

if has_script build; then
  { npm run build; } 2>&1 | tee -a "$LOG" || FAILED=1
fi
note

note "[5/6] Lint"
if has_script lint; then
  { npm run lint; } 2>&1 | tee -a "$LOG" || FAILED=1
fi

if [[ "$FAILED" -ne 0 ]]; then
  restore_patch
  echo
  tail -n 160 "$LOG" || true
  fail "Walidacja nie przeszła; zmiany tego patcha zostały cofnięte."
fi
note

note "[6/6] Kontrola końcowa"
grep -R --line-number --exclude-dir=node_modules --exclude-dir=dist \
  "kalendarz-dzien--pracujacy" src | head -20 || true

note
note "============================================================"
note " GOTOWE — tło dni pracujących zostało dodane"
note "============================================================"
note "Backup: $BACKUP_DIR"
note "Log:    $LOG"
note
note "Patch NIE wykonał commit ani push."
note
note "Test ręczny:"
note "  1. Otwórz Grafik/Kalendarz."
note "  2. Zwykły dzień pracujący powinien mieć subtelne tło."
note "  3. Dzień urlopu NIE powinien mieć tła dnia pracującego."
note "  4. Święto również nie powinno być oznaczone jak zwykły dzień pracy."
note "  5. Weekend/dzień wolny powinien pozostać bez oznaczenia dnia pracującego."
note
git status --short --branch
