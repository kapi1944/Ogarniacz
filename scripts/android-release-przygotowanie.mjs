import { readFile, writeFile } from 'node:fs/promises'
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

export function przygotujWydanie({ pakiet, lock, zgodnosc, rodzajWersji, wersjaOpublikowana }) {
  if (!pakiet?.version || !lock || !zgodnosc) throw new Error('Brak plików wymaganych do przygotowania wydania.')
  const wersjaBazowa = wersjaOpublikowana && porownajWersje(wersjaOpublikowana, pakiet.version) > 0
    ? wersjaOpublikowana
    : pakiet.version
  const wersja = wyznaczNastepnaWersje(wersjaBazowa, rodzajWersji)
  const kodWersji = obliczKodWersji(wersja)
  if (!Number.isInteger(zgodnosc.minNativeVersionCode) || zgodnosc.minNativeVersionCode >= kodWersji) {
    throw new Error('Nowy versionCode musi być większy od obecnego minNativeVersionCode Web OTA.')
  }
  const nowyPakiet = { ...pakiet, version: wersja }
  const nowyLock = {
    ...lock,
    version: wersja,
    packages: lock.packages ? { ...lock.packages, '': { ...lock.packages[''], version: wersja } } : lock.packages,
  }
  const nowaZgodnosc = { ...zgodnosc, minNativeVersionCode: kodWersji }
  return { wersja, kodWersji, pakiet: nowyPakiet, lock: nowyLock, zgodnosc: nowaZgodnosc }
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
  const [tekstPakietu, tekstLocka, tekstZgodnosci] = await Promise.all([
    readFile(resolve(katalog, SCIEZKA_PAKIETU), 'utf8'),
    readFile(resolve(katalog, SCIEZKA_LOCK), 'utf8'),
    readFile(resolve(katalog, SCIEZKA_ZGODNOSCI), 'utf8'),
  ])
  const wynik = przygotujWydanie({
    pakiet: JSON.parse(tekstPakietu),
    lock: JSON.parse(tekstLocka),
    zgodnosc: JSON.parse(tekstZgodnosci),
    rodzajWersji: opcje['version-bump'],
    wersjaOpublikowana: opcje['published-version'],
  })
  if (!opcje['dry-run']) {
    await Promise.all([
      writeFile(resolve(katalog, SCIEZKA_PAKIETU), `${JSON.stringify(wynik.pakiet, null, 2)}\n`),
      writeFile(resolve(katalog, SCIEZKA_LOCK), `${JSON.stringify(wynik.lock, null, 2)}\n`),
      writeFile(resolve(katalog, SCIEZKA_ZGODNOSCI), `${JSON.stringify(wynik.zgodnosc, null, 2)}\n`),
    ])
  }
  return wynik
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  uruchomPrzygotowanie(pobierzArgumenty(process.argv.slice(2))).then((wynik) => {
    console.log(`Android release przygotowany: ${wynik.wersja} (${wynik.kodWersji})`)
  }).catch((blad) => {
    console.error(blad instanceof Error ? blad.message : String(blad))
    process.exitCode = 1
  })
}
