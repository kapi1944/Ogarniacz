#!/usr/bin/env bash
set -Eeuo pipefail

# Ogarniacz — deadline zadania: konkretna godzina / do końca dnia / bez godziny
# Patch bez Codexa. Uruchamiaj w Git Bash na Windows.
#
# Domyślne repo:
#   C:\GitHub\Projects\Ogarniacz\Ogarniacz
#
# Co robi:
# - dopina istniejące deadlineMode AT_TIME / END_OF_DAY / NO_TIME do formularza Zadania,
# - dodaje pole godziny deadline,
# - przekazuje godzinę zadania do ElementOgarniacza, więc AT_TIME trafia na oś czasu,
# - zachowuje zgodność wsteczną: data bez godziny pozostaje "do końca dnia",
# - dodaje mały test logiki terminu,
# - robi kopię plików przed zmianą i automatycznie cofa TYLKO ten patch, jeśli walidacja nie przejdzie,
# - NIE robi commit/push/reset/stash.
#
# Patch jest adaptacyjny: najpierw rozpoznaje aktualny formularz Zadania i jego konfigurację.
# Jeżeli nie potrafi jednoznacznie znaleźć odpowiednich miejsc, przerywa bez modyfikowania repo.

REPO="${1:-/c/GitHub/Projects/Ogarniacz/Ogarniacz}"
PATCH_ID="OGARNIACZ_TASK_DEADLINE_TIME_2026_08_27_V1"
STAMP="$(date +%Y%m%d-%H%M%S)"
PARENT_DIR="$(dirname "$REPO")"
BACKUP_DIR="$PARENT_DIR/.ogarniacz-patch-backup/task-deadline-time-$STAMP"
PATCHER="$BACKUP_DIR/patcher.mjs"
MANIFEST="$BACKUP_DIR/manifest.tsv"
LOG="$BACKUP_DIR/walidacja.log"

fail() {
  echo >&2
  echo "BŁĄD: $*" >&2
  echo "Patch nie wykonuje automatycznego commit/push/reset/stash." >&2
  exit 1
}

note() {
  printf '%s\n' "$*"
}

for cmd in git node npm; do
  command -v "$cmd" >/dev/null 2>&1 || fail "Brak polecenia '$cmd' w PATH."
done

[[ -d "$REPO" ]] || fail "Nie istnieje katalog repo: $REPO"
[[ -d "$REPO/.git" ]] || fail "Brak .git w: $REPO"
[[ -f "$REPO/package.json" ]] || fail "Brak package.json w: $REPO"
[[ -d "$REPO/src" ]] || fail "Brak katalogu src w: $REPO"

cd "$REPO"
export GIT_PAGER=cat

mkdir -p "$BACKUP_DIR/files"
: > "$MANIFEST"
: > "$LOG"

note "============================================================"
note " Ogarniacz — deadline zadania + godzina na osi"
note " Patch: $PATCH_ID"
note " Repo:  $REPO"
note " Backup: $BACKUP_DIR"
note "============================================================"
note

note "[1/7] Stan Git przed zmianą"
git status --short --branch
git rev-parse HEAD > "$BACKUP_DIR/head-before.txt"
git diff > "$BACKUP_DIR/worktree-before.patch" || true
git diff --cached > "$BACKUP_DIR/index-before.patch" || true
git status --porcelain=v1 > "$BACKUP_DIR/status-before.txt" || true
note

# Nie wymagamy czystego worktree: patch robi kopię dokładnie tych plików,
# które sam zmienia, dzięki czemu może bezpiecznie działać również po wcześniejszym hotfixie.

cat > "$PATCHER" <<'NODE'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const PATCH_ID = 'OGARNIACZ_TASK_DEADLINE_TIME_2026_08_27_V1'
const root = process.cwd()
const backupDir = process.env.OGARNIACZ_BACKUP_DIR
const manifestPath = process.env.OGARNIACZ_MANIFEST

if (!backupDir || !manifestPath) {
  throw new Error('Brak OGARNIACZ_BACKUP_DIR/OGARNIACZ_MANIFEST')
}

const requireFromRepo = createRequire(path.join(root, 'package.json'))
let ts
try {
  ts = requireFromRepo('typescript')
} catch {
  throw new Error('Nie mogę załadować lokalnego pakietu typescript. Uruchom npm install i ponów patch.')
}

function posix(p) {
  return p.split(path.sep).join('/')
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function sfFor(file, text = read(file)) {
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

function propName(prop) {
  if (!prop?.name) return null
  if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) || ts.isNumericLiteral(prop.name)) {
    return prop.name.text
  }
  return null
}

function stringValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return null
}

function findProperty(obj, predicate) {
  return obj.properties.find((p) => ts.isPropertyAssignment(p) && predicate(p)) || null
}

function objectHasString(obj, value) {
  return obj.properties.some((p) => {
    if (!ts.isPropertyAssignment(p)) return false
    return stringValue(p.initializer) === value
  })
}

function allNodes(rootNode, predicate) {
  const out = []
  function visit(node) {
    if (predicate(node)) out.push(node)
    ts.forEachChild(node, visit)
  }
  visit(rootNode)
  return out
}

function quoteLike(node, value) {
  const raw = node.getText()
  const q = raw.startsWith('"') ? '"' : "'"
  return `${q}${value.replaceAll('\\', '\\\\').replaceAll(q, `\\${q}`)}${q}`
}

function applyReplacements(base, node, replacements) {
  const start = node.getStart()
  const end = node.getEnd()
  let text = base.slice(start, end)
  const local = replacements
    .map(({ target, value }) => ({
      start: target.getStart() - start,
      end: target.getEnd() - start,
      value,
    }))
    .sort((a, b) => b.start - a.start)
  for (const r of local) {
    text = text.slice(0, r.start) + r.value + text.slice(r.end)
  }
  return text
}

function makeOptionsText(optionsNode) {
  if (!ts.isArrayLiteralExpression(optionsNode)) {
    throw new Error('Opcje pola select nie są tablicą.')
  }

  const first = optionsNode.elements[0]
  if (!first) throw new Error('Nie mogę odtworzyć formatu pustej listy opcji.')

  const items = [
    ['AT_TIME', 'O konkretnej godzinie'],
    ['END_OF_DAY', 'Do końca dnia'],
    ['NO_TIME', 'Bez godziny'],
  ]

  if (ts.isObjectLiteralExpression(first)) {
    const stringProps = first.properties.filter(
      (p) => ts.isPropertyAssignment(p) && stringValue(p.initializer) !== null,
    )
    if (stringProps.length < 2) {
      throw new Error('Nie rozpoznaję formatu obiektów opcji select.')
    }

    // Pole techniczne zwykle zawiera OPEN/DONE/status; pole opisowe — tekst dla użytkownika.
    let valueProp = stringProps.find((p) => {
      const v = String(stringValue(p.initializer)).toUpperCase()
      return ['OPEN', 'DONE', 'NORMAL', 'URGENT', 'ASAP'].includes(v)
    }) || stringProps[0]
    let labelProp = stringProps.find((p) => p !== valueProp) || stringProps[1]

    const valueName = propName(valueProp)
    const labelName = propName(labelProp)
    if (!valueName || !labelName) throw new Error('Nie rozpoznaję nazw pól opcji select.')

    return `[\n${items.map(([value, label]) =>
      `        { ${valueName}: '${value}', ${labelName}: '${label}' }`
    ).join(',\n')}\n      ]`
  }

  if (ts.isArrayLiteralExpression(first) && first.elements.length >= 2) {
    return `[\n${items.map(([value, label]) =>
      `        ['${value}', '${label}']`
    ).join(',\n')}\n      ]`
  }

  if (ts.isStringLiteral(first)) {
    // Fallback dla prostych selectów. Techniczne wartości są mniej ładne,
    // ale renderer pozostaje zgodny ze swoim istniejącym formatem.
    return `['AT_TIME', 'END_OF_DAY', 'NO_TIME']`
  }

  throw new Error('Nie rozpoznaję formatu opcji pola select.')
}

const allSourceFiles = walk(path.join(root, 'src'))
  .filter((f) => /\.(ts|tsx)$/.test(f))

function scoreTaskView(file) {
  if (!file.endsWith('.tsx')) return -1
  const text = read(file)
  let score = 0
  if (/WidokZadan\.tsx$/i.test(file)) score += 100
  if (text.includes('Jednorazowe i cykliczne')) score += 80
  if (text.includes('Najwcześniej od')) score += 60
  if (text.includes('Powtarzaj co')) score += 60
  if (text.includes('Priorytet')) score += 20
  if (text.includes('Termin')) score += 20
  return score
}

const taskCandidates = allSourceFiles
  .map((file) => ({ file, score: scoreTaskView(file) }))
  .filter((x) => x.score > 0)
  .sort((a, b) => b.score - a.score)

if (!taskCandidates.length) {
  throw new Error('Nie znalazłem widoku Zadania.')
}

const taskFile = taskCandidates[0].file
let taskText = read(taskFile)
const taskSf = sfFor(taskFile, taskText)

const arrays = allNodes(taskSf, ts.isArrayLiteralExpression)
const fieldArray = arrays.find((arr) => {
  const objs = arr.elements.filter(ts.isObjectLiteralExpression)
  return objs.some((o) => objectHasString(o, 'Termin'))
    && objs.some((o) => objectHasString(o, 'Status'))
    && objs.some((o) => objectHasString(o, 'Priorytet'))
})

if (!fieldArray) {
  throw new Error(
    `Znalazłem ${posix(path.relative(root, taskFile))}, ale nie rozpoznaję konfiguracji pól formularza (Termin/Status/Priorytet).`
  )
}

const fieldObjects = fieldArray.elements.filter(ts.isObjectLiteralExpression)
const dateObj = fieldObjects.find((o) => objectHasString(o, 'Termin'))
const statusObj = fieldObjects.find((o) => objectHasString(o, 'Status'))
if (!dateObj || !statusObj) throw new Error('Nie rozpoznaję pól Termin/Status.')

const dateLabelProp = findProperty(dateObj, (p) => stringValue(p.initializer) === 'Termin')
const dateTypeProp = findProperty(dateObj, (p) => stringValue(p.initializer) === 'date')
const dateKeyProp = findProperty(dateObj, (p) => {
  const v = stringValue(p.initializer)
  return v && ['termin', 'deadline', 'date', 'data'].includes(v)
})

if (!dateLabelProp || !dateTypeProp || !dateKeyProp) {
  throw new Error('Nie potrafię jednoznacznie rozpoznać konfiguracji pola Termin.')
}

const fieldKeyPropertyName = propName(dateKeyProp)
const labelPropertyName = propName(dateLabelProp)
const typePropertyName = propName(dateTypeProp)
const dateField = stringValue(dateKeyProp.initializer)

if (!fieldKeyPropertyName || !labelPropertyName || !typePropertyName || !dateField) {
  throw new Error('Nie rozpoznaję nazw właściwości konfiguracji formularza.')
}

const statusKeyProp = findProperty(statusObj, (p) => {
  const v = stringValue(p.initializer)
  return v && ['status', 'stan'].includes(v)
})
const statusLabelProp = findProperty(statusObj, (p) => stringValue(p.initializer) === 'Status')
const statusTypeProp = findProperty(statusObj, (p) => stringValue(p.initializer) === 'select')
const statusOptionsProp = statusObj.properties.find((p) =>
  ts.isPropertyAssignment(p) && ts.isArrayLiteralExpression(p.initializer)
)

if (!statusKeyProp || !statusLabelProp || !statusTypeProp || !statusOptionsProp) {
  throw new Error('Nie potrafię użyć pola Status jako bezpiecznego wzorca dla Trybu terminu.')
}

const optionsText = makeOptionsText(statusOptionsProp.initializer)

// Ustal, czy model zadania używa już time/godzina oraz deadlineMode.
// Najpierw szukamy definicji typu/interfejsu związanej z Zadaniem.
let taskModelFile = null
let taskModelNode = null
let timeField = 'time'
let modeField = 'deadlineMode'

for (const file of allSourceFiles.filter((f) => f.endsWith('.ts'))) {
  const text = read(file)
  if (!/(Zadani|Task)/i.test(text)) continue
  const sf = sfFor(file, text)
  const defs = allNodes(sf, (n) =>
    ts.isInterfaceDeclaration(n) ||
    (ts.isTypeAliasDeclaration(n) && ts.isTypeLiteralNode(n.type))
  )
  for (const def of defs) {
    const name = def.name?.text || ''
    if (!/(Zadani|Task)/i.test(name)) continue
    const members = ts.isInterfaceDeclaration(def) ? def.members : def.type.members
    const names = new Set(members.map((m) => propName(m)).filter(Boolean))
    const hasCore = names.has('status') && (
      names.has('priorytet') || names.has('priority')
    ) && (
      names.has(dateField) || names.has('termin') || names.has('deadline') || names.has('date')
    )
    if (!hasCore) continue
    taskModelFile = file
    taskModelNode = def
    if (names.has('godzina')) timeField = 'godzina'
    else if (names.has('time')) timeField = 'time'
    if (names.has('deadlineMode')) modeField = 'deadlineMode'
    break
  }
  if (taskModelNode) break
}

// Jeśli konfiguracja formularza już ma pole godziny, respektujemy jego nazwę.
const existingTimeObj = fieldObjects.find((o) => {
  const label = o.properties.find((p) => ts.isPropertyAssignment(p) && /Godzina/i.test(String(stringValue(p.initializer) || '')))
  if (label) return true
  return o.properties.some((p) => ts.isPropertyAssignment(p) && ['time', 'godzina'].includes(String(stringValue(p.initializer) || '')))
})
if (existingTimeObj) {
  const key = existingTimeObj.properties.find((p) =>
    ts.isPropertyAssignment(p) && ['time', 'godzina'].includes(String(stringValue(p.initializer) || ''))
  )
  if (key) timeField = stringValue(key.initializer)
}

const existingModeObj = fieldObjects.find((o) =>
  o.properties.some((p) => ts.isPropertyAssignment(p) && stringValue(p.initializer) === modeField)
)

let modeDescriptor = null
let timeDescriptor = null

if (!existingModeObj) {
  modeDescriptor = applyReplacements(taskText, statusObj, [
    { target: statusKeyProp.initializer, value: quoteLike(statusKeyProp.initializer, modeField) },
    { target: statusLabelProp.initializer, value: quoteLike(statusLabelProp.initializer, 'Tryb terminu') },
    { target: statusOptionsProp.initializer, value: optionsText },
  ])
}

if (!existingTimeObj) {
  timeDescriptor = applyReplacements(taskText, dateObj, [
    { target: dateKeyProp.initializer, value: quoteLike(dateKeyProp.initializer, timeField) },
    { target: dateLabelProp.initializer, value: quoteLike(dateLabelProp.initializer, 'Godzina deadline') },
    { target: dateTypeProp.initializer, value: quoteLike(dateTypeProp.initializer, 'time') },
  ])
}

const modifications = new Map()

if (modeDescriptor || timeDescriptor) {
  const chunks = []
  if (modeDescriptor) chunks.push(modeDescriptor)
  if (timeDescriptor) chunks.push(timeDescriptor)
  const insertPos = dateObj.getEnd()
  taskText = taskText.slice(0, insertPos)
    + ',\n      ' + chunks.join(',\n      ')
    + taskText.slice(insertPos)

  // Oznaczenie ułatwia idempotencję i późniejszy audyt.
  taskText += `\n// ${PATCH_ID}: formularz Zadania obsługuje ${modeField} + ${timeField}.\n`
  modifications.set(taskFile, taskText)
}

// Rozszerz typ zadania, tylko jeśli faktycznie brakuje pól.
// Jeżeli model jest już kompletny, nie dotykamy go.
if (taskModelFile && taskModelNode) {
  let modelText = modifications.get(taskModelFile) ?? read(taskModelFile)
  let sf = sfFor(taskModelFile, modelText)

  // Po ewentualnej modyfikacji taskFile pozycje AST modelu pozostają niezależne.
  const defs = allNodes(sf, (n) =>
    ts.isInterfaceDeclaration(n) ||
    (ts.isTypeAliasDeclaration(n) && ts.isTypeLiteralNode(n.type))
  )
  const def = defs.find((d) => d.name?.text === taskModelNode.name?.text)
  if (def) {
    const members = ts.isInterfaceDeclaration(def) ? def.members : def.type.members
    const names = new Set(members.map((m) => propName(m)).filter(Boolean))
    const additions = []
    if (!names.has(modeField)) additions.push(`  ${modeField}?: 'AT_TIME' | 'END_OF_DAY' | 'NO_TIME'`)
    if (!names.has(timeField)) additions.push(`  ${timeField}?: string`)

    if (additions.length) {
      const container = ts.isInterfaceDeclaration(def) ? def : def.type
      const close = container.getEnd() - 1
      modelText = modelText.slice(0, close)
        + '\n' + additions.join('\n') + '\n'
        + modelText.slice(close)
      modifications.set(taskModelFile, modelText)
    }
  }
}

// Jeżeli wspólny renderer ma zamkniętą unię typów pól, dopisz "time".
const genericCandidates = allSourceFiles.filter((f) =>
  f.endsWith('.tsx') &&
  /WidokRejestru\.tsx$/i.test(f)
)
for (const file of genericCandidates) {
  let text = modifications.get(file) ?? read(file)
  if (!text.includes("'date'") && !text.includes('"date"')) continue
  if (/\|\s*['"]time['"]/.test(text)) continue

  const before = text
  text = text.replace(
    /(['"]date['"])(\s*\|)/,
    `$1 | 'time'$2`,
  )
  if (text !== before) modifications.set(file, text)
}

// Dodaj małą, czystą logikę terminu. To NIE jest drugi model zadania;
// funkcje jedynie normalizują trzy istniejące wartości deadlineMode.
const helperFile = path.join(root, 'src', 'domain', 'logikaTerminuZadania.ts')
const helperText = `/**
 * ${PATCH_ID}
 * Adapter zgodności dla istniejących trybów deadlineMode.
 * Nie definiuje nowego modelu zadania.
 */
export function poprawnaGodzinaDeadline(wartosc: unknown): wartosc is string {
  return typeof wartosc === 'string'
    && /^(?:[01]\\d|2[0-3]):[0-5]\\d$/.test(wartosc)
}

export function normalizujDeadlineMode(
  deadlineMode: unknown,
  data: unknown,
  godzina: unknown,
): 'AT_TIME' | 'END_OF_DAY' | 'NO_TIME' {
  if (deadlineMode === 'AT_TIME' && poprawnaGodzinaDeadline(godzina)) return 'AT_TIME'
  if (deadlineMode === 'END_OF_DAY') return 'END_OF_DAY'
  if (deadlineMode === 'NO_TIME') return 'NO_TIME'

  // Wsteczna zgodność:
  // - starszy rekord z godziną -> AT_TIME,
  // - starszy rekord tylko z datą -> END_OF_DAY,
  // - brak daty i godziny -> NO_TIME.
  if (poprawnaGodzinaDeadline(godzina)) return 'AT_TIME'
  if (typeof data === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(data)) return 'END_OF_DAY'
  return 'NO_TIME'
}

export function godzinaZadaniaNaOsi(input: {
  deadlineMode?: unknown
  date?: unknown
  time?: unknown
}): string | undefined {
  const mode = normalizujDeadlineMode(input.deadlineMode, input.date, input.time)
  return mode === 'AT_TIME' && poprawnaGodzinaDeadline(input.time)
    ? input.time
    : undefined
}
`
if (!fs.existsSync(helperFile) || read(helperFile) !== helperText) {
  modifications.set(helperFile, helperText)
}

const testFile = path.join(root, 'src', 'domain', 'logikaTerminuZadania.test.ts')
const testText = `import { describe, expect, it } from 'vitest'
import { godzinaZadaniaNaOsi, normalizujDeadlineMode } from './logikaTerminuZadania'

describe('deadline zadania — godzina / koniec dnia / bez godziny', () => {
  it('AT_TIME wystawia godzinę na oś czasu', () => {
    expect(godzinaZadaniaNaOsi({
      deadlineMode: 'AT_TIME',
      date: '2026-08-27',
      time: '15:30',
    })).toBe('15:30')
  })

  it('END_OF_DAY nie tworzy sztucznego markera 23:59', () => {
    expect(godzinaZadaniaNaOsi({
      deadlineMode: 'END_OF_DAY',
      date: '2026-08-27',
      time: '15:30',
    })).toBeUndefined()
  })

  it('starsza data bez trybu pozostaje do końca dnia', () => {
    expect(normalizujDeadlineMode(undefined, '2026-08-27', undefined))
      .toBe('END_OF_DAY')
  })

  it('starszy rekord z godziną jest traktowany jako AT_TIME', () => {
    expect(normalizujDeadlineMode(undefined, '2026-08-27', '11:45'))
      .toBe('AT_TIME')
  })
})
`
if (!fs.existsSync(testFile) || read(testFile) !== testText) {
  modifications.set(testFile, testText)
}

// Znajdź adapter Zadanie -> ElementOgarniacza.
const preferredAdapterFiles = [
  path.join(root, 'src', 'domain', 'adapterZadania.ts'),
  path.join(root, 'src', 'providers', 'DostawcaZadanPulpitu.ts'),
].filter(fs.existsSync)

const otherAdapterFiles = allSourceFiles.filter((f) => {
  if (!f.endsWith('.ts') && !f.endsWith('.tsx')) return false
  const text = read(f)
  return text.includes('ElementOgarniacza') && /zadani/i.test(text)
})

const adapterFiles = [...new Set([...preferredAdapterFiles, ...otherAdapterFiles])]
let adapterPatched = false

function relativeImport(fromFile, toFile) {
  let rel = posix(path.relative(path.dirname(fromFile), toFile)).replace(/\.(ts|tsx)$/, '')
  if (!rel.startsWith('.')) rel = './' + rel
  return rel
}

for (const file of adapterFiles) {
  if (adapterPatched) break
  let text = modifications.get(file) ?? read(file)
  let sf = sfFor(file, text)
  const objects = allNodes(sf, ts.isObjectLiteralExpression)

  for (const obj of objects) {
    const props = obj.properties.filter(ts.isPropertyAssignment)
    const names = new Set(props.map(propName).filter(Boolean))
    if (!names.has('tytul') || !names.has('data')) continue

    const objText = text.slice(obj.getStart(), obj.getEnd())
    const refs = [...objText.matchAll(/\b([A-Za-z_$][\w$]*)\.(?:id|tytul|title|termin|deadline|status|priorytet|priority)\b/g)]
    if (!refs.length) continue

    const counts = new Map()
    for (const m of refs) counts.set(m[1], (counts.get(m[1]) || 0) + 1)
    const sourceVar = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    if (!sourceVar) continue

    const dataProp = props.find((p) => propName(p) === 'data')
    if (!dataProp) continue

    // Spróbuj wywnioskować rzeczywiste pole daty z istniejącego mapowania.
    let adapterDateExpr = dataProp.initializer.getText(sf)
    let sourceDateField = dateField
    const dataRef = new RegExp(`^${sourceVar}\\.([A-Za-z_$][\\w$]*)$`).exec(adapterDateExpr.trim())
    if (dataRef) sourceDateField = dataRef[1]

    const modeExpr = `${sourceVar}.${modeField}`
    const timeExpr = `${sourceVar}.${timeField}`
    const hourExpr = `godzinaZadaniaNaOsi({ deadlineMode: ${modeExpr}, date: ${sourceVar}.${sourceDateField}, time: ${timeExpr} })`

    const godzinaProp = props.find((p) => propName(p) === 'godzina')
    if (godzinaProp) {
      text = text.slice(0, godzinaProp.initializer.getStart(sf))
        + hourExpr
        + text.slice(godzinaProp.initializer.getEnd())
    } else {
      const insertPos = dataProp.getEnd()
      text = text.slice(0, insertPos)
        + `,\n    godzina: ${hourExpr}`
        + text.slice(insertPos)
    }

    const importPath = relativeImport(file, helperFile)
    if (!text.includes("godzinaZadaniaNaOsi")) {
      // Ten warunek praktycznie nie wystąpi po wstawieniu wywołania.
    }
    if (!new RegExp(`from\\s+['"]${importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(text)) {
      text = `import { godzinaZadaniaNaOsi } from '${importPath}'\n` + text
    } else if (!/import\s*\{[^}]*godzinaZadaniaNaOsi[^}]*\}/s.test(text)) {
      // Nie ingerujemy w istniejący import z tego helpera o nietypowym kształcie.
      text = `import { godzinaZadaniaNaOsi } from '${importPath}'\n` + text
    }

    if (!text.includes(PATCH_ID)) {
      text += `\n// ${PATCH_ID}: AT_TIME przekazuje godzinę zadania do osi Pulpitu.\n`
    }

    modifications.set(file, text)
    adapterPatched = true
    break
  }
}

if (!adapterPatched) {
  throw new Error(
    'Nie znalazłem jednoznacznego adaptera Zadanie -> ElementOgarniacza (pola tytul/data). Przerywam przed zapisem.'
  )
}

// Dodatkowa, bezpieczna poprawka etykiety na liście zadań:
// jeśli UI ma literalny "Termin:" i odwołanie do pola daty, dopisz godzinę tylko wtedy, gdy istnieje.
// Nie jest to warunek powodzenia patcha.
if (taskText.includes('Termin:') && !taskText.includes('Godzina deadline')) {
  // taskText został już wzbogacony descriptorami, więc ten warunek zwykle jest false.
}

if (!modifications.size) {
  console.log('Patch wygląda na już zastosowany — brak nowych zmian.')
  process.exit(0)
}

// Walidacja przed zapisem: wymagamy zarówno UI, jak i adaptera.
const plannedTaskText = modifications.get(taskFile) ?? read(taskFile)
if (!plannedTaskText.includes(modeField) || !plannedTaskText.includes(timeField)) {
  throw new Error('Planowana zmiana nie zawiera obu pól deadlineMode/time w formularzu Zadania.')
}

const plannedAdapterText = [...modifications.entries()]
  .filter(([file]) => adapterFiles.includes(file))
  .map(([, text]) => text)
  .join('\n')
if (!plannedAdapterText.includes('godzinaZadaniaNaOsi')) {
  throw new Error('Planowana zmiana nie przekazuje godziny zadania na oś czasu.')
}

// Backup + zapis dopiero po pełnym rozpoznaniu wszystkich wymaganych punktów.
for (const [file, content] of modifications) {
  const rel = posix(path.relative(root, file))
  const existed = fs.existsSync(file)
  fs.appendFileSync(manifestPath, `${existed ? 'EXISTED' : 'NEW'}\t${rel}\n`, 'utf8')

  if (existed) {
    const backup = path.join(backupDir, 'files', rel)
    fs.mkdirSync(path.dirname(backup), { recursive: true })
    fs.copyFileSync(file, backup)
  }

  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content.replace(/\r\n/g, '\n'), 'utf8')
  console.log(`Zmieniono: ${rel}`)
}

console.log('')
console.log(`Widok zadań: ${posix(path.relative(root, taskFile))}`)
console.log(`Pole daty:    ${dateField}`)
console.log(`Pole trybu:   ${modeField}`)
console.log(`Pole godziny: ${timeField}`)
console.log('AT_TIME będzie wystawiał godzinę do ElementOgarniacza.godzina.')
NODE

restore_patch() {
  note
  note "Przywracam stan sprzed TEGO patcha..."
  if [[ ! -f "$MANIFEST" ]]; then
    note "Brak manifestu — nie ma czego automatycznie przywracać."
    return
  fi

  # Czytamy w odwrotnej kolejności, na wypadek zależności między nowymi plikami.
  mapfile -t entries < "$MANIFEST"
  for (( idx=${#entries[@]}-1 ; idx>=0 ; idx-- )); do
    line="${entries[$idx]}"
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

note "[2/7] Rozpoznanie formularza, modelu i adaptera Pulpitu"
if ! OGARNIACZ_BACKUP_DIR="$BACKUP_DIR" OGARNIACZ_MANIFEST="$MANIFEST" node "$PATCHER"; then
  restore_patch
  fail "Nie udało się jednoznacznie zastosować zmian. Repo zostało przywrócone do stanu sprzed patcha."
fi
note

note "[3/7] Kontrola zakresu zmian"
git status --short
echo
git diff --stat
echo
git diff -- src/modules/zadania src/domain src/providers src/components 2>/dev/null || true
note

has_script() {
  node -e 'const p=require("./package.json"); process.exit(p.scripts && p.scripts[process.argv[1]] ? 0 : 1)' "$1"
}

VALIDATION_FAILED=0

note "[4/7] Testy dotyczące deadline"
if has_script test; then
  {
    echo "===== npm test -- src/domain/logikaTerminuZadania.test.ts ====="
    npm test -- src/domain/logikaTerminuZadania.test.ts
  } 2>&1 | tee -a "$LOG" || VALIDATION_FAILED=1
else
  note "Brak skryptu test — pomijam."
fi
note

note "[5/7] Typecheck / build / lint"
if has_script typecheck; then
  {
    echo "===== npm run typecheck ====="
    npm run typecheck
  } 2>&1 | tee -a "$LOG" || VALIDATION_FAILED=1
fi

if has_script build; then
  {
    echo "===== npm run build ====="
    npm run build
  } 2>&1 | tee -a "$LOG" || VALIDATION_FAILED=1
fi

if has_script lint; then
  {
    echo "===== npm run lint ====="
    npm run lint
  } 2>&1 | tee -a "$LOG" || VALIDATION_FAILED=1
fi

if [[ "$VALIDATION_FAILED" -ne 0 ]]; then
  note
  note "Walidacja wykryła błąd. Nie zostawiam repo w pół-zmienionym stanie."
  restore_patch
  echo
  echo "Ostatnie 120 linii logu:"
  tail -n 120 "$LOG" || true
  fail "Walidacja nie przeszła; wszystkie pliki zmienione przez ten patch zostały przywrócone."
fi

note
note "[6/7] Kontrola semantyczna"
node <<'NODE'
const fs = require('fs')
const path = require('path')

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!['node_modules', 'dist', '.git'].includes(e.name)) walk(f, out)
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(f)
  }
  return out
}

const files = walk('src')
const texts = files.map(f => [f, fs.readFileSync(f, 'utf8')])

const modes = texts.some(([,t]) => t.includes('AT_TIME') && t.includes('END_OF_DAY') && t.includes('NO_TIME'))
const timeUi = texts.some(([f,t]) => /zadani/i.test(f + t) && /Godzina deadline/.test(t))
const timeline = texts.some(([,t]) => t.includes('godzinaZadaniaNaOsi'))

if (!modes || !timeUi || !timeline) {
  console.error({ modes, timeUi, timeline })
  process.exit(1)
}

console.log('OK: trzy tryby terminu są obecne.')
console.log('OK: formularz Zadania ma pole godziny deadline.')
console.log('OK: AT_TIME jest podłączone do godziny markera osi czasu.')
NODE
note

note "[7/7] Gotowe"
note "Patch NIE wykonał commit ani push."
note "Kopia bezpieczeństwa: $BACKUP_DIR"
note "Log walidacji:       $LOG"
note
git status --short --branch
note
note "Sprawdź ręcznie:"
note "  1. Zadania -> edytuj/dodaj zadanie."
note "  2. Ustaw Termin na dzisiaj."
note "  3. Tryb terminu -> O konkretnej godzinie."
note "  4. Ustaw Godzina deadline, np. 15:30, i zapisz."
note "  5. Pulpit -> Dzisiaj: zadanie powinno pojawić się jako marker na osi o 15:30."
note "  6. Zmień Tryb terminu na Do końca dnia: zadanie powinno wrócić do sekcji bez godziny, bez sztucznego markera 23:59."
note
note "Jeśli wszystko wygląda dobrze, commit możesz zrobić osobno, np.:"
note "  git add -A && git commit -m \"fix(tasks): add deadline time modes to timeline\""
