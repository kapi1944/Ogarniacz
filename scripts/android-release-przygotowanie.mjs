import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { obliczKodWersji, rozlozWersje } from './android-wspolne.mjs'

const SCIEZKA_PAKIETU = 'package.json'
const SCIEZKA_LOCK = 'package-lock.json'
const SCIEZKA_ZGODNOSCI = 'config/web-ota-compatibility.json'

function porownajWersje(lewa, prawa) {
  const lewaCzesci = rozlozWersje(lewa)
  const prawaCzesci = rozlozWersje(prawa)
  for (let indeks = 0; indeks < lewaCzesci.length; indeks += 1) {
    if (lewaCzesci[indeks] !== prawaCzesci[indeks]) return lewaCzesci[indeks] - prawaCzesci[indeks]
  }
  return 0
}

export function wyznaczNastepnaWersje(wersja, rodzaj) {
  const [glowna, poboczna, poprawka] = rozlozWersje(wersja)
  if (rodzaj === 'patch') return `${glowna}.${poboczna}.${poprawka + 1}`
  if (rodzaj === 'minor') return `${glowna}.${poboczna + 1}.0`
  if (rodzaj === 'major') return `${glowna + 1}.0.0`
  throw new Error('version_bump musi mieć wartość patch, minor albo major.')
}

export function przygotujWydanie({ pakiet, lock, rodzajWersji, wersjaOpublikowana, wersjaMaTag = false }) {
  if (!pakiet?.version || !lock) throw new Error('Brak plików wymaganych do przygotowania wydania.')
  if (wersjaOpublikowana && porownajWersje(pakiet.version, wersjaOpublikowana) > 0) {
    throw new Error('Repozytorium zawiera nieopublikowaną wersję. Użyj jawnego wznowienia zamiast kolejnego wydania.')
  }
  if (wersjaMaTag && !wersjaOpublikowana) throw new Error('Istniejący tag wymaga potwierdzenia opublikowanej wersji.')
  const wersjaBazowa = wersjaOpublikowana && porownajWersje(wersjaOpublikowana, pakiet.version) > 0
    ? wersjaOpublikowana : pakiet.version
  const wersja = wyznaczNastepnaWersje(wersjaBazowa, rodzajWersji)
  const kodWersji = obliczKodWersji(wersja)
  const nowyPakiet = { ...pakiet, version: wersja }
  const nowyLock = {
    ...lock, version: wersja,
    packages: lock.packages ? { ...lock.packages, '': { ...lock.packages[''], version: wersja } } : lock.packages,
  }
  return { wersja, kodWersji, pakiet: nowyPakiet, lock: nowyLock, tryb: 'nowe' }
}

function czyWersjaMaTag(wersja, katalog) {
  try {
    const wynik = execFileSync('git', ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/v${wersja}`], {
      cwd: katalog,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return Boolean(wynik.trim())
  } catch (blad) {
    if (blad && typeof blad === 'object' && blad.status === 2) return false
    throw blad
  }
}

function pobierzArgumenty(argumenty) {
  const wynik = {}
  for (let indeks = 0; indeks < argumenty.length; indeks += 1) {
    const argument = argumenty[indeks]
    if (!argument.startsWith('--')) continue
    const nazwa = argument.slice(2)
    const wartosc = argumenty[indeks + 1]
    if (nazwa === 'dry-run') wynik[nazwa] = true
    else if (wartosc && !wartosc.startsWith('--')) {
      wynik[nazwa] = wartosc
      indeks += 1
    } else throw new Error(`Brak wartości --${nazwa}.`)
  }
  return wynik
}

export async function uruchomPrzygotowanie(opcje, katalog = process.cwd()) {
  const [tekstPakietu, tekstLocka] = await Promise.all([
    readFile(resolve(katalog, SCIEZKA_PAKIETU), 'utf8'),
    readFile(resolve(katalog, SCIEZKA_LOCK), 'utf8'),
  ])
  const pakiet = JSON.parse(tekstPakietu)
  const wynik = przygotujWydanie({
    pakiet,
    lock: JSON.parse(tekstLocka),
    rodzajWersji: opcje['version-bump'],
    wersjaOpublikowana: opcje['published-version'],
    wersjaMaTag: czyWersjaMaTag(pakiet.version, katalog),
  })
  if (!opcje['dry-run']) {
    await Promise.all([
      writeFile(resolve(katalog, SCIEZKA_PAKIETU), `${JSON.stringify(wynik.pakiet, null, 2)}\n`),
      writeFile(resolve(katalog, SCIEZKA_LOCK), `${JSON.stringify(wynik.lock, null, 2)}\n`),
    ])
  }
  return wynik
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  uruchomPrzygotowanie(pobierzArgumenty(process.argv.slice(2))).then((wynik) => {
    console.log(`Android release ${wynik.tryb}: ${wynik.wersja} (${wynik.kodWersji})`)
  }).catch((blad) => {
    console.error(blad instanceof Error ? blad.message : String(blad))
    process.exitCode = 1
  })
}
