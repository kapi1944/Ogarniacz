import { createHash, createPrivateKey, createPublicKey, verify } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { utworzDaneDoPodpisuWeb } from './web-ota-manifest.mjs'
import { wczytajMinNativeVersionCode } from './web-ota-zgodnosc.mjs'

function argumenty(argv) {
  const wynik = {}
  for (let indeks = 0; indeks < argv.length; indeks += 2) {
    const nazwa = argv[indeks]
    const wartosc = argv[indeks + 1]
    if (!nazwa?.startsWith('--') || wartosc === undefined) throw new Error(`Nieprawidlowy argument: ${nazwa ?? ''}`)
    wynik[nazwa.slice(2)] = wartosc
  }
  return wynik
}

function wymagajTekstu(wartosc, nazwa) {
  if (typeof wartosc !== 'string' || !wartosc.trim()) throw new Error(`Brak ${nazwa}.`)
  return wartosc.trim()
}

export async function zweryfikujArtefaktWebOta({ plikZip, plikManifestu, commitSha, kluczPrywatnyPem, oczekiwanyOdciskKlucza }) {
  const [zip, tekstManifestu, minimalnyKodApk] = await Promise.all([
    readFile(resolve(wymagajTekstu(plikZip, '--zip'))),
    readFile(resolve(wymagajTekstu(plikManifestu, '--manifest')), 'utf8'),
    wczytajMinNativeVersionCode(),
  ])
  const manifest = JSON.parse(tekstManifestu)
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(manifest.bundleVersion ?? '')) throw new Error('Manifest ma nieprawidlowy bundleVersion.')
  if (manifest.commitSha !== wymagajTekstu(commitSha, '--commit-sha').toLowerCase()) throw new Error('Manifest nie wskazuje oczekiwanego commit SHA.')
  if (manifest.minNativeVersionCode !== minimalnyKodApk) throw new Error('Manifest ma niezgodny minNativeVersionCode.')
  if (!/^[a-f0-9]{64}$/i.test(manifest.sha256 ?? '') || manifest.sha256.toLowerCase() !== createHash('sha256').update(zip).digest('hex')) {
    throw new Error('SHA-256 ZIP nie zgadza sie z manifestem.')
  }
  if (!/^https:\/\//.test(manifest.url ?? '') || /\/releases\/latest\//.test(manifest.url)) throw new Error('Manifest ma nieprawidlowy kanal ZIP.')
  if (Number.isNaN(Date.parse(manifest.publishedAt ?? ''))) throw new Error('Manifest ma nieprawidlowy publishedAt.')
  const kluczPrywatny = createPrivateKey(wymagajTekstu(kluczPrywatnyPem, 'WEB_OTA_PRIVATE_KEY'))
  const kluczPubliczny = createPublicKey(kluczPrywatny)
  const odcisk = createHash('sha256').update(kluczPubliczny.export({ type: 'spki', format: 'der' })).digest('hex')
  if (odcisk !== wymagajTekstu(oczekiwanyOdciskKlucza, 'WEB_OTA_PUBLIC_KEY_SHA256').toLowerCase()) throw new Error('Klucz podpisu nie odpowiada APK.')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(manifest.signature ?? '') || !verify(
    'RSA-SHA256',
    Buffer.from(utworzDaneDoPodpisuWeb(manifest), 'utf8'),
    kluczPubliczny,
    Buffer.from(manifest.signature, 'base64'),
  )) throw new Error('Podpis manifestu jest nieprawidlowy.')
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opcje = argumenty(process.argv.slice(2))
  zweryfikujArtefaktWebOta({
    plikZip: opcje.zip,
    plikManifestu: opcje.manifest,
    commitSha: opcje['commit-sha'],
    kluczPrywatnyPem: process.env.WEB_OTA_PRIVATE_KEY,
    oczekiwanyOdciskKlucza: process.env.WEB_OTA_PUBLIC_KEY_SHA256,
  }).then(() => console.log('Artefakt Web OTA zweryfikowany.')).catch((blad) => {
    console.error(blad instanceof Error ? blad.message : String(blad))
    process.exitCode = 1
  })
}
