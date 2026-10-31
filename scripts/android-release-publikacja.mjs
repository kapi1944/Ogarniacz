import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pobierzPublicznyManifestPoPublikacji, walidujManifestAktualizacji, wymagajOficjalnejPublikacji } from './android-wspolne.mjs'
import { sprawdzZestaw, znajdzWydanie } from './platform-release-wspolne.mjs'

const skrot = (dane) => createHash('sha256').update(dane).digest('hex')

export async function zapewnijRelease({ repozytorium, token, manifest, pliki, stan, weryfikatory, potwierdzMain, pobierz = fetch }) {
  await sprawdzZestaw(stan, new Map(pliki), weryfikatory)
  if (!potwierdzMain) throw new Error('Brak bramki aktualności main.')
  await potwierdzMain()
  walidujManifestAktualizacji(manifest)
  if (JSON.stringify(manifest) !== JSON.stringify(JSON.parse(new Map(pliki).get('latest.json')))) throw new Error('Manifest publikacji nie odpowiada zestawowi artefaktów.')
  if (manifest.apkUrl !== `Ogarniacz-${manifest.versionName}-release.apk` || !Number.isInteger(manifest.size)) throw new Error('Manifest musi wskazywać asset APK tej wersji i jego rozmiar.')
  const api = `https://api.github.com/repos/${repozytorium}`
  const tag = `v${manifest.versionName}`
  const naglowki = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  async function zadanie(adres, opcje = {}) {
    const odpowiedz = await pobierz(adres, { ...opcje, signal: AbortSignal.timeout(30_000), headers: { ...naglowki, ...opcje.headers } })
    if (!odpowiedz.ok) throw new Error(`GitHub API HTTP ${odpowiedz.status}: ${adres}`)
    return odpowiedz
  }
  let wydanie = await znajdzWydanie(tag, async (sciezka) => (await zadanie(`${api}/${sciezka}`)).json())
  if (!wydanie) {
    wydanie = await (await zadanie(`${api}/releases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_name: tag, target_commitish: stan.sha, name: tag, body: manifest.releaseNotes || `Ogarniacz ${manifest.versionName}`, draft: true, prerelease: false }) })).json()
  }
  if (wydanie.prerelease) throw new Error('Istniejące wydanie jest prerelease; wymagana ręczna diagnostyka.')
  if (wydanie.tag_name !== tag) throw new Error('Niezgodny tag istniejącego wydania.')
  for (const [nazwa, dane] of pliki) {
    const asset = wydanie.assets?.find((wpis) => wpis.name === nazwa)
    if (asset) {
      const zdalne = Buffer.from(await (await zadanie(asset.url, { headers: { Accept: 'application/octet-stream' } })).arrayBuffer())
      const zgodny = asset.size === dane.length && skrot(zdalne) === skrot(dane)
      if (!zgodny) throw new Error(`Rzeczywista niespójność istniejącego assetu ${nazwa}; niczego nie nadpisano.`)
      continue
    }
    if (!wydanie.draft) throw new Error(`Niekompletne publiczne wydanie: brak ${nazwa}; wymagana ręczna diagnostyka.`)
    const wysylka = wydanie.upload_url.replace(/\{\?name,label\}$/, '')
    await zadanie(`${wysylka}?name=${encodeURIComponent(nazwa)}`, { method: 'POST', headers: { 'Content-Type': nazwa.endsWith('.json') ? 'application/json' : 'application/octet-stream' }, body: dane })
  }
  // Ponowny odczyt bajtów z GitHub, dopiero potem upublicznienie.
  const zapisane = await (await zadanie(`${api}/releases/${wydanie.id}`)).json()
  const zdalnePliki = new Map()
  for (const [nazwa, dane] of pliki) {
    const asset = zapisane.assets?.find((wpis) => wpis.name === nazwa)
    if (!asset) throw new Error(`Niekompletny draft: brak ${nazwa}.`)
    const zdalne = Buffer.from(await (await zadanie(asset.url, { headers: { Accept: 'application/octet-stream' } })).arrayBuffer())
    if (asset.size !== dane.length || skrot(zdalne) !== skrot(dane)) throw new Error(`Błędna suma SHA-256 zdalnego ${nazwa}.`)
    zdalnePliki.set(nazwa, zdalne)
  }
  await sprawdzZestaw(stan, zdalnePliki, weryfikatory)
  await potwierdzMain()
  if (wydanie.draft) await zadanie(`${api}/releases/${wydanie.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false, make_latest: 'true' }) })
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

export async function wznowWydanie() {
  wymagajOficjalnejPublikacji(process.env, 'android-release-resume.yml')
  throw new Error('Wznawiaj kompletny zestaw przez android-release.yml z resume_version; publikacja samego APK jest zablokowana.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  wznowWydanie(process.argv[2]).catch((blad) => { console.error(blad.message); process.exitCode = 1 })
}
