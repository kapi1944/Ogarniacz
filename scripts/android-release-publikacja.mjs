import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { czyToSamArtefaktAktualizacji, pobierzPublicznyManifestPoPublikacji, utworzManifestAktualizacji, walidujManifestAktualizacji } from './android-wspolne.mjs'

const skrot = (dane) => createHash('sha256').update(dane).digest('hex')

export async function zapewnijRelease({ repozytorium, token, manifest, pliki, pobierz = fetch }) {
  walidujManifestAktualizacji(manifest)
  if (manifest.apkUrl !== `Ogarniacz-${manifest.versionName}-release.apk` || !Number.isInteger(manifest.size)) throw new Error('Manifest musi wskazywać asset APK tej wersji i jego rozmiar.')
  const api = `https://api.github.com/repos/${repozytorium}`
  const tag = `v${manifest.versionName}`
  const naglowki = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  async function zadanie(adres, opcje = {}) {
    const odpowiedz = await pobierz(adres, { ...opcje, signal: AbortSignal.timeout(30_000), headers: { ...naglowki, ...opcje.headers } })
    if (!odpowiedz.ok) throw new Error(`GitHub API HTTP ${odpowiedz.status}: ${adres}`)
    return odpowiedz
  }
  const odpowiedz = await pobierz(`${api}/releases/tags/${tag}`, { headers: naglowki, signal: AbortSignal.timeout(30_000) })
  let wydanie
  if (odpowiedz.status === 404) {
    wydanie = await (await zadanie(`${api}/releases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_name: tag, name: tag, body: manifest.releaseNotes || `Ogarniacz ${manifest.versionName}`, draft: true, prerelease: false }) })).json()
  } else {
    if (!odpowiedz.ok) throw new Error(`GitHub release HTTP ${odpowiedz.status}`)
    wydanie = await odpowiedz.json()
  }
  if (wydanie.prerelease) throw new Error('Istniejące wydanie jest prerelease; wymagana ręczna diagnostyka.')
  for (const [nazwa, dane] of pliki) {
    const asset = wydanie.assets?.find((wpis) => wpis.name === nazwa)
    if (asset) {
      const zdalne = Buffer.from(await (await zadanie(asset.url, { headers: { Accept: 'application/octet-stream' } })).arrayBuffer())
      const zgodny = nazwa === 'latest.json'
        ? czyToSamArtefaktAktualizacji(walidujManifestAktualizacji(JSON.parse(zdalne)), manifest)
        : asset.size === dane.length && skrot(zdalne) === skrot(dane)
      if (!zgodny) throw new Error(`Rzeczywista niespójność istniejącego assetu ${nazwa}; niczego nie nadpisano.`)
      continue
    }
    const wysylka = wydanie.upload_url.replace(/\{\?name,label\}$/, '')
    await zadanie(`${wysylka}?name=${encodeURIComponent(nazwa)}`, { method: 'POST', headers: { 'Content-Type': nazwa.endsWith('.json') ? 'application/json' : 'application/octet-stream' }, body: dane })
  }
  if (wydanie.draft) await zadanie(`${api}/releases/${wydanie.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false }) })
  return wydanie
}

export async function sprawdzPublikacje({ repozytorium, manifest, adresManifestu, pobierz = fetch, ...opcje }) {
  if (!adresManifestu || new URL(adresManifestu).protocol !== 'https:') throw new Error('Publiczny manifest wymaga HTTPS.')
  const baza = `https://github.com/${repozytorium}/releases/download/v${manifest.versionName}/`
  await pobierzPublicznyManifestPoPublikacji({ ...opcje, pobierz, adresManifestu: `${baza}latest.json`, oczekiwanyManifest: manifest })
  await pobierzPublicznyManifestPoPublikacji({ ...opcje, timeoutZadaniaMs: 30_000, nazwaZasobu: 'APK przypiętego wydania', adresManifestu: new URL(manifest.apkUrl, baza), oczekiwanyManifest: manifest,
    pobierz: async (adres, ustawienia) => {
      const odpowiedz = await pobierz(adres, ustawienia)
      if (!odpowiedz.ok) return odpowiedz
      return { ok: true, json: async () => {
        const dane = Buffer.from(await odpowiedz.arrayBuffer())
        return { ...manifest, size: dane.length, sha256: skrot(dane) }
      } }
    },
  })
  await pobierzPublicznyManifestPoPublikacji({ ...opcje, pobierz, adresManifestu, oczekiwanyManifest: manifest })
}

export function ustalPunktWznowienia(wersja, git) {
  if (!/^\d+\.\d+\.\d+$/.test(wersja)) throw new Error('Wznowienie wymaga jawnej wersji X.Y.Z.')
  const kandydaci = git('log', 'origin/main', '--format=%H', '--fixed-strings', `--grep=Przygotuj wydanie Androida ${wersja}`).split('\n').filter(Boolean)
  const commit = kandydaci.find((sha) => JSON.parse(git('show', `${sha}:package.json`)).version === wersja)
  if (!commit) throw new Error('Brak commitu wersji na origin/main; nie tworzę nowej wersji.')
  const tag = `v${wersja}`
  const tagi = git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`)
  if (tagi) {
    const sha = tagi.split('\n').at(-1).split(/\s+/)[0]
    if (sha !== commit) throw new Error('Istniejący tag wskazuje inny commit; przerwano wznowienie.')
  }
  return { commit, tag, tagi }
}

export async function wznowWydanie(wersja, katalog = 'android/app/build/outputs/apk/release') {
  const git = (...argumenty) => execFileSync('git', argumenty, { encoding: 'utf8' }).trim()
  const repozytorium = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  if (!repozytorium || !token) throw new Error('Brak konfiguracji GitHub wznowienia.')
  const { commit, tag, tagi } = ustalPunktWznowienia(wersja, git)
  await mkdir(katalog, { recursive: true })
  const api = `https://api.github.com/repos/${repozytorium}/releases/tags/${tag}`
  const odpowiedz = await fetch(api, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) })
  if (!odpowiedz.ok && odpowiedz.status !== 404) throw new Error(`Odczyt release HTTP ${odpowiedz.status}`)
  const wydanie = odpowiedz.ok ? await odpowiedz.json() : undefined
  for (const asset of wydanie?.assets ?? []) {
    if (![ `Ogarniacz-${wersja}-release.apk`, `Ogarniacz-${wersja}-release.apk.sha256`, 'latest.json' ].includes(asset.name)) continue
    const dane = await fetch(asset.url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/octet-stream' }, signal: AbortSignal.timeout(60_000) })
    if (!dane.ok) throw new Error(`Pobranie assetu HTTP ${dane.status}`)
    await writeFile(resolve(katalog, asset.name), Buffer.from(await dane.arrayBuffer()))
  }
  const nazwaApk = `Ogarniacz-${wersja}-release.apk`
  const sciezkaApk = resolve(katalog, nazwaApk)
  let apk
  try { apk = await readFile(sciezkaApk) } catch { throw new Error('Brak oryginalnego APK. Wskaż run z zachowanymi artefaktami; wznowienie nie buduje ani nie podbija wersji.') }
  const wygenerowany = await utworzManifestAktualizacji({ wersja, sciezkaApk })
  let manifest
  try { manifest = JSON.parse(await readFile(resolve(katalog, 'latest.json'), 'utf8')) }
  catch (blad) { if (blad.code !== 'ENOENT') throw blad; manifest = wygenerowany }
  walidujManifestAktualizacji(manifest)
  if (!czyToSamArtefaktAktualizacji(manifest, wygenerowany)) throw new Error('Manifest wznowienia nie odpowiada oryginalnemu APK.')
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  if (!sdk) throw new Error('Brak Android SDK do weryfikacji oryginalnego APK.')
  const narzedzia = resolve(sdk, 'build-tools', (await readdir(resolve(sdk, 'build-tools'))).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0])
  const metadane = execFileSync(resolve(narzedzia, 'aapt'), ['dump', 'badging', sciezkaApk], { encoding: 'utf8' })
  if (!metadane.includes(`package: name='pl.ogarniacz.app' versionCode='${manifest.versionCode}' versionName='${wersja}'`)) throw new Error('APK ma niezgodne metadane Androida.')
  const podpis = execFileSync(resolve(narzedzia, 'apksigner'), ['verify', '--print-certs', sciezkaApk], { encoding: 'utf8' })
  const konfiguracja = JSON.parse(await readFile('config/android-release.json', 'utf8'))
  if (!podpis.toLowerCase().includes(konfiguracja.sha256Certyfikatu.replace(/[:\s]/g, '').toLowerCase())) throw new Error('Nieprawidłowy certyfikat oryginalnego APK.')
  const suma = Buffer.from(`${manifest.sha256}  ${nazwaApk}\n`)
  try { if (!(await readFile(resolve(katalog, `${nazwaApk}.sha256`))).equals(suma)) throw new Error('Niezgodny plik SHA-256.') }
  catch (blad) { if (blad.code !== 'ENOENT') throw blad }
  if (!tagi) {
    let lokalny
    try { lokalny = git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`) } catch { /* Brak lokalnego tagu. */ }
    if (lokalny && lokalny !== commit) throw new Error('Lokalny tag wskazuje inny commit.')
    if (!lokalny) execFileSync('git', ['tag', tag, commit])
    execFileSync('git', ['push', 'origin', `refs/tags/${tag}`])
  }
  await zapewnijRelease({ repozytorium, token, manifest, pliki: [[nazwaApk, apk], [`${nazwaApk}.sha256`, suma], ['latest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)]] })
  await sprawdzPublikacje({ repozytorium, manifest, adresManifestu: process.env.VITE_ANDROID_UPDATE_MANIFEST_URL })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  wznowWydanie(process.argv[2]).catch((blad) => { console.error(blad.message); process.exitCode = 1 })
}
