import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
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

export function obliczSha256(sciezkaPliku) {
  return new Promise((rozwiaz, odrzuc) => {
    const skrot = createHash('sha256')
    const strumien = createReadStream(sciezkaPliku)
    strumien.on('data', (fragment) => skrot.update(fragment))
    strumien.on('error', odrzuc)
    strumien.on('end', () => rozwiaz(skrot.digest('hex')))
  })
}

export async function utworzManifestAktualizacji({ wersja, sciezkaApk, bazowyAdres, opublikowano = new Date() }) {
  const nazwaApk = basename(sciezkaApk)
  const baza = bazowyAdres?.trim()
  const apkUrl = baza
    ? new URL(encodeURIComponent(nazwaApk), baza.endsWith('/') ? baza : `${baza}/`).toString()
    : nazwaApk

  return {
    version: wersja,
    versionCode: obliczKodWersji(wersja),
    apkUrl,
    sha256: await obliczSha256(sciezkaApk),
    publishedAt: opublikowano.toISOString(),
  }
}

export function walidujManifestAktualizacji(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('Manifest aktualizacji musi być obiektem JSON.')
  if (typeof manifest.version !== 'string') throw new Error('Manifest nie zawiera prawidłowej wersji.')
  if (manifest.versionCode !== obliczKodWersji(manifest.version)) {
    throw new Error('versionCode nie odpowiada polu version.')
  }
  if (typeof manifest.apkUrl !== 'string' || manifest.apkUrl.trim() === '') {
    throw new Error('Manifest nie zawiera adresu APK.')
  }
  if (typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(manifest.sha256)) {
    throw new Error('Manifest nie zawiera prawidłowego SHA-256.')
  }
  if (typeof manifest.publishedAt !== 'string' || Number.isNaN(Date.parse(manifest.publishedAt))) {
    throw new Error('Manifest nie zawiera prawidłowej daty publikacji.')
  }
  return manifest
}
