import { createHash } from 'node:crypto'
import { createReadStream, statSync } from 'node:fs'
import { basename } from 'node:path'

export function rozlozWersje(wersja) {
  const dopasowanie = /^(\d+)\.(\d+)\.(\d+)$/.exec(wersja)
  if (!dopasowanie) throw new Error('Wersja musi mieć format X.Y.Z.')

  const skladowe = dopasowanie.slice(1).map(Number)
  if (skladowe.some((wartosc) => wartosc > 999)) {
    throw new Error('Każda część wersji musi być liczbą od 0 do 999.')
  }
  return skladowe
}

export function obliczKodWersji(wersja) {
  const [glowna, poboczna, poprawka] = rozlozWersje(wersja)
  const kod = glowna * 1_000_000 + poboczna * 1_000 + poprawka
  if (kod < 1 || kod > 2_100_000_000) throw new Error('Wersja przekracza zakres versionCode Androida.')
  return kod
}

export function czyZgodnyJdk(wersja, wymaganaWersja) {
  return Number.isInteger(wersja) && wersja === wymaganaWersja
}

export function obliczSha256(sciezkaPliku) {
  return new Promise((rozwiaz, odrzuc) => {
    const skrot = createHash('sha256')
    const strumien = createReadStream(sciezkaPliku)
    strumien.on('data', (fragment) => skrot.update(fragment))
    strumien.on('error', odrzuc)
    strumien.on('end', () => rozwiaz(skrot.digest('hex')))
  })
}

export async function utworzManifestAktualizacji({ wersja, sciezkaApk, bazowyAdres, notatkiWydania, opublikowano = new Date() }) {
  const nazwaApk = basename(sciezkaApk)
  const baza = bazowyAdres?.trim()
  const apkUrl = baza
    ? new URL(encodeURIComponent(nazwaApk), baza.endsWith('/') ? baza : `${baza}/`).toString()
    : nazwaApk

  return {
    versionName: wersja,
    versionCode: obliczKodWersji(wersja),
    apkUrl,
    sha256: await obliczSha256(sciezkaApk),
    size: statSync(sciezkaApk).size,
    ...(notatkiWydania?.trim() ? { releaseNotes: notatkiWydania.trim() } : {}),
    publishedAt: opublikowano.toISOString(),
  }
}

export function walidujManifestAktualizacji(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('Manifest aktualizacji musi być obiektem JSON.')
  if (typeof manifest.versionName !== 'string') throw new Error('Manifest nie zawiera prawidłowego versionName.')
  if (manifest.versionCode !== obliczKodWersji(manifest.versionName)) {
    throw new Error('versionCode nie odpowiada polu versionName.')
  }
  if (typeof manifest.apkUrl !== 'string' || manifest.apkUrl.trim() === '') {
    throw new Error('Manifest nie zawiera adresu APK.')
  }
  if (typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(manifest.sha256)) {
    throw new Error('Manifest nie zawiera prawidłowego SHA-256.')
  }
  if (manifest.size !== undefined && (!Number.isInteger(manifest.size) || manifest.size <= 0)) {
    throw new Error('Manifest zawiera nieprawidłowy rozmiar APK.')
  }
  if (manifest.releaseNotes !== undefined && typeof manifest.releaseNotes !== 'string') {
    throw new Error('Manifest zawiera nieprawidłowe informacje o wydaniu.')
  }
  if (manifest.publishedAt !== undefined && (typeof manifest.publishedAt !== 'string' || Number.isNaN(Date.parse(manifest.publishedAt)))) {
    throw new Error('Manifest nie zawiera prawidłowej daty publikacji.')
  }
  return manifest
}

export function parsujUrzadzeniaAdb(tekst) {
  return tekst.split(/\r?\n/).slice(1).map((wiersz) => wiersz.trim()).filter(Boolean).map((wiersz) => {
    const [serial, stan, ...pola] = wiersz.split(/\s+/)
    const wartosci = Object.fromEntries(pola.filter((pole) => pole.includes(':')).map((pole) => {
      const indeks = pole.indexOf(':')
      return [pole.slice(0, indeks), pole.slice(indeks + 1)]
    }))
    return {
      serial,
      stan,
      model: (wartosci.model ?? wartosci.device ?? 'Android').replaceAll('_', ' '),
      transport: wartosci.usb ? 'USB' : 'Wi-Fi',
    }
  })
}

export function wybierzUrzadzenieAdb(urzadzenia, wskazanySerial) {
  if (wskazanySerial) {
    const wskazane = urzadzenia.find((urzadzenie) => urzadzenie.serial === wskazanySerial)
    if (!wskazane) throw new Error(`ADB nie widzi urządzenia o serialu ${wskazanySerial}.`)
    if (wskazane.stan !== 'device') throw new Error(`Urządzenie ${wskazanySerial} ma status ${wskazane.stan}.`)
    return wskazane
  }

  const aktywne = urzadzenia.filter((urzadzenie) => urzadzenie.stan === 'device')
  if (aktywne.length === 1) return aktywne[0]
  if (aktywne.length > 1) {
    const lista = aktywne.map((urzadzenie) => `${urzadzenie.serial} (${urzadzenie.model}, ${urzadzenie.transport})`).join(', ')
    throw new Error(`Wykryto więcej niż jedno aktywne urządzenie: ${lista}. Użyj --device SERIAL.`)
  }
  const nieautoryzowane = urzadzenia.filter((urzadzenie) => urzadzenie.stan === 'unauthorized')
  if (nieautoryzowane.length) throw new Error(`Urządzenie ${nieautoryzowane.map((urzadzenie) => urzadzenie.serial).join(', ')} jest unauthorized. Potwierdź klucz RSA na telefonie.`)
  const offline = urzadzenia.filter((urzadzenie) => urzadzenie.stan === 'offline')
  if (offline.length) throw new Error(`Urządzenie ${offline.map((urzadzenie) => urzadzenie.serial).join(', ')} jest offline. Połącz je ponownie przez USB lub adb connect.`)
  throw new Error('ADB nie widzi żadnego urządzenia. Podłącz USB albo uruchom Wireless Debugging i adb connect.')
}
