#!/usr/bin/env bash
set -Eeuo pipefail

# Ogarniacz — zadania: deadline o godzinie / do końca dnia / bez godziny
# V2: szersze wykrywanie aktualnego adaptera Zadanie -> ElementOgarniacza.
#
# Uruchom w Git Bash:
#   cd "/c/GitHub/Projects/Ogarniacz/Ogarniacz"
#   bash "./Ogarniacz_zadania_deadline_godzina_patch_v2.sh"
#
# Nie wykonuje commit/push/reset/stash.
# W razie błędu przywraca wyłącznie pliki zmienione przez TEN patch.

REPO="${1:-/c/GitHub/Projects/Ogarniacz/Ogarniacz}"
PATCH_ID="OGARNIACZ_TASK_DEADLINE_TIME_2026_08_27_V2"
STAMP="$(date +%Y%m%d-%H%M%S)"
PARENT_DIR="$(dirname "$REPO")"
BACKUP_DIR="$PARENT_DIR/.ogarniacz-patch-backup/task-deadline-time-v2-$STAMP"
PATCHER="$BACKUP_DIR/patcher.mjs"
MANIFEST="$BACKUP_DIR/manifest.tsv"
LOG="$BACKUP_DIR/walidacja.log"

fail() {
  echo >&2
  echo "BŁĄD: $*" >&2
  echo "Patch nie wykonuje automatycznego commit/push/reset/stash." >&2
  exit 1
}

note() { printf '%s\n' "$*"; }

for cmd in git node npm; do
  command -v "$cmd" >/dev/null 2>&1 || fail "Brak polecenia '$cmd' w PATH."
done

[[ -d "$REPO/.git" ]] || fail "Nie znaleziono repozytorium: $REPO"
[[ -f "$REPO/package.json" ]] || fail "Brak package.json: $REPO"
[[ -d "$REPO/src" ]] || fail "Brak katalogu src: $REPO"

cd "$REPO"
export GIT_PAGER=cat

mkdir -p "$BACKUP_DIR/files"
: > "$MANIFEST"
: > "$LOG"

note "============================================================"
note " Ogarniacz — zadania: deadline + godzina na osi (V2)"
note " Patch: $PATCH_ID"
note " Repo:  $REPO"
note " Backup: $BACKUP_DIR"
note "============================================================"
note
note "[1/8] Stan Git przed zmianą"
git status --short --branch
git rev-parse HEAD > "$BACKUP_DIR/head-before.txt"
git status --porcelain=v1 > "$BACKUP_DIR/status-before.txt" || true
git diff > "$BACKUP_DIR/worktree-before.patch" || true
git diff --cached > "$BACKUP_DIR/index-before.patch" || true
note

cat > "$PATCHER" <<'NODE'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const PATCH_ID = 'OGARNIACZ_TASK_DEADLINE_TIME_2026_08_27_V2'
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

const P = (p) => p.split(path.sep).join('/')
const rel = (p) => P(path.relative(root, p))

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(e.name)) continue
    const f = path.join(dir, e.name)
    if (e.isDirectory()) walk(f, acc)
    else acc.push(f)
  }
  return acc
}

function read(file) { return fs.readFileSync(file, 'utf8') }

function source(file, text = read(file)) {
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

function propName(p) {
  if (!p?.name) return null
  if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name)) return p.name.text
  return null
}

function literal(n) {
  return ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : null
}

function objectHasLiteral(obj, value) {
  return obj.properties.some((p) => ts.isPropertyAssignment(p) && literal(p.initializer) === value)
}

function propByLiteral(obj, value) {
  return obj.properties.find((p) => ts.isPropertyAssignment(p) && literal(p.initializer) === value) || null
}

function propByName(obj, name) {
  return obj.properties.find((p) => propName(p) === name) || null
}

function quoteLike(node, value) {
  const raw = node.getText()
  const q = raw.startsWith('"') ? '"' : "'"
  return `${q}${value.replaceAll('\\', '\\\\').replaceAll(q, `\\${q}`)}${q}`
}

function replaceInside(base, owner, replacements) {
  const start = owner.getStart()
  const end = owner.getEnd()
  let piece = base.slice(start, end)
  const local = replacements
    .map(({ target, value }) => ({
      start: target.getStart() - start,
      end: target.getEnd() - start,
      value,
    }))
    .sort((a, b) => b.start - a.start)
  for (const r of local) piece = piece.slice(0, r.start) + r.value + piece.slice(r.end)
  return piece
}

function relativeImport(fromFile, toFile) {
  let r = P(path.relative(path.dirname(fromFile), toFile)).replace(/\.(tsx?|jsx?)$/, '')
  return r.startsWith('.') ? r : './' + r
}

function addNamedImport(text, importPath, name) {
  const escaped = importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${escaped}['"]`)
  const m = re.exec(text)
  if (m) {
    if (new RegExp(`\\b${name}\\b`).test(m[1])) return text
    const replacement = m[0].replace('{', `{ ${name},`)
    return text.slice(0, m.index) + replacement + text.slice(m.index + m[0].length)
  }
  return `import { ${name} } from '${importPath}'\n` + text
}

function optionArrayFromStatus(optionsNode) {
  if (!ts.isArrayLiteralExpression(optionsNode) || !optionsNode.elements.length) {
    throw new Error('Nie rozpoznaję listy opcji pola Status.')
  }

  const values = [
    ['AT_TIME', 'O konkretnej godzinie'],
    ['END_OF_DAY', 'Do końca dnia'],
    ['NO_TIME', 'Bez godziny'],
  ]
  const first = optionsNode.elements[0]

  if (ts.isObjectLiteralExpression(first)) {
    const stringProps = first.properties.filter(
      (p) => ts.isPropertyAssignment(p) && literal(p.initializer) !== null
    )
    if (stringProps.length < 2) throw new Error('Nietypowy format opcji select.')

    let valueProp = stringProps.find((p) => {
      const v = String(literal(p.initializer)).toUpperCase()
      return ['OPEN', 'DONE', 'TODO', 'NORMAL', 'URGENT', 'LOW', 'HIGH'].includes(v)
    }) || stringProps[0]
    const labelProp = stringProps.find((p) => p !== valueProp) || stringProps[1]
    const vn = propName(valueProp)
    const ln = propName(labelProp)
    if (!vn || !ln) throw new Error('Brak nazw pól opcji select.')

    return `[\n${values.map(([v,l]) => `        { ${vn}: '${v}', ${ln}: '${l}' }`).join(',\n')}\n      ]`
  }

  if (ts.isArrayLiteralExpression(first) && first.elements.length >= 2) {
    return `[\n${values.map(([v,l]) => `        ['${v}', '${l}']`).join(',\n')}\n      ]`
  }

  if (ts.isStringLiteral(first)) return `['AT_TIME', 'END_OF_DAY', 'NO_TIME']`

  throw new Error('Nieobsługiwany format opcji pola Status.')
}

const all = walk(path.join(root, 'src')).filter((f) => /\.(ts|tsx)$/.test(f))
const modifications = new Map()

function setMod(file, text) { modifications.set(file, text) }
function current(file) { return modifications.get(file) ?? read(file) }

// ------------------------------------------------------------
// 1. Znajdź Widok Zadania i jego konfigurację pól
// ------------------------------------------------------------
const taskViewCandidates = all
  .filter((f) => f.endsWith('.tsx'))
  .map((file) => {
    const t = read(file)
    let score = 0
    if (/WidokZadan\.tsx$/i.test(file)) score += 120
    if (/Jednorazowe i cykliczne/i.test(t)) score += 80
    if (/Najwcześniej od/i.test(t)) score += 60
    if (/Powtarzaj co/i.test(t)) score += 60
    if (/Priorytet/i.test(t)) score += 20
    if (/Termin/i.test(t)) score += 20
    return { file, score }
  })
  .filter((x) => x.score > 0)
  .sort((a,b) => b.score - a.score)

if (!taskViewCandidates.length) throw new Error('Nie znalazłem widoku Zadania.')
const taskFile = taskViewCandidates[0].file
let taskText = current(taskFile)
let taskSf = source(taskFile, taskText)

const fieldArray = nodes(taskSf, ts.isArrayLiteralExpression).find((arr) => {
  const objs = arr.elements.filter(ts.isObjectLiteralExpression)
  return objs.some((o) => objectHasLiteral(o, 'Termin'))
    && objs.some((o) => objectHasLiteral(o, 'Status'))
    && objs.some((o) => objectHasLiteral(o, 'Priorytet'))
})

if (!fieldArray) {
  throw new Error(`Znalazłem ${rel(taskFile)}, ale nie rozpoznaję konfiguracji formularza Zadania.`)
}

const fieldObjs = fieldArray.elements.filter(ts.isObjectLiteralExpression)
const dateObj = fieldObjs.find((o) => objectHasLiteral(o, 'Termin'))
const statusObj = fieldObjs.find((o) => objectHasLiteral(o, 'Status'))
if (!dateObj || !statusObj) throw new Error('Brak konfiguracji Termin/Status.')

const dateLabelProp = propByLiteral(dateObj, 'Termin')
const dateTypeProp = dateObj.properties.find((p) => ts.isPropertyAssignment(p) && literal(p.initializer) === 'date')
const dateKeyProp = dateObj.properties.find((p) => {
  if (!ts.isPropertyAssignment(p)) return false
  const v = literal(p.initializer)
  return ['termin', 'deadline', 'date', 'data'].includes(String(v))
})

const statusLabelProp = propByLiteral(statusObj, 'Status')
const statusTypeProp = statusObj.properties.find((p) => ts.isPropertyAssignment(p) && literal(p.initializer) === 'select')
const statusKeyProp = statusObj.properties.find((p) => {
  if (!ts.isPropertyAssignment(p)) return false
  return ['status', 'stan'].includes(String(literal(p.initializer)))
})
const statusOptionsProp = statusObj.properties.find(
  (p) => ts.isPropertyAssignment(p) && ts.isArrayLiteralExpression(p.initializer)
)

if (!dateLabelProp || !dateTypeProp || !dateKeyProp ||
    !statusLabelProp || !statusTypeProp || !statusKeyProp || !statusOptionsProp) {
  throw new Error('Nie udało się bezpiecznie odtworzyć formatu konfiguracji pól formularza.')
}

const keyPropName = propName(dateKeyProp)
const labelPropName = propName(dateLabelProp)
const typePropName = propName(dateTypeProp)
const dateField = literal(dateKeyProp.initializer)
if (!keyPropName || !labelPropName || !typePropName || !dateField) {
  throw new Error('Nie udało się ustalić nazw właściwości konfiguracji formularza.')
}

// ------------------------------------------------------------
// 2. Znajdź model Zadania i ustal rzeczywiste nazwy pól
// ------------------------------------------------------------
let taskModelFile = null
let taskModelDefName = null
let timeField = 'time'
let modeField = 'deadlineMode'
let modelDateField = dateField

for (const file of all.filter((f) => f.endsWith('.ts'))) {
  const t = read(file)
  if (!/(Zadani|Task)/i.test(t)) continue
  const sf = source(file, t)
  const defs = nodes(sf, (n) =>
    ts.isInterfaceDeclaration(n) ||
    (ts.isTypeAliasDeclaration(n) && ts.isTypeLiteralNode(n.type))
  )

  for (const d of defs) {
    const name = d.name?.text || ''
    if (!/(Zadani|Task)/i.test(name)) continue
    const members = ts.isInterfaceDeclaration(d) ? d.members : d.type.members
    const names = new Set(members.map(propName).filter(Boolean))

    const taskish = (names.has('status') || names.has('stan'))
      && (names.has('priorytet') || names.has('priority'))
      && [...names].some((n) => ['termin', 'deadline', 'date', 'data'].includes(n))

    if (!taskish) continue

    taskModelFile = file
    taskModelDefName = name
    if (names.has('godzina')) timeField = 'godzina'
    else if (names.has('time')) timeField = 'time'

    if (names.has('deadlineMode')) modeField = 'deadlineMode'
    if (names.has('termin')) modelDateField = 'termin'
    else if (names.has('deadline')) modelDateField = 'deadline'
    else if (names.has('date')) modelDateField = 'date'
    else if (names.has('data')) modelDateField = 'data'
    break
  }
  if (taskModelFile) break
}

// Sprawdź, czy pola już istnieją w konfiguracji.
const existingTimeObj = fieldObjs.find((o) => o.properties.some((p) =>
  ts.isPropertyAssignment(p) &&
  (
    ['time', 'godzina'].includes(String(literal(p.initializer))) ||
    /Godzina deadline/i.test(String(literal(p.initializer) || ''))
  )
))

const existingModeObj = fieldObjs.find((o) => o.properties.some((p) =>
  ts.isPropertyAssignment(p) && literal(p.initializer) === modeField
))

if (existingTimeObj) {
  const key = existingTimeObj.properties.find((p) =>
    ts.isPropertyAssignment(p) && ['time','godzina'].includes(String(literal(p.initializer)))
  )
  if (key) timeField = literal(key.initializer)
}

const optionsText = optionArrayFromStatus(statusOptionsProp.initializer)
const descriptors = []

if (!existingModeObj) {
  descriptors.push(replaceInside(taskText, statusObj, [
    { target: statusKeyProp.initializer, value: quoteLike(statusKeyProp.initializer, modeField) },
    { target: statusLabelProp.initializer, value: quoteLike(statusLabelProp.initializer, 'Tryb terminu') },
    { target: statusOptionsProp.initializer, value: optionsText },
  ]))
}

if (!existingTimeObj) {
  descriptors.push(replaceInside(taskText, dateObj, [
    { target: dateKeyProp.initializer, value: quoteLike(dateKeyProp.initializer, timeField) },
    { target: dateLabelProp.initializer, value: quoteLike(dateLabelProp.initializer, 'Godzina deadline') },
    { target: dateTypeProp.initializer, value: quoteLike(dateTypeProp.initializer, 'time') },
  ]))
}

if (descriptors.length) {
  const insertAt = dateObj.getEnd()
  taskText = taskText.slice(0, insertAt)
    + ',\n      ' + descriptors.join(',\n      ')
    + taskText.slice(insertAt)

  if (!taskText.includes(PATCH_ID)) {
    taskText += `\n// ${PATCH_ID}: Zadanie obsługuje tryb terminu i godzinę deadline.\n`
  }
  setMod(taskFile, taskText)
}

// ------------------------------------------------------------
// 3. Rozszerz model Zadania, jeśli brakuje pól
// ------------------------------------------------------------
if (taskModelFile && taskModelDefName) {
  let text = current(taskModelFile)
  const sf = source(taskModelFile, text)
  const def = nodes(sf, (n) =>
    (ts.isInterfaceDeclaration(n) || (ts.isTypeAliasDeclaration(n) && ts.isTypeLiteralNode(n.type)))
    && n.name?.text === taskModelDefName
  )[0]

  if (def) {
    const members = ts.isInterfaceDeclaration(def) ? def.members : def.type.members
    const names = new Set(members.map(propName).filter(Boolean))
    const additions = []
    if (!names.has(modeField)) additions.push(`  ${modeField}?: 'AT_TIME' | 'END_OF_DAY' | 'NO_TIME'`)
    if (!names.has(timeField)) additions.push(`  ${timeField}?: string`)

    if (additions.length) {
      const container = ts.isInterfaceDeclaration(def) ? def : def.type
      const close = container.getEnd() - 1
      text = text.slice(0, close) + '\n' + additions.join('\n') + '\n' + text.slice(close)
      setMod(taskModelFile, text)
    }
  }
}

// ------------------------------------------------------------
// 4. Jeśli renderer ma zamkniętą unię typów pól, dodaj "time"
// ------------------------------------------------------------
for (const file of all.filter((f) => f.endsWith('.tsx'))) {
  let text = current(file)
  if (!/WidokRejestru|Pole.*Form|Formularz/i.test(path.basename(file) + text)) continue
  if (!/['"]date['"]/.test(text)) continue
  if (/\|\s*['"]time['"]/.test(text)) continue

  const changed = text.replace(/(['"]date['"])(\s*\|)/, `$1 | 'time'$2`)
  if (changed !== text) setMod(file, changed)
}

// ------------------------------------------------------------
// 5. Helper normalizacji trybu terminu
// ------------------------------------------------------------
const helperFile = path.join(root, 'src', 'domain', 'logikaTerminuZadania.ts')
const helperText = `/**
 * ${PATCH_ID}
 * Wspólna normalizacja trzech trybów terminu zadania.
 */
export function poprawnaGodzinaDeadline(wartosc: unknown): wartosc is string {
  return typeof wartosc === 'string'
    && /^(?:[01]\\\\d|2[0-3]):[0-5]\\\\d$/.test(wartosc)
}

export function normalizujDeadlineMode(
  deadlineMode: unknown,
  data: unknown,
  godzina: unknown,
): 'AT_TIME' | 'END_OF_DAY' | 'NO_TIME' {
  if (deadlineMode === 'AT_TIME' && poprawnaGodzinaDeadline(godzina)) return 'AT_TIME'
  if (deadlineMode === 'END_OF_DAY') return 'END_OF_DAY'
  if (deadlineMode === 'NO_TIME') return 'NO_TIME'

  // Zgodność ze starszymi rekordami.
  if (poprawnaGodzinaDeadline(godzina)) return 'AT_TIME'
  if (typeof data === 'string' && /^\\\\d{4}-\\\\d{2}-\\\\d{2}$/.test(data)) return 'END_OF_DAY'
  return 'NO_TIME'
}

export function godzinaZadaniaNaOsi(input: {
  deadlineMode?: unknown
  date?: unknown
  time?: unknown
}): string | undefined {
  return normalizujDeadlineMode(input.deadlineMode, input.date, input.time) === 'AT_TIME'
    && poprawnaGodzinaDeadline(input.time)
      ? input.time
      : undefined
}
`
if (!fs.existsSync(helperFile) || read(helperFile) !== helperText) setMod(helperFile, helperText)

// ------------------------------------------------------------
// 6. TEST helpera
// ------------------------------------------------------------
const testFile = path.join(root, 'src', 'domain', 'logikaTerminuZadania.test.ts')
const testText = `import { describe, expect, it } from 'vitest'
import { godzinaZadaniaNaOsi, normalizujDeadlineMode } from './logikaTerminuZadania'

describe('termin zadania', () => {
  it('AT_TIME wystawia godzinę na oś', () => {
    expect(godzinaZadaniaNaOsi({
      deadlineMode: 'AT_TIME',
      date: '2026-08-27',
      time: '15:30',
    })).toBe('15:30')
  })

  it('END_OF_DAY nie tworzy markera 23:59', () => {
    expect(godzinaZadaniaNaOsi({
      deadlineMode: 'END_OF_DAY',
      date: '2026-08-27',
      time: '15:30',
    })).toBeUndefined()
  })

  it('starsza data bez godziny pozostaje END_OF_DAY', () => {
    expect(normalizujDeadlineMode(undefined, '2026-08-27', undefined)).toBe('END_OF_DAY')
  })

  it('starszy rekord z godziną jest AT_TIME', () => {
    expect(normalizujDeadlineMode(undefined, '2026-08-27', '11:45')).toBe('AT_TIME')
  })
})
`
if (!fs.existsSync(testFile) || read(testFile) !== testText) setMod(testFile, testText)

// ------------------------------------------------------------
// 7. Znajdź adapter Zadanie -> ElementOgarniacza.
//    V2 używa punktacji i wielu sygnałów, nie wymaga jednego układu AST.
// ------------------------------------------------------------
function objectScore(file, sf, obj) {
  const props = obj.properties.filter(ts.isPropertyAssignment)
  const names = new Set(props.map(propName).filter(Boolean))
  const txt = obj.getText(sf)
  const full = sf.text
  let score = 0

  if (names.has('godzina')) score += 8
  if (names.has('data')) score += 15
  if (names.has('tytul') || names.has('title')) score += 15
  if (names.has('typ') || names.has('rodzaj')) score += 8
  if (/(?:'|")ZADANIE(?:'|")|(?:'|")zadanie(?:'|")/i.test(txt)) score += 45
  if (/ElementOgarniacza/i.test(full)) score += 20
  if (/zadani/i.test(path.basename(file))) score += 25
  if (/DostawcaZadanPulpitu|adapterZadania/i.test(file)) score += 45
  if (/\.(?:termin|deadline|date|data)\b/.test(txt)) score += 15
  if (/\.(?:tytul|title|nazwa)\b/.test(txt)) score += 10
  if (/\.(?:status|priorytet|priority)\b/.test(txt)) score += 5
  if (/return\s*\{/.test(full.slice(Math.max(0,obj.getStart()-80), obj.getStart()+5))) score += 3

  return score
}

function inferSourceVar(objText) {
  const refs = [...objText.matchAll(/\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\b/g)]
    .filter((m) => !['Math','Date','Object','Array','String','Number','JSON'].includes(m[1]))

  const counts = new Map()
  for (const m of refs) {
    const field = m[2]
    const weight = ['termin','deadline','date','data','tytul','title','nazwa','status','priorytet','priority','id'].includes(field) ? 3 : 1
    counts.set(m[1], (counts.get(m[1]) || 0) + weight)
  }
  return [...counts.entries()].sort((a,b) => b[1]-a[1])[0]?.[0] || null
}

function inferFieldFromObject(obj, sf, sourceVar, candidates, fallback) {
  for (const p of obj.properties.filter(ts.isPropertyAssignment)) {
    const txt = p.initializer.getText(sf).trim()
    for (const c of candidates) {
      if (new RegExp(`\\b${sourceVar}\\.${c}\\b`).test(txt)) return c
    }
  }
  return fallback
}

const adapterCandidates = []
for (const file of all) {
  const text = current(file)
  if (!/(ElementOgarniacza|zadani|ZADANIE)/i.test(text + path.basename(file))) continue
  const sf = source(file, text)
  for (const obj of nodes(sf, ts.isObjectLiteralExpression)) {
    const score = objectScore(file, sf, obj)
    if (score < 45) continue
    const objText = obj.getText(sf)
    const sourceVar = inferSourceVar(objText)
    if (!sourceVar) continue
    adapterCandidates.push({ file, sf, obj, score, sourceVar })
  }
}

adapterCandidates.sort((a,b) => b.score - a.score)

console.log('')
console.log('Kandydaci adaptera Zadanie -> oś:')
for (const c of adapterCandidates.slice(0, 8)) {
  console.log(`  score=${c.score}  ${rel(c.file)}  source=${c.sourceVar}`)
}

let adapterPatched = false

for (const cand of adapterCandidates) {
  if (adapterPatched) break

  let text = current(cand.file)
  let sf = source(cand.file, text)

  // Po wcześniejszych modyfikacjach pozycji AST w tym samym pliku trzeba znaleźć obiekt ponownie.
  const freshObjs = nodes(sf, ts.isObjectLiteralExpression)
    .map((obj) => ({ obj, score: objectScore(cand.file, sf, obj) }))
    .sort((a,b) => b.score-a.score)

  for (const { obj, score } of freshObjs) {
    if (score < Math.max(45, cand.score - 15)) continue
    const objText = obj.getText(sf)
    const sourceVar = inferSourceVar(objText)
    if (!sourceVar) continue

    const props = obj.properties.filter(ts.isPropertyAssignment)
    const dataProp = props.find((p) => propName(p) === 'data')
    const titleProp = props.find((p) => ['tytul','title'].includes(String(propName(p))))
    const taskLiteral = /(?:'|")ZADANIE(?:'|")|(?:'|")zadanie(?:'|")/i.test(objText)
    const taskFileSignal = /zadani|DostawcaZadanPulpitu|adapterZadania/i.test(cand.file)

    // Muszą wystąpić przynajmniej dwa niezależne sygnały.
    const signals = [!!dataProp, !!titleProp, taskLiteral, taskFileSignal].filter(Boolean).length
    if (signals < 2) continue

    const actualDateField = inferFieldFromObject(
      obj, sf, sourceVar,
      ['termin','deadline','date','data'],
      modelDateField
    )

    const actualTimeField = inferFieldFromObject(
      obj, sf, sourceVar,
      ['godzina','time'],
      timeField
    )

    const hourExpr =
      `godzinaZadaniaNaOsi({ deadlineMode: ${sourceVar}.${modeField}, date: ${sourceVar}.${actualDateField}, time: ${sourceVar}.${actualTimeField} })`

    const godzinaProp = props.find((p) => propName(p) === 'godzina')

    if (godzinaProp) {
      const start = godzinaProp.initializer.getStart(sf)
      const end = godzinaProp.initializer.getEnd()
      text = text.slice(0, start) + hourExpr + text.slice(end)
    } else {
      // Preferuj wstawienie tuż po "data"; jeśli jej nie ma, po tytule.
      const anchor = dataProp || titleProp || props[0]
      if (!anchor) continue
      const at = anchor.getEnd()
      text = text.slice(0, at) + `,\n    godzina: ${hourExpr}` + text.slice(at)
    }

    text = addNamedImport(text, relativeImport(cand.file, helperFile), 'godzinaZadaniaNaOsi')
    if (!text.includes(PATCH_ID)) {
      text += `\n// ${PATCH_ID}: AT_TIME przekazuje deadline zadania na oś czasu.\n`
    }

    setMod(cand.file, text)
    console.log(`Wybrany adapter: ${rel(cand.file)} (score ${score}, source ${sourceVar})`)
    adapterPatched = true
    break
  }
}

// ------------------------------------------------------------
// 8. Fallback V2: funkcja zwracająca ElementOgarniacza i pracująca na zadaniu.
// ------------------------------------------------------------
if (!adapterPatched) {
  for (const file of all) {
    if (adapterPatched) break
    let text = current(file)
    if (!/ElementOgarniacza/i.test(text) || !/zadani/i.test(text)) continue

    let sf = source(file, text)
    const funcs = nodes(sf, (n) =>
      ts.isFunctionDeclaration(n) ||
      ts.isArrowFunction(n) ||
      ts.isFunctionExpression(n)
    )

    for (const fn of funcs) {
      const fnText = fn.getText(sf)
      if (!/ElementOgarniacza/i.test(fnText) && !/zadani/i.test(fnText)) continue

      const params = fn.parameters || []
      const sourceVar = params
        .map((p) => p.name && ts.isIdentifier(p.name) ? p.name.text : null)
        .find(Boolean)
      if (!sourceVar) continue

      const returns = nodes(fn, ts.isReturnStatement)
        .filter((r) => r.expression && ts.isObjectLiteralExpression(r.expression))

      for (const r of returns) {
        const obj = r.expression
        const props = obj.properties.filter(ts.isPropertyAssignment)
        const names = new Set(props.map(propName).filter(Boolean))
        if (!names.has('data') && !names.has('tytul') && !names.has('title')) continue

        const actualDateField = modelDateField
        const hourExpr =
          `godzinaZadaniaNaOsi({ deadlineMode: ${sourceVar}.${modeField}, date: ${sourceVar}.${actualDateField}, time: ${sourceVar}.${timeField} })`

        const godzinaProp = props.find((p) => propName(p) === 'godzina')
        if (godzinaProp) {
          text = text.slice(0, godzinaProp.initializer.getStart(sf))
            + hourExpr
            + text.slice(godzinaProp.initializer.getEnd())
        } else {
          const anchor = props.find((p) => propName(p) === 'data') || props[0]
          const at = anchor.getEnd()
          text = text.slice(0, at) + `,\n    godzina: ${hourExpr}` + text.slice(at)
        }

        text = addNamedImport(text, relativeImport(file, helperFile), 'godzinaZadaniaNaOsi')
        if (!text.includes(PATCH_ID)) text += `\n// ${PATCH_ID}: fallback adapter zadania do osi.\n`
        setMod(file, text)
        console.log(`Wybrany adapter fallback: ${rel(file)} (param ${sourceVar})`)
        adapterPatched = true
        break
      }
      if (adapterPatched) break
    }
  }
}

if (!adapterPatched) {
  throw new Error(
    'V2 nadal nie znalazła bezpiecznego punktu mapowania zadania na oś. Nie zapisano zmian.'
  )
}

// ------------------------------------------------------------
// 9. Sprawdzenie planu przed pierwszym zapisem
// ------------------------------------------------------------
const plannedTask = current(taskFile)
if (!plannedTask.includes(modeField) || !plannedTask.includes(timeField)) {
  throw new Error('Plan nie zawiera obu pól trybu/godziny w formularzu Zadania.')
}

const plannedAll = [...modifications.values()].join('\n')
if (!plannedAll.includes('godzinaZadaniaNaOsi')) {
  throw new Error('Plan nie podłącza godziny zadania do osi czasu.')
}

// ------------------------------------------------------------
// 10. Backup i zapis
// ------------------------------------------------------------
for (const [file, content] of modifications) {
  const r = rel(file)
  const existed = fs.existsSync(file)
  fs.appendFileSync(manifestPath, `${existed ? 'EXISTED' : 'NEW'}\t${r}\n`, 'utf8')

  if (existed) {
    const backup = path.join(backupDir, 'files', r)
    fs.mkdirSync(path.dirname(backup), { recursive: true })
    fs.copyFileSync(file, backup)
  }

  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content.replace(/\r\n/g, '\n'), 'utf8')
  console.log(`Zmieniono: ${r}`)
}

console.log('')
console.log('Rozpoznanie:')
console.log(`  widok zadań: ${rel(taskFile)}`)
console.log(`  pole daty:    ${dateField}`)
console.log(`  pole modelu:  ${modelDateField}`)
console.log(`  tryb:         ${modeField}`)
console.log(`  godzina:      ${timeField}`)
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

note "[2/8] Analiza aktualnego kodu i zastosowanie zmian"
if ! OGARNIACZ_BACKUP_DIR="$BACKUP_DIR" OGARNIACZ_MANIFEST="$MANIFEST" node "$PATCHER"; then
  restore_patch
  fail "Patch V2 przerwał pracę i przywrócił pliki zmieniane przez siebie."
fi
note

note "[3/8] Zakres zmian"
git status --short
echo
git diff --stat
echo

note "[4/8] Test logiki deadline"
VALIDATION_FAILED=0

has_script() {
  node -e 'const p=require("./package.json"); process.exit(p.scripts && p.scripts[process.argv[1]] ? 0 : 1)' "$1"
}

if has_script test; then
  {
    echo "===== test logikaTerminuZadania ====="
    npm test -- --run src/domain/logikaTerminuZadania.test.ts
  } 2>&1 | tee -a "$LOG" || VALIDATION_FAILED=1
else
  note "Brak skryptu test — pomijam."
fi
note

note "[5/8] Typecheck"
if has_script typecheck; then
  { npm run typecheck; } 2>&1 | tee -a "$LOG" || VALIDATION_FAILED=1
else
  note "Brak skryptu typecheck — pomijam."
fi
note

note "[6/8] Build"
if has_script build; then
  { npm run build; } 2>&1 | tee -a "$LOG" || VALIDATION_FAILED=1
else
  note "Brak skryptu build — pomijam."
fi
note

note "[7/8] Lint"
if has_script lint; then
  { npm run lint; } 2>&1 | tee -a "$LOG" || VALIDATION_FAILED=1
else
  note "Brak skryptu lint — pomijam."
fi

if [[ "$VALIDATION_FAILED" -ne 0 ]]; then
  note
  note "Walidacja nie przeszła — cofnięcie wyłącznie zmian V2."
  restore_patch
  echo
  echo "Ostatnie 160 linii logu:"
  tail -n 160 "$LOG" || true
  fail "Walidacja V2 nie przeszła. Repo przywrócone względem zmian tego patcha."
fi

note
note "[8/8] Kontrola końcowa"
node <<'NODE'
const fs = require('fs')
const path = require('path')

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules','dist','.git'].includes(e.name)) continue
    const f = path.join(dir,e.name)
    if (e.isDirectory()) walk(f,out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(f)
  }
  return out
}

const joined = walk('src').map(f => fs.readFileSync(f,'utf8')).join('\n')
const checks = {
  AT_TIME: joined.includes('AT_TIME'),
  END_OF_DAY: joined.includes('END_OF_DAY'),
  NO_TIME: joined.includes('NO_TIME'),
  timeInput: joined.includes('Godzina deadline'),
  timelineBridge: joined.includes('godzinaZadaniaNaOsi'),
}

console.log(checks)
if (Object.values(checks).some(v => !v)) process.exit(1)
NODE

note
note "============================================================"
note " GOTOWE — patch V2 przeszedł walidację"
note "============================================================"
note "Backup: $BACKUP_DIR"
note "Log:    $LOG"
note
note "Patch NIE wykonał commit ani push."
note
note "Test ręczny:"
note "  1. Otwórz Zadania i dodaj/edytuj zadanie."
note "  2. Termin = dzisiaj."
note "  3. Tryb terminu = O konkretnej godzinie."
note "  4. Godzina deadline = np. 15:30."
note "  5. Zapisz."
note "  6. Pulpit: zadanie ma być widoczne na osi o 15:30."
note "  7. Zmień na Do końca dnia: marker godzinowy ma zniknąć."
note
git status --short --branch
