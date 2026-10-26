import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, writeFile, appendFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import konfiguracjaRelease from '../config/android-release.json' with { type: 'json' }

const wymagaj = (warunek, komunikat) => { if (!warunek) throw new Error(komunikat) }
export function numeracjaBety(numer, proba = 1) {
  wymagaj(/^[1-9][0-9]*$/.test(String(numer)) && Number.isSafeInteger(Number(numer)) && Number(numer) <= 2_100_000_000 && Number(proba) === 1, 'Nieprawidłowa numeracja Beta lub ponowienie workflow.')
  return { kod: Number(numer), wersja: `1.1.0-beta.${numer}` }
}
export function sprawdzPodpisBety(wynik, przypiety) {
  wymagaj(/^[a-f0-9]{64}$/.test(przypiety ?? ''), 'Brak poprawnego przypiętego SHA-256 Beta.')
  wymagaj(przypiety !== konfiguracjaRelease.sha256Certyfikatu.replaceAll(':', '').toLowerCase(), 'Beta nie może używać certyfikatu produkcyjnego.')
  const certyfikaty = [...wynik.matchAll(/^Signer #\d+ certificate SHA-256 digest: ([a-f0-9]{64})\r?$/gm)]
  wymagaj(certyfikaty.length === 1 && certyfikaty[0][1] === przypiety, 'Niezgodny podpis Android Beta.')
  return certyfikaty[0][1]
}
export function sprawdzPakietBety(wynik, kontekst) {
  const numeracja = numeracjaBety(kontekst.numerBuildu, kontekst.proba)
  const pakiet = wynik.match(/^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/m)
  wymagaj(pakiet?.[1] === 'pl.ogarniacz.app.beta' && pakiet[2] === String(numeracja.kod) && pakiet[3] === numeracja.wersja, 'Nieprawidłowy pakiet lub numeracja APK Beta.')
}
export function zweryfikujApkBety(sciezka, kontekst, srodowisko = process.env) {
  const narzedzia = join(srodowisko.ANDROID_HOME ?? srodowisko.ANDROID_SDK_ROOT ?? '', 'build-tools/36.0.0')
  try {
    const podpis = execFileSync(join(narzedzia, 'apksigner'), ['verify', '--verbose', '--print-certs', sciezka], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    const certyfikat = sprawdzPodpisBety(podpis, srodowisko.ANDROID_BETA_CERT_SHA256)
    sprawdzPakietBety(execFileSync(join(narzedzia, 'aapt'), ['dump', 'badging', sciezka], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), kontekst)
    return certyfikat
  } catch { throw new Error('Weryfikacja pakietu, numeracji lub podpisu APK Beta nie powiodła się.') }
}
export async function przygotujPodpisBety(srodowisko = process.env) {
  const pola = ['ANDROID_BETA_KEYSTORE_BASE64', 'ANDROID_BETA_STORE_PASSWORD', 'ANDROID_BETA_KEY_PASSWORD', 'ANDROID_BETA_KEY_ALIAS', 'ANDROID_BETA_CERT_SHA256']
  if (pola.some((pole) => !srodowisko[pole]?.trim())) {
    await appendFile(srodowisko.GITHUB_STEP_SUMMARY, 'Android Beta: **wymaga konfiguracji** trwałego klucza i fingerprintu. APK pominięto. Procedura: docs/AKTUALIZACJE_TESTOWE.md.\n')
    return
  }
  wymagaj(/^[a-f0-9]{64}$/.test(srodowisko.ANDROID_BETA_CERT_SHA256), 'Niepoprawny fingerprint Beta.')
  const katalog = join(srodowisko.RUNNER_TEMP, 'ogarniacz-beta')
  await mkdir(katalog, { recursive: true, mode: 0o700 })
  const sciezka = join(katalog, 'beta.jks')
  const bajty = Buffer.from(srodowisko.ANDROID_BETA_KEYSTORE_BASE64, 'base64')
  wymagaj(bajty.length > 0, 'Pusty keystore Beta.')
  await writeFile(sciezka, bajty, { mode: 0o600, flag: 'wx' })
  bajty.fill(0)
  const certyfikat = execFileSync('keytool', ['-exportcert', '-keystore', sciezka, '-alias', srodowisko.ANDROID_BETA_KEY_ALIAS, '-storepass:env', 'ANDROID_BETA_STORE_PASSWORD'], { env: srodowisko, stdio: ['ignore', 'pipe', 'pipe'] })
  const fingerprint = createHash('sha256').update(certyfikat).digest('hex')
  sprawdzPodpisBety(`Signer #1 certificate SHA-256 digest: ${fingerprint}\n`, srodowisko.ANDROID_BETA_CERT_SHA256)
  await appendFile(srodowisko.GITHUB_ENV, `ANDROID_BETA_KEYSTORE_PATH=${sciezka}\n`)
  await appendFile(srodowisko.GITHUB_OUTPUT, 'gotowy=true\n')
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  przygotujPodpisBety().catch(() => { console.error('Nie udało się przygotować podpisu Beta.'); process.exitCode = 1 })
}
