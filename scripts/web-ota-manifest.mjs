import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAKSYMALNY_ROZMIAR_ZIP = 50 * 1024 * 1024

function pobierzArgumenty(argumenty) {
  const wynik = {}
  for (let indeks = 0; indeks < argumenty.length; indeks += 2) {
    const nazwa = argumenty[indeks]
    const wartosc = argumenty[indeks + 1]
    if (!nazwa?.startsWith('--') || wartosc === undefined) throw new Error(`Nieprawidlowy argument: ${nazwa ?? ''}`)
    wynik[nazwa.slice(2)] = wartosc
  }
  return wynik
}

function wymagajTekstu(wartosc, nazwa) {
  if (typeof wartosc !== 'string' || !wartosc.trim()) throw new Error(`Brak ${nazwa}.`)
  return wartosc.trim()
}

export function utworzDaneDoPodpisuWeb(manifest) {
  return [
    'ogarniacz-web-ota-v1',
    manifest.bundleVersion,
    manifest.commitSha.toLowerCase(),
    manifest.url,
    manifest.sha256.toLowerCase(),
    String(manifest.minNativeVersionCode),
    manifest.publishedAt,
  ].join('\n')
}

export function obliczOdciskKluczaPublicznego(kluczPrywatnyPem) {
  const kluczPubliczny = createPublicKey(createPrivateKey(kluczPrywatnyPem))
  const daneDer = kluczPubliczny.export({ type: 'spki', format: 'der' })
  return createHash('sha256').update(daneDer).digest('hex')
}

export function obliczKodWersjiNatywnej(wersja) {
  const dopasowanie = /^(\d+)\.(\d+)\.(\d+)$/.exec(wymagajTekstu(wersja, 'wersji w package.json'))
  if (!dopasowanie) throw new Error('Wersja w package.json musi miec format X.Y.Z.')
  const [, glowna, poboczna, poprawka] = dopasowanie.map(Number)
  const kodWersji = glowna * 1_000_000 + poboczna * 1_000 + poprawka
  if (!Number.isSafeInteger(kodWersji) || kodWersji <= 0 || kodWersji > 2_100_000_000) {
    throw new Error('Wersja w package.json daje nieprawidlowy versionCode.')
  }
  return kodWersji
}

export function utworzPodpisanyManifest({
  bundleVersion,
  commitSha,
  url,
  sha256,
  minNativeVersionCode,
  publishedAt,
  kluczPrywatnyPem,
  oczekiwanyOdciskKlucza,
}) {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(bundleVersion)) throw new Error('Nieprawidlowy bundleVersion.')
  if (!/^[a-f0-9]{40}$/i.test(commitSha)) throw new Error('Nieprawidlowy commitSha.')
  if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error('Nieprawidlowy SHA-256 ZIP.')
  if (!Number.isSafeInteger(minNativeVersionCode) || minNativeVersionCode <= 0 || minNativeVersionCode > 2_100_000_000) {
    throw new Error('Nieprawidlowy minNativeVersionCode.')
  }
  const adres = new URL(url)
  if (adres.protocol !== 'https:' || adres.pathname.includes('/releases/latest/')) {
    throw new Error('Adres ZIP musi uzywac HTTPS i osobnego kanalu Web OTA.')
  }
  if (Number.isNaN(Date.parse(publishedAt))) throw new Error('Nieprawidlowy publishedAt.')

  const kluczPrywatny = createPrivateKey(kluczPrywatnyPem)
  if (kluczPrywatny.asymmetricKeyType !== 'rsa' || (kluczPrywatny.asymmetricKeyDetails?.modulusLength ?? 0) < 3072) {
    throw new Error('Web OTA wymaga klucza RSA o dlugosci co najmniej 3072 bitow.')
  }
  const odcisk = obliczOdciskKluczaPublicznego(kluczPrywatnyPem)
  if (oczekiwanyOdciskKlucza && odcisk !== oczekiwanyOdciskKlucza.toLowerCase()) {
    throw new Error('Klucz prywatny nie odpowiada publicznemu kluczowi osadzonemu w APK.')
  }

  const manifestBezPodpisu = {
    bundleVersion,
    commitSha: commitSha.toLowerCase(),
    url,
    sha256: sha256.toLowerCase(),
    minNativeVersionCode,
    publishedAt,
  }
  const dane = Buffer.from(utworzDaneDoPodpisuWeb(manifestBezPodpisu), 'utf8')
  const signature = sign('RSA-SHA256', dane, kluczPrywatny).toString('base64')
  if (!verify('RSA-SHA256', dane, createPublicKey(kluczPrywatny), Buffer.from(signature, 'base64'))) {
    throw new Error('Nie udalo sie zweryfikowac utworzonego podpisu.')
  }
  return { ...manifestBezPodpisu, signature }
}

export async function wygenerujManifest(argumenty, srodowisko = process.env) {
  const plikZip = resolve(wymagajTekstu(argumenty.zip, '--zip'))
  const plikWyjsciowy = resolve(wymagajTekstu(argumenty.output, '--output'))
  const daneZip = await readFile(plikZip)
  if (daneZip.length === 0 || daneZip.length > MAKSYMALNY_ROZMIAR_ZIP) {
    throw new Error(`ZIP musi miec od 1 do ${MAKSYMALNY_ROZMIAR_ZIP} bajtow.`)
  }
  const commitSha = wymagajTekstu(argumenty['commit-sha'] ?? srodowisko.GITHUB_SHA, '--commit-sha lub GITHUB_SHA')
  const bundleVersion = wymagajTekstu(argumenty['bundle-version'] ?? srodowisko.WEB_OTA_BUNDLE_VERSION ?? commitSha.slice(0, 7), '--bundle-version')
  const minNativeVersionCode = argumenty['min-native-version-code']
    ? Number(wymagajTekstu(argumenty['min-native-version-code'], '--min-native-version-code'))
    : obliczKodWersjiNatywnej(JSON.parse(await readFile(resolve('package.json'), 'utf8')).version)
  const kluczPrywatnyPem = wymagajTekstu(srodowisko.WEB_OTA_PRIVATE_KEY, 'sekretu WEB_OTA_PRIVATE_KEY')
  const oczekiwanyOdciskKlucza = wymagajTekstu(srodowisko.WEB_OTA_PUBLIC_KEY_SHA256, 'WEB_OTA_PUBLIC_KEY_SHA256')
  if (!/^[a-f0-9]{64}$/i.test(oczekiwanyOdciskKlucza)) throw new Error('Nieprawidlowy WEB_OTA_PUBLIC_KEY_SHA256.')

  const manifest = utworzPodpisanyManifest({
    bundleVersion,
    commitSha,
    url: wymagajTekstu(argumenty.url, '--url'),
    sha256: createHash('sha256').update(daneZip).digest('hex'),
    minNativeVersionCode,
    publishedAt: argumenty['published-at'] ?? new Date().toISOString(),
    kluczPrywatnyPem,
    oczekiwanyOdciskKlucza,
  })
  await mkdir(dirname(plikWyjsciowy), { recursive: true })
  await writeFile(plikWyjsciowy, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  wygenerujManifest(pobierzArgumenty(process.argv.slice(2)))
    .then((manifest) => console.log(`Manifest Web OTA gotowy: ${manifest.bundleVersion} (${manifest.commitSha.slice(0, 7)})`))
    .catch((blad) => {
      console.error(blad instanceof Error ? blad.message : String(blad))
      process.exitCode = 1
    })
}
