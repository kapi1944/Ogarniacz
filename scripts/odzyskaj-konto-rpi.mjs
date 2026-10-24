import { createHash, randomBytes } from 'node:crypto'
import { accessSync, constants, lstatSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline/promises'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const BAZA_PRODUKCYJNA = '/home/kacper/apps/Ogarniacz/data/ogarniacz.sqlite'
const ORIGIN_PRODUKCYJNY = 'https://raspberrypi.tailb0bcf2.ts.net'

class BladOdzyskiwania extends Error {}

// Prywatny katalog (np. /home/kacper 0700) jest granicą dostępu także do WAL/SHM.
export function sprawdzUprawnieniaSystemowe(sciezka) {
  const uid = process.geteuid?.()
  if (uid === undefined || uid === 0 || uid !== process.getuid()) throw new BladOdzyskiwania('Uruchom jako właściciel bazy, bez sudo i podnoszenia uprawnień.')
  let prywatnyKatalog = false
  const korzen = parse(sciezka).root
  const czesci = relative(korzen, sciezka).split('/')
  let obecna = korzen
  for (const czesc of ['', ...czesci]) {
    if (czesc) obecna = join(obecna, czesc)
    const stan = lstatSync(obecna)
    if (stan.isSymbolicLink() || ![0, uid].includes(stan.uid)) throw new BladOdzyskiwania('Niebezpieczny właściciel lub dowiązanie w ścieżce bazy.')
    if (stan.isDirectory()) {
      if (!prywatnyKatalog && (stan.mode & 0o022) && !(stan.uid === 0 && (stan.mode & 0o1000))) throw new BladOdzyskiwania('Katalog przed granicą prywatności jest zapisywalny przez innych użytkowników.')
      if (stan.uid === uid && !(stan.mode & 0o077)) prywatnyKatalog = true
    } else if (obecna !== sciezka || !stan.isFile() || stan.uid !== uid || stan.nlink !== 1) {
      throw new BladOdzyskiwania('Baza musi być zwykłym plikiem należącym do bieżącego użytkownika, bez dowiązań.')
    }
  }
  if (!prywatnyKatalog) throw new BladOdzyskiwania('Brak prywatnego katalogu właściciela (0700) chroniącego bazę i WAL/SHM. Wymagana decyzja administratora.')
  for (const koncowka of ['-wal', '-shm']) {
    try {
      const stan = lstatSync(sciezka + koncowka)
      if (!stan.isFile() || stan.isSymbolicLink() || stan.uid !== uid || stan.nlink !== 1) throw new BladOdzyskiwania('Niebezpieczny plik WAL/SHM.')
    } catch (blad) { if (blad.code !== 'ENOENT') throw blad }
  }
}

function sprawdzSciezke(sciezka, testowa) {
  if (!isAbsolute(sciezka) || resolve(sciezka) !== sciezka || realpathSync(sciezka) !== sciezka || !lstatSync(sciezka).isFile()) throw new BladOdzyskiwania('Wymagana kanoniczna, bezwzględna ścieżka istniejącej bazy, bez dowiązań.')
  if (testowa) {
    const wzgledna = relative(realpathSync(tmpdir()), sciezka)
    if (!wzgledna || wzgledna.startsWith('..') || isAbsolute(wzgledna) || sciezka === BAZA_PRODUKCYJNA) throw new BladOdzyskiwania('Baza syntetyczna musi znajdować się w katalogu tymczasowym systemu.')
  } else if (process.platform !== 'linux' || sciezka !== BAZA_PRODUKCYJNA) {
    throw new BladOdzyskiwania('Tryb produkcyjny wymaga Raspberry Pi/Linux i stałej ścieżki bazy.')
  }
  if (process.platform === 'linux') sprawdzUprawnieniaSystemowe(sciezka)
  else if (!testowa) throw new BladOdzyskiwania('Nie można sprawdzić uprawnień systemowych.')
}

export function otworzBazeOdzyskiwania({ sciezka = BAZA_PRODUKCYJNA, testowa = false, zapis = false } = {}) {
  sprawdzSciezke(sciezka, testowa)
  accessSync(sciezka, constants.R_OK | (zapis ? constants.W_OK : 0))
  if (zapis) accessSync(dirname(sciezka), constants.W_OK | constants.X_OK)
  // Najpierw tylko odczyt: nigdy nie tworzymy ani nie migrujemy bazy.
  const odczyt = new DatabaseSync(sciezka, { readOnly: true, timeout: 5000 })
  try {
    if (testowa && odczyt.prepare("SELECT nazwa FROM odzyskiwanie_testowe WHERE nazwa = 'syntetyczna'").get()?.nazwa !== 'syntetyczna') throw new BladOdzyskiwania('Brak znacznika syntetycznej bazy.')
    if (!odczyt.prepare('SELECT wersja FROM migracje WHERE wersja = 8').get()) throw new BladOdzyskiwania('Backend wymaga istniejącego schematu resetowania hasła (migracja 8). Nie uruchamiaj migracji tym narzędziem.')
    odczyt.prepare('SELECT token_hash, uzytkownik_id, wygasa_at FROM tokeny_resetowania_hasla LIMIT 0').all()
    if (!zapis) return odczyt
  } catch (blad) { odczyt.close(); throw blad }
  odczyt.close()
  const baza = new DatabaseSync(sciezka, { timeout: 5000 })
  baza.exec('PRAGMA foreign_keys = ON')
  return baza
}

export function pobierzKonta(baza) {
  return baza.prepare(`SELECT u.id AS uuid, u.login, u.email, u.rola_systemowa AS rolaSystemowa,
    u.status_konta AS statusKonta, EXISTS (SELECT 1 FROM czlonkostwa c
      WHERE c.uzytkownik_id = u.id AND c.wlasciciel_id = u.id AND c.rola = 'wlasciciel' AND c.status = 'aktywne') AS wlasciciel
    FROM uzytkownicy u ORDER BY u.id`).all()
}

export function wydajLinkResetowania(baza, id) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new BladOdzyskiwania('Podaj UUID istniejącego konta z polecenia list.')
  baza.exec('BEGIN IMMEDIATE')
  try {
    const konto = baza.prepare('SELECT status_konta FROM uzytkownicy WHERE id = ?').get(id)
    if (!konto) throw new BladOdzyskiwania('Nie znaleziono konta o wskazanym UUID.')
    if (konto.status_konta !== 'aktywne') throw new BladOdzyskiwania('Konto nie jest aktywne. Narzędzie nie zmienia statusu kont.')
    const token = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const wygasaAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    // Zastępujemy wyłącznie wcześniejsze linki tego konta; hasło i sesje pozostają do resetu.
    baza.prepare('DELETE FROM tokeny_resetowania_hasla WHERE uzytkownik_id = ?').run(id)
    baza.prepare('INSERT INTO tokeny_resetowania_hasla (token_hash, uzytkownik_id, wygasa_at) VALUES (?, ?, ?)').run(tokenHash, id, wygasaAt)
    baza.exec('COMMIT')
    return { link: `${ORIGIN_PRODUKCYJNY}/#reset-hasla=${token}`, wygasaAt }
  } catch (blad) { baza.exec('ROLLBACK'); throw blad }
}

async function uruchom() {
  const [tryb, ...argumenty] = process.argv.slice(2)
  if (!['list', 'issue'].includes(tryb)) throw new BladOdzyskiwania('Użycie: node scripts/odzyskaj-konto-rpi.mjs list | issue --user-id UUID [--test-db /tmp/syntetyczna.sqlite]')
  const opcje = {}
  for (let indeks = 0; indeks < argumenty.length; indeks += 2) {
    const klucz = argumenty[indeks], wartosc = argumenty[indeks + 1]
    if (!['--user-id', '--test-db'].includes(klucz) || !wartosc || opcje[klucz]) throw new BladOdzyskiwania('Nieprawidłowe lub powtórzone argumenty.')
    opcje[klucz] = wartosc
  }
  if ((tryb === 'issue') !== Boolean(opcje['--user-id'])) throw new BladOdzyskiwania('Tylko issue wymaga --user-id UUID.')
  const ustawienia = { testowa: Boolean(opcje['--test-db']), sciezka: opcje['--test-db'] ?? BAZA_PRODUKCYJNA }
  if (ustawienia.testowa) process.stderr.write('BAZA SYNTETYCZNA — link służy wyłącznie testom.\n')
  if (tryb === 'issue' && (!process.stdin.isTTY || !process.stdout.isTTY)) throw new BladOdzyskiwania('Wydanie linku wymaga interaktywnego terminala bez przekierowania wyjścia i nagrywania sesji.')
  const baza = otworzBazeOdzyskiwania({ ...ustawienia, zapis: tryb === 'issue' })
  try {
    if (tryb === 'list') { console.table(pobierzKonta(baza)); return }
    const konto = pobierzKonta(baza).find((konto) => konto.uuid === opcje['--user-id'])
    if (!konto || konto.statusKonta !== 'aktywne') throw new BladOdzyskiwania('Nie znaleziono aktywnego konta o wskazanym UUID.')
    console.table([konto])
    const terminal = createInterface({ input: process.stdin, output: process.stdout })
    let potwierdzenie
    try { potwierdzenie = await terminal.question(`Wpisz odzyskaj ${konto.uuid}, aby wydać link: `) }
    finally { terminal.close() }
    if (potwierdzenie !== `odzyskaj ${konto.uuid}`) throw new BladOdzyskiwania('Anulowano: brak zgodnego potwierdzenia.')
    const wynik = wydajLinkResetowania(baza, konto.uuid)
    process.stdout.write(`Ważny do ${wynik.wygasaAt}. Link jednorazowy — nie udostępniaj go ani nie zapisuj w logach:\n${wynik.link}\n`)
  } finally { baza.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  uruchom().catch((blad) => {
    // Błędy SQLite/OS mogą zawierać prywatne ścieżki; nie wypisujemy surowych wyjątków.
    process.stderr.write(blad instanceof BladOdzyskiwania ? blad.message + '\n' : 'Odmowa lub błąd odzyskiwania. Sprawdź UUID, potwierdzenie, uprawnienia, schemat i dostępność bazy według docs/ODZYSKIWANIE_KONTA_RPI.md.\n')
    process.exitCode = 1
  })
}
