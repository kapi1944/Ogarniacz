import { DatabaseSync, backup as wykonajKopieSqlite } from 'node:sqlite'
import { parseEnv } from 'node:util'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync, renameSync, rmSync, openSync, closeSync, fsyncSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

export function sprawdzKonfiguracje(tekst, katalog) {
  let ustawienia
  try { ustawienia = parseEnv(tekst) } catch { throw new Error('Niepoprawny format ogarniacz.env.') }
  if (ustawienia.HOST !== '127.0.0.1') throw new Error('Preflight: HOST musi być 127.0.0.1.')
  if (ustawienia.PORT && ustawienia.PORT !== '8787') throw new Error('Preflight: wymagany lokalny port backendu 8787.')
  const originy = (ustawienia.CORS_ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim())
  for (const origin of originy) {
    let adres
    try { adres = new URL(origin) } catch { throw new Error('Preflight: CORS wymaga pełnych originów HTTPS.') }
    if (adres.protocol !== 'https:' || adres.origin !== origin || origin.includes('*')) {
      throw new Error('Preflight: CORS wymaga pełnych originów HTTPS bez wildcardów.')
    }
  }
  if (!originy.includes('https://localhost')) throw new Error('Preflight: brakuje originu Capacitor https://localhost.')
  if (ustawienia.DATABASE_PATH && resolve(katalog, ustawienia.DATABASE_PATH) !== resolve(katalog, 'data/ogarniacz.sqlite')) {
    throw new Error('Preflight: DATABASE_PATH nie wskazuje bazy objętej snapshotem.')
  }
  if (ustawienia.STATIC_DIR && resolve(katalog, ustawienia.STATIC_DIR) !== resolve(katalog, 'dist')) {
    throw new Error('Preflight: STATIC_DIR nie wskazuje przygotowywanego frontendu.')
  }
  return ustawienia
}

export function sprawdzServe(tekst) {
  let konfiguracja
  try { konfiguracja = JSON.parse(tekst) } catch { throw new Error('Preflight: nie udało się odczytać Tailscale Serve.') }
  const web = Object.entries(konfiguracja.Web ?? {})
  const poprawny = web.some(([host, wpis]) => {
    const port = host.split(':').at(-1)
    return konfiguracja.TCP?.[port]?.HTTPS === true
      && wpis.Handlers?.['/']?.Proxy === 'http://127.0.0.1:8787'
      && konfiguracja.AllowFunnel?.[host] !== true
  })
  if (!poprawny) throw new Error('Preflight: Tailscale Serve musi wskazywać prywatny lokalny backend.')
}

function utrwalPlik(sciezka) {
  const deskryptor = openSync(sciezka, 'r+')
  try { fsyncSync(deskryptor) } finally { closeSync(deskryptor) }
}

function sprawdzBaze(sciezka) {
  const baza = new DatabaseSync(sciezka, { readOnly: true, timeout: 5000 })
  try {
    if (baza.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('Snapshot SQLite nie przeszedł kontroli integralności.')
  } finally { baza.close() }
}

export async function wykonajSnapshot(katalog, commit) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Niepoprawny identyfikator snapshotu.')
  const sciezkaBazy = resolve(katalog, 'data/ogarniacz.sqlite')
  if (!existsSync(sciezkaBazy)) throw new Error('Brak bazy SQLite do snapshotu; aktualizacja zatrzymana.')
  const katalogKopii = resolve(katalog, 'data/aktualizacja-rpi/backups')
  mkdirSync(katalogKopii, { recursive: true, mode: 0o700 })
  const nazwa = `${commit}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sqlite`
  const sciezka = resolve(katalogKopii, nazwa)
  const tymczasowa = `${sciezka}.part`
  const baza = new DatabaseSync(sciezkaBazy, { readOnly: true, timeout: 5000 })
  try {
    // SQLite backup API odczytuje również zatwierdzone strony WAL.
    await wykonajKopieSqlite(baza, tymczasowa)
    const kopia = new DatabaseSync(tymczasowa)
    try { kopia.exec('PRAGMA journal_mode=DELETE') } finally { kopia.close() }
    sprawdzBaze(tymczasowa)
    utrwalPlik(tymczasowa)
    renameSync(tymczasowa, sciezka)
  } finally { baza.close(); rmSync(tymczasowa, { force: true }) }
  const kopie = readdirSync(katalogKopii).filter((plik) => plik !== nazwa && /^[a-f0-9]{40}-.*\.sqlite$/.test(plik))
    .sort((lewy, prawy) => statSync(resolve(katalogKopii, prawy)).mtimeMs - statSync(resolve(katalogKopii, lewy)).mtimeMs)
  // Nowy snapshot musi pozostać także przy identycznych timestampach plików.
  for (const plik of kopie.slice(2)) rmSync(resolve(katalogKopii, plik))
  return nazwa
}

// Wywoływane wyłącznie przy zatrzymanej usłudze, zanim wystartuje stary backend.
export async function przywrocSnapshot(katalog, nazwa) {
  if (basename(nazwa) !== nazwa || !/^[a-f0-9]{40}-.*\.sqlite$/.test(nazwa)) throw new Error('Niepoprawny snapshot rollbacku.')
  const sciezka = resolve(katalog, 'data/aktualizacja-rpi/backups', nazwa)
  sprawdzBaze(sciezka)
  const docelowa = resolve(katalog, 'data/ogarniacz.sqlite')
  const tymczasowa = `${docelowa}.rollback-${randomUUID()}`
  const baza = new DatabaseSync(sciezka, { readOnly: true })
  try {
    await wykonajKopieSqlite(baza, tymczasowa)
    sprawdzBaze(tymczasowa)
    utrwalPlik(tymczasowa)
    rmSync(`${docelowa}-wal`, { force: true })
    rmSync(`${docelowa}-shm`, { force: true })
    renameSync(tymczasowa, docelowa)
  } finally { baza.close(); rmSync(tymczasowa, { force: true }) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [akcja, katalog, parametr] = process.argv.slice(2)
  try {
    if (akcja === 'preflight') {
      sprawdzKonfiguracje(readFileSync(parametr, 'utf8'), katalog)
      sprawdzServe(readFileSync(0, 'utf8'))
    } else if (akcja === 'auto') {
      process.exitCode = parseEnv(readFileSync(parametr, 'utf8')).RPI_AUTO_UPDATE === '1' ? 0 : 2
    } else if (akcja === 'backup') console.log(await wykonajSnapshot(katalog, parametr))
    else if (akcja === 'restore') await przywrocSnapshot(katalog, parametr)
    else throw new Error('Nieznana operacja zabezpieczeń Raspberry.')
  } catch {
    // Nie wypisuj danych parsera, konfiguracji, ścieżek ani wartości sekretów.
    console.error('Zabezpieczenia Raspberry: operacja nie przeszła; sprawdź konfigurację i stan lokalnie.')
    process.exitCode = 1
  }
}
