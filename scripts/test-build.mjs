import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parsujManifestTestowy } from '../src/platform/AktualizacjeTestoweService.ts'

const repozytorium = 'kapi1944/Ogarniacz'
const nazwaManifestu = 'manifest-testowy.json'
const katalogWynikow = 'artifacts/beta'
const plikKontekstu = 'artifacts/test-build-kontekst.json'
const wykonajGit = (...argumenty) => execFileSync('git', argumenty, { encoding: 'utf8', timeout: 30_000 }).trim()
const wykonajTar = (...argumenty) => execFileSync('tar', argumenty, { maxBuffer: 100 * 1024 * 1024, timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] })
const obliczSha256 = (bajty) => createHash('sha256').update(bajty).digest('hex')
const wymagaj = (warunek, komunikat) => { if (!warunek) throw new Error(komunikat) }

export function odczytajKontekst(srodowisko = process.env) {
  const kontekst = {
    sha: srodowisko.GITHUB_SHA, numerBuildu: Number(srodowisko.GITHUB_RUN_NUMBER),
    runId: Number(srodowisko.GITHUB_RUN_ID), proba: Number(srodowisko.GITHUB_RUN_ATTEMPT),
  }
  wymagaj(srodowisko.GITHUB_REPOSITORY === repozytorium && srodowisko.GITHUB_REF === 'refs/heads/main'
    && srodowisko.GITHUB_EVENT_NAME === 'workflow_dispatch', 'Dozwolony jest tylko ręczny workflow main właściwego repozytorium.')
  wymagaj(/^[a-f0-9]{40}$/.test(kontekst.sha ?? ''), 'Wymagany pełny SHA źródeł.')
  wymagaj(Number.isSafeInteger(kontekst.runId) && kontekst.runId > 0
    && Number.isSafeInteger(kontekst.numerBuildu) && kontekst.numerBuildu > 0 && kontekst.numerBuildu <= 2_100_000_000,
  'Nieprawidłowy identyfikator lub numer przebiegu.')
  wymagaj(kontekst.proba === 1, 'Ponowienia run_attempt > 1 są zablokowane. Uruchom nowy workflow z main.')
  return kontekst
}

export const nazwaTagu = (kontekst) => `beta-${kontekst.numerBuildu}-${kontekst.sha}`

function czyPrzebieg(przebieg, kontekst, plik) {
  return przebieg.repository?.full_name === repozytorium && przebieg.head_sha === kontekst.sha
    && przebieg.head_branch === 'main' && przebieg.path === `.github/workflows/${plik}`
    && ['push', 'workflow_dispatch'].includes(przebieg.event)
}

export function wybierzCi(przebiegi, kontekst) {
  wymagaj(Array.isArray(przebiegi), 'Nieprawidłowa odpowiedź CI.')
  const najnowszy = przebiegi.filter((przebieg) => czyPrzebieg(przebieg, kontekst, 'ci.yml'))
    .sort((lewy, prawy) => prawy.id - lewy.id || prawy.run_attempt - lewy.run_attempt)[0]
  wymagaj(najnowszy?.status === 'completed' && najnowszy.conclusion === 'success', 'Brak zakończonego sukcesem najnowszego CI dokładnego SHA main.')
  wymagaj(Number.isSafeInteger(najnowszy.id) && najnowszy.id > 0, 'Nieprawidłowy ciRunId.')
  return najnowszy.id
}

export function utworzApi(token, pobierz = fetch) {
  return async (sciezka, { metoda = 'GET', dane, bajty, publiczne = false, brakDozwolony = false } = {}) => {
    const adres = sciezka.startsWith('https://uploads.github.com/') ? sciezka : `https://api.github.com/repos/${repozytorium}${sciezka}`
    const odpowiedz = await pobierz(adres, {
      method: metoda, signal: AbortSignal.timeout(60_000), redirect: 'error',
      headers: {
        Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        ...(!publiczne && token ? { Authorization: `Bearer ${token}` } : {}),
        ...(bajty ? { 'Content-Type': 'application/octet-stream' } : dane ? { 'Content-Type': 'application/json' } : {}),
      },
      body: bajty ?? (dane ? JSON.stringify(dane) : undefined),
    })
    if (brakDozwolony && odpowiedz.status === 404) return undefined
    wymagaj(odpowiedz.ok, `GitHub HTTP ${odpowiedz.status}; operacja ${metoda} przerwana.`)
    return odpowiedz.json()
  }
}

export async function sprawdzBramke(kontekst, api, odczytajGit = wykonajGit) {
  wymagaj(odczytajGit('rev-parse', 'HEAD') === kontekst.sha, 'SHA checkoutu nie odpowiada źródłom przebiegu.')
  wymagaj(!odczytajGit('status', '--porcelain', '--untracked-files=normal'), 'Źródła zawierają lokalne zmiany.')
  const zdalnySha = odczytajGit('ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0]
  wymagaj(zdalnySha === kontekst.sha, 'origin/main zmienił się podczas workflow.')
  const commit = await api('/commits/main')
  wymagaj(commit.sha === kontekst.sha, 'main zmienił się podczas workflow.')
  const przebieg = await api(`/actions/runs/${kontekst.runId}`)
  wymagaj(czyPrzebieg(przebieg, kontekst, 'test-build.yml') && przebieg.event === 'workflow_dispatch'
    && przebieg.id === kontekst.runId && przebieg.run_number === kontekst.numerBuildu && przebieg.run_attempt === 1,
  'Nieprawidłowe pochodzenie testowego workflow.')
  // Własny przebieg trwa. Jego sukces potwierdzi czytnik dopiero po zakończeniu workflow.
  const ci = await api(`/actions/workflows/ci.yml/runs?head_sha=${kontekst.sha}&branch=main&per_page=100`)
  return { ciRunId: wybierzCi(ci.workflow_runs, kontekst), opis: String(commit.commit.message).slice(0, 20_000) }
}

export async function sprawdzBrakPublikacji(kontekst, api) {
  const tag = nazwaTagu(kontekst)
  wymagaj(!await api(`/git/ref/tags/${tag}`, { brakDozwolony: true }), 'Tag Beta już istnieje. Nie wolno go przesuwać.')
  wymagaj(!await api(`/releases/tags/${tag}`, { brakDozwolony: true }), 'Wydanie tego przebiegu już istnieje. Nie wolno go nadpisywać.')
}

function sprawdzSciezke(sciezka, platforma) {
  const sciezkaStatyczna = platforma === 'raspberry' ? sciezka.startsWith('dist/') ? sciezka.slice(5) : '' : sciezka
  const statyczny = /^(?:index\.html|manifest\.webmanifest|sw\.js|workbox-[\w-]+\.js|powiadomienia-sw\.js|(?:favicon(?:-16|-32)?|apple-touch-icon|ikona-192|ikona-512|logo-flat|logo-premium)\.(?:png|ico|svg)|metadane-testowe\.json|assets\/[A-Za-z0-9_.-]+\.(?:js|css|woff2?|png|svg|jpe?g|webp))$/.test(sciezkaStatyczna)
  const backend = /^dist-server\/[A-Za-z0-9_-]+\.js$/.test(sciezka)
  wymagaj(!sciezka.split('/').some((czesc) => czesc === '..' || czesc.startsWith('.'))
    && (statyczny || (platforma === 'raspberry' && (backend || ['package.json', 'package-lock.json'].includes(sciezka)))),
  `Niedozwolony plik archiwum: ${sciezka}`)
}

async function zbierzPliki(katalog, wzgledny = '') {
  const wynik = []
  for (const nazwa of (await readdir(join(katalog, wzgledny))).sort()) {
    const sciezka = wzgledny ? `${wzgledny}/${nazwa}` : nazwa
    const stan = await lstat(join(katalog, sciezka))
    wymagaj(!stan.isSymbolicLink(), `Dowiązanie w buildzie: ${sciezka}`)
    if (stan.isDirectory()) wynik.push(...await zbierzPliki(katalog, sciezka))
    else { wymagaj(stan.isFile() && stan.size > 0, `Pusty lub nieprawidłowy plik: ${sciezka}`); wynik.push(sciezka) }
  }
  return wynik
}

export function sprawdzListeArchiwum(pliki, platforma) {
  wymagaj(pliki.length > 0 && new Set(pliki).size === pliki.length, 'Puste archiwum lub powtórzone ścieżki.')
  for (const plik of pliki) sprawdzSciezke(plik, platforma)
  const prefiks = platforma === 'raspberry' ? 'dist/' : ''
  const wymagane = ['index.html', 'sw.js', 'manifest.webmanifest', 'powiadomienia-sw.js', 'metadane-testowe.json'].map((plik) => prefiks + plik)
  if (platforma === 'raspberry') wymagane.push('dist-server/main.js', 'package.json', 'package-lock.json')
  wymagaj(wymagane.every((plik) => pliki.includes(plik)) && pliki.some((plik) => plik.startsWith(`${prefiks}assets/`) && plik.endsWith('.js')), 'Niekompletne archiwum buildu.')
  wymagaj(platforma !== 'web' || pliki.every((plik) => !plik.startsWith('dist/')), 'Nieprawidłowy katalog główny Web.')
}

export function sprawdzArchiwum(sciezka, platforma, kontekst) {
  const pliki = wykonajTar('-tzf', sciezka).toString('utf8').trim().split(/\r?\n/)
  sprawdzListeArchiwum(pliki, platforma)
  const typy = wykonajTar('-tvzf', sciezka).toString('utf8').trim().split(/\r?\n/)
  wymagaj(typy.every((wiersz) => wiersz.startsWith('-')), 'Archiwum zawiera dowiązania lub pliki specjalne.')
  const metadane = JSON.parse(wykonajTar('-xOzf', sciezka, platforma === 'web' ? 'metadane-testowe.json' : 'dist/metadane-testowe.json').toString('utf8'))
  wymagaj(metadane.sha === kontekst.sha && metadane.runId === kontekst.runId && metadane.numerBuildu === kontekst.numerBuildu, 'SHA lub przebieg źródeł w archiwum nie odpowiada manifestowi.')
  wymagaj(pliki.some((plik) => /(?:^|\/)assets\/.*\.js$/.test(plik) && wykonajTar('-xOzf', sciezka, plik).includes(Buffer.from(kontekst.sha))), 'Brak pełnego SHA w metadanych bundle Vite.')
  return pliki
}

export async function przygotujArtefakty(kontekst, bramka, katalog = '.', wyjscie = katalogWynikow, odczytajGit = wykonajGit) {
  wymagaj(!odczytajGit('status', '--porcelain', '--untracked-files=normal'), 'Nie można pakować zmodyfikowanych źródeł.')
  wymagaj(odczytajGit('rev-parse', 'HEAD') === kontekst.sha, 'Niezgodny SHA źródeł i manifestu.')
  await mkdir(wyjscie, { recursive: true })
  wymagaj((await readdir(wyjscie)).length === 0, 'Katalog wynikowy już zawiera pliki.')
  const plikiWeb = await zbierzPliki(join(katalog, 'dist'))
  wymagaj(plikiWeb.filter((plik) => plik.startsWith('assets/') && plik.endsWith('.js')).length > 0, 'Brak buildu Vite.')
  await writeFile(join(katalog, 'dist/metadane-testowe.json'), JSON.stringify({ sha: kontekst.sha, runId: kontekst.runId, numerBuildu: kontekst.numerBuildu }, null, 2) + '\n', { flag: 'wx' })
  plikiWeb.push('metadane-testowe.json')
  const plikiRaspberry = [...plikiWeb.map((plik) => `dist/${plik}`), ...(await zbierzPliki(join(katalog, 'dist-server'))).map((plik) => `dist-server/${plik}`), 'package.json', 'package-lock.json']
  const artefakty = []
  for (const [platforma, pliki] of [['web', plikiWeb], ['raspberry', plikiRaspberry]]) {
    sprawdzListeArchiwum(pliki, platforma)
    const nazwa = `Ogarniacz-beta-${kontekst.numerBuildu}-${platforma}.tar.gz`
    const sciezka = resolve(wyjscie, nazwa)
    wykonajTar('-czf', sciezka, '-C', resolve(katalog, platforma === 'web' ? 'dist' : '.'), '--', ...pliki)
    sprawdzArchiwum(sciezka, platforma, kontekst)
    const bajty = await readFile(sciezka)
    artefakty.push({ platforma, nazwa, rozmiar: bajty.length, sha256: obliczSha256(bajty) })
  }
  const manifest = parsujManifestTestowy({
    format: 'ogarniacz-test-v1', repozytorium, galaz: 'main', kanal: 'beta', sha: kontekst.sha,
    wersja: `1.1.0-beta.${kontekst.numerBuildu}`, numerBuildu: kontekst.numerBuildu,
    runId: kontekst.runId, ciRunId: bramka.ciRunId, data: new Date().toISOString(), opis: bramka.opis, artefakty,
  })
  await writeFile(join(wyjscie, nazwaManifestu), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
  return manifest
}

export async function zweryfikujPliki(kontekst, katalog = katalogWynikow) {
  const bajtyManifestu = await readFile(join(katalog, nazwaManifestu))
  const manifest = parsujManifestTestowy(JSON.parse(bajtyManifestu.toString('utf8')))
  wymagaj(manifest.sha === kontekst.sha && manifest.runId === kontekst.runId && manifest.numerBuildu === kontekst.numerBuildu
    && manifest.wersja === `1.1.0-beta.${kontekst.numerBuildu}`, 'Niezgodny SHA, przebieg lub numeracja Beta w manifeście.')
  wymagaj(manifest.artefakty.length === 2 && ['web', 'raspberry'].every((platforma) => manifest.artefakty.some((artefakt) => artefakt.platforma === platforma)), 'Etap B wymaga rzeczywistych Web i Raspberry, bez Androida.')
  const pliki = [{ nazwa: nazwaManifestu, bajty: bajtyManifestu }]
  for (const artefakt of manifest.artefakty) {
    const sciezka = join(katalog, artefakt.nazwa)
    wymagaj((await lstat(sciezka)).isFile(), 'Artefakt nie jest zwykłym plikiem.')
    const bajty = await readFile(sciezka)
    wymagaj(bajty.length === artefakt.rozmiar && obliczSha256(bajty) === artefakt.sha256, 'Niezgodny rozmiar lub SHA-256 artefaktu.')
    sprawdzArchiwum(sciezka, artefakt.platforma, kontekst)
    pliki.push({ nazwa: artefakt.nazwa, bajty })
  }
  wymagaj((await readdir(katalog)).sort().join('\n') === pliki.map((plik) => plik.nazwa).sort().join('\n'), 'Nieoczekiwane pliki obok manifestu.')
  return { manifest, pliki, tresc: '```json\n' + bajtyManifestu.toString('utf8').trimEnd() + '\n```' }
}

export function sprawdzAssety(wydanie, pliki) {
  wymagaj(wydanie.assets?.length === pliki.length, 'Niekompletne assety wydania.')
  for (const plik of pliki) {
    const pasujace = wydanie.assets.filter((asset) => asset.name === plik.nazwa)
    wymagaj(pasujace.length === 1 && pasujace[0].state === 'uploaded' && pasujace[0].size === plik.bajty.length
      && pasujace[0].digest === `sha256:${obliczSha256(plik.bajty)}`, 'Brak lub niezgodny digest SHA-256, rozmiar lub stan assetu GitHub.')
  }
}

export async function opublikujBete(kontekst, zestaw, api, bramka, odczekaj = (czas) => new Promise((zakoncz) => setTimeout(zakoncz, czas))) {
  const { manifest, pliki, tresc } = zestaw
  const potwierdz = async () => wymagaj((await bramka()).ciRunId === manifest.ciRunId, 'Najnowsze CI zmieniło się po budowaniu; wymagany nowy workflow.')
  await potwierdz()
  await sprawdzBrakPublikacji(kontekst, api)
  const tag = nazwaTagu(kontekst)
  // Utworzenie ref jest atomowe; istniejący tag powoduje błąd zamiast przesunięcia.
  await api('/git/refs', { metoda: 'POST', dane: { ref: `refs/tags/${tag}`, sha: kontekst.sha } })
  const wydanie = await api('/releases', { metoda: 'POST', dane: {
    tag_name: tag, target_commitish: kontekst.sha, name: `Ogarniacz ${manifest.wersja}`, body: tresc,
    draft: true, prerelease: true, make_latest: 'false',
  } })
  for (const plik of pliki) {
    await api(`https://uploads.github.com/repos/${repozytorium}/releases/${wydanie.id}/assets?name=${encodeURIComponent(plik.nazwa)}`, { metoda: 'POST', bajty: plik.bajty })
  }
  sprawdzAssety(await api(`/releases/${wydanie.id}`), pliki)
  await potwierdz()
  await api(`/releases/${wydanie.id}`, { metoda: 'PATCH', dane: { draft: false, prerelease: true, make_latest: 'false' } })
  // Odczyt anonimowy potwierdza publiczną dostępność; brak digest nigdy nie jest pomijany.
  for (let proba = 0; proba < 6; proba++) {
    try {
      const publiczne = await api(`/releases/tags/${tag}`, { publiczne: true })
      wymagaj(publiczne.id === wydanie.id && !publiczne.draft && publiczne.prerelease && publiczne.tag_name === tag && publiczne.body === tresc, 'Nieprawidłowe publiczne metadane prerelease.')
      sprawdzAssety(publiczne, pliki)
      const referencja = await api(`/git/ref/tags/${tag}`, { publiczne: true })
      wymagaj(referencja.object?.type === 'commit' && referencja.object.sha === kontekst.sha, 'Publiczny tag nie wskazuje dokładnego SHA.')
      await potwierdz()
      return publiczne.html_url
    } catch (blad) {
      if (proba === 5) throw blad
      await odczekaj(5000)
    }
  }
}

async function uruchom() {
  const polecenie = process.argv[2]
  wymagaj(['sprawdz', 'przygotuj', 'zweryfikuj', 'opublikuj'].includes(polecenie), 'Nieznane polecenie pipeline.')
  const kontekst = odczytajKontekst()
  if (polecenie === 'opublikuj') wymagaj(process.env.PUBLIKUJ_BETA === 'true', 'Publikacja wymaga jawnego publish_beta=true.')
  const api = utworzApi(process.env.GH_TOKEN)
  const bramka = () => sprawdzBramke(kontekst, api)
  if (polecenie === 'sprawdz') {
    const stan = await bramka()
    await sprawdzBrakPublikacji(kontekst, api)
    await mkdir('artifacts', { recursive: true })
    await writeFile(plikKontekstu, JSON.stringify(stan), { flag: 'wx' })
  } else if (polecenie === 'przygotuj') {
    await przygotujArtefakty(kontekst, JSON.parse(await readFile(plikKontekstu, 'utf8')))
  } else {
    const zestaw = await zweryfikujPliki(kontekst)
    if (polecenie === 'opublikuj') {
      console.log(await opublikujBete(kontekst, zestaw, api, bramka))
    } else {
      wymagaj((await bramka()).ciRunId === zestaw.manifest.ciRunId, 'CI zmieniło się podczas budowania.')
      await sprawdzBrakPublikacji(kontekst, api)
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  uruchom().catch((blad) => { console.error(blad.message); process.exitCode = 1 })
}
