import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { przygotujWydanie } from './android-release-przygotowanie.mjs'
import { klasyfikujOdPunktow } from './publikacja-klasyfikacja.mjs'
import { obliczKodWersji, wymagajOficjalnejPublikacji } from './android-wspolne.mjs'
import { zapewnijRelease, sprawdzPublikacje } from './android-release-publikacja.mjs'
import { etapy, nazwyEtapu, skrot, sprawdzBramke, sprawdzEtap, sprawdzStan, sprawdzWersjePakietow, sprawdzZestaw, utworzPotwierdzenie, znajdzWydanie } from './platform-release-wspolne.mjs'

const git = (...argumenty) => execFileSync('git', argumenty, { encoding: 'utf8' }).trim()
const json = (sciezka) => JSON.parse(readFileSync(sciezka, 'utf8'))
const zapiszJson = (sciezka, dane) => writeFileSync(sciezka, `${JSON.stringify(dane, null, 2)}\n`)
const wynik = (nazwa, wartosc) => appendFileSync(process.env.GITHUB_OUTPUT, `${nazwa}=${wartosc}\n`)
const repozytorium = () => process.env.GITHUB_REPOSITORY
const wydanieDlaTagu = (tag) => znajdzWydanie(tag, api)

async function api(sciezka, brakDozwolony = false) {
  const odpowiedz = await fetch(`https://api.github.com/repos/${repozytorium()}/${sciezka}`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000),
  })
  if (brakDozwolony && odpowiedz.status === 404) return undefined
  if (!odpowiedz.ok) throw new Error(`GitHub API HTTP ${odpowiedz.status}: ${sciezka}`)
  return odpowiedz.json()
}

function stanZCommita(sha) {
  const opis = git('show', '-s', '--format=%B', sha)
  const zrodlo = /^Wydanie-Zrodlo: ([a-f0-9]{40})$/m.exec(opis)?.[1]
  const ci = /^Wydanie-CI: (\d+)$/m.exec(opis)?.[1]
  if (!zrodlo || !ci) return undefined
  const pakiet = JSON.parse(git('show', `${sha}:package.json`))
  const lock = JSON.parse(git('show', `${sha}:package-lock.json`))
  sprawdzWersjePakietow(pakiet, lock)
  const rodzic = git('rev-parse', `${sha}^`)
  if (rodzic !== zrodlo) throw new Error('Commit wersji nie jest bezpośrednim potomkiem zielonego SHA.')
  const pliki = git('diff-tree', '--no-commit-id', '--name-only', '-r', sha).split('\n')
  if (pliki.some((plik) => !['package.json', 'package-lock.json'].includes(plik))) throw new Error('Commit wersji zmienia kod produkcyjny.')
  for (const plik of pliki) {
    const przed = JSON.parse(git('show', `${rodzic}:${plik}`))
    const po = JSON.parse(git('show', `${sha}:${plik}`))
    przed.version = po.version
    if (plik === 'package-lock.json') przed.packages[''].version = po.packages[''].version
    if (JSON.stringify(przed) !== JSON.stringify(po)) throw new Error('Commit wersji zawiera zmiany inne niż numer wersji.')
  }
  return sprawdzStan({ wersja: pakiet.version, sha, zrodlo, ci })
}

async function potwierdzCi(stan, automatyczna = false) {
  sprawdzBramke({ automatyczna, wlaczona: process.env.AUTO_PUBLISH_ENABLED, sha: stan.zrodlo, main: stan.zrodlo,
    repozytorium: repozytorium(), ci: await api(`actions/runs/${stan.ci}`) })
}

function potwierdzMain(stan) {
  if (git('ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0] !== stan.sha) throw new Error('main zmienił się podczas przygotowania wydania; publikacja zablokowana.')
}

async function przygotuj() {
  wymagajOficjalnejPublikacji()
  git('fetch', 'origin', 'main:refs/remotes/origin/main', '--tags')
  const main = git('rev-parse', 'origin/main')
  const wznowienie = process.env.RESUME_VERSION
  const zrodlo = process.env.SOURCE_SHA || process.env.GITHUB_SHA
  if (!/^[a-f0-9]{40}$/.test(zrodlo)) throw new Error('Nieprawidłowy SHA źródłowy.')
  const automatyczna = process.env.AUTOMATYCZNA === 'true'
  if (automatyczna && process.env.AUTO_PUBLISH_ENABLED !== 'true') throw new Error('Automatyczna publikacja jest wyłączona.')
  let stan
  if (wznowienie) {
    if (!/^\d+\.\d+\.\d+$/.test(wznowienie)) throw new Error('Wznowienie wymaga X.Y.Z.')
    const kandydaci = git('log', 'origin/main', '--format=%H', '--fixed-strings', `--grep=Przygotuj wydanie platform ${wznowienie}`).split('\n').filter(Boolean)
    stan = kandydaci.map(stanZCommita).find((wpis) => wpis?.wersja === wznowienie)
    if (!stan) throw new Error('Brak zapisanego commita tej wersji; wznowienie nie tworzy numeru.')
  } else {
    const kandydat = git('log', 'origin/main', '--format=%H', '--fixed-strings', `--grep=Wydanie-Zrodlo: ${zrodlo}`).split('\n').filter(Boolean)[0]
    stan = kandydat ? stanZCommita(kandydat) : stanZCommita(zrodlo)
  }
  if (automatyczna && stan?.sha === zrodlo && !wznowienie) {
    wynik('aktywne', 'false')
    return
  }
  if (!stan) {
    if (main !== zrodlo) throw new Error('Przestarzały SHA: main zmienił się przed przygotowaniem.')
    const uruchomienia = (await api(`actions/workflows/ci.yml/runs?head_sha=${zrodlo}&per_page=100`)).workflow_runs
    const ci = uruchomienia.find((wpis) => wpis.conclusion === 'success' && wpis.status === 'completed' && wpis.head_branch === 'main' && ['push', 'workflow_dispatch'].includes(wpis.event))
    sprawdzBramke({ automatyczna, wlaczona: process.env.AUTO_PUBLISH_ENABLED, sha: zrodlo, main, repozytorium: repozytorium(), ci })
    const ostatnie = await api('releases/latest', true)
    const tag = ostatnie?.tag_name || ''
    if (tag && !/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('Nieprawidłowy tag ostatniego wydania.')
    const rezerwacja = git('log', 'origin/main', '--format=%H', '--grep=^Przygotuj wydanie platform ', '-1')
    if (rezerwacja && stanZCommita(rezerwacja)?.wersja !== tag.slice(1)) throw new Error('Istnieje niezakończone wydanie; użyj resume_version.')
    const kanaly = klasyfikujOdPunktow({ cel: zrodlo, android: tag, raspberry: tag })
    if (!kanaly.android && !kanaly.raspberry) { wynik('aktywne', 'false'); return }
    git('checkout', '--detach', zrodlo)
    const pakiet = json('package.json'), lock = json('package-lock.json')
    sprawdzWersjePakietow(pakiet, lock)
    const nowe = przygotujWydanie({ pakiet, lock, rodzajWersji: process.env.VERSION_BUMP || 'patch', wersjaOpublikowana: tag.slice(1) })
    if (await wydanieDlaTagu(`v${nowe.wersja}`)) throw new Error('Wersja ma już release; użyj wznowienia.')
    if (git('ls-remote', '--tags', 'origin', `refs/tags/v${nowe.wersja}`)) throw new Error('Wersja ma już tag; przerwano.')
    zapiszJson('package.json', nowe.pakiet); zapiszJson('package-lock.json', nowe.lock)
    git('config', 'user.name', 'github-actions[bot]')
    git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    git('add', 'package.json', 'package-lock.json')
    git('commit', '--allow-empty', '-m', `Przygotuj wydanie platform ${nowe.wersja}\n\nWydanie-Zrodlo: ${zrodlo}\nWydanie-CI: ${ci.id}`)
    if (git('ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0] !== zrodlo) throw new Error('main zmienił się przed zapisem wersji.')
    git('push', 'origin', 'HEAD:refs/heads/main')
    stan = stanZCommita(git('rev-parse', 'HEAD'))
  }
  await potwierdzCi(stan, automatyczna)
  const publiczne = await wydanieDlaTagu(`v${stan.wersja}`)
  // Publiczne wydanie można tylko sprawdzić i ponowić zatwierdzenie kanału.
  if (!publiczne || publiczne.draft) potwierdzMain(stan)
  wynik('aktywne', 'true'); wynik('stan', JSON.stringify(stan)); wynik('sha', stan.sha)
}

function plikiEtapu(stan, etap, katalog) {
  return new Map([...nazwyEtapu(stan.wersja, etap), `${etap}.json`].map((nazwa) => [nazwa, readFileSync(join(katalog, nazwa))]))
}

function weryfikatory(katalog) {
  return {
    sprawdzApk: (nazwa, manifest) => {
      const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
      if (!sdk) throw new Error('Brak Android SDK do weryfikacji podpisu APK.')
      const katalogNarzedzi = join(sdk, 'build-tools')
      const narzedzia = join(katalogNarzedzi, readdirSync(katalogNarzedzi).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0])
      const apk = join(katalog, nazwa)
      const podpis = execFileSync(join(narzedzia, 'apksigner'), ['verify', '--print-certs', apk], { encoding: 'utf8' })
      const certyfikat = /certificate SHA-256 digest: ([a-f0-9]+)/i.exec(podpis)?.[1]?.toLowerCase()
      if (certyfikat !== json('config/android-release.json').sha256Certyfikatu) throw new Error('Nieprawidłowy podpis APK.')
      const metadane = execFileSync(join(narzedzia, 'aapt'), ['dump', 'badging', apk], { encoding: 'utf8' })
      if (!metadane.includes(`package: name='pl.ogarniacz.app' versionCode='${manifest.versionCode}' versionName='${manifest.versionName}'`)) throw new Error('Niezgodna wersja APK.')
    },
    sprawdzPaczki: (stan, etap) => {
      const odczytaj = (nazwa, plik) => JSON.parse(execFileSync('tar', ['-xOf', join(katalog, nazwa), plik], { encoding: 'utf8' }))
      const nazwa = nazwyEtapu(stan.wersja, etap)[0]
      const metadane = odczytaj(nazwa, etap === 'web' ? './wydanie.json' : 'dist/wydanie.json')
      if (JSON.stringify(metadane) !== JSON.stringify(stan)) throw new Error('Niezgodna wersja lub SHA paczki.')
      if (etap === 'web') return
      const rpi = nazwa
      const pakiet = odczytaj(rpi, 'package.json'), lock = odczytaj(rpi, 'package-lock.json')
      sprawdzWersjePakietow(pakiet, lock)
      if (pakiet.version !== stan.wersja) throw new Error('Niezgodna wersja Raspberry Pi.')
    },
  }
}

async function odtworz(stan, etap, katalog) {
  mkdirSync(katalog, { recursive: true })
  const nazwa = `wydanie-${stan.wersja}-${stan.sha}-${etap}`
  const archiwa = (await api(`actions/artifacts?name=${encodeURIComponent(nazwa)}&per_page=100`)).artifacts
  const archiwum = archiwa.find((wpis) => !wpis.expired)
  if (archiwum) {
    const run = await api(`actions/runs/${archiwum.workflow_run.id}`)
    if (run.path !== '.github/workflows/android-release.yml' || run.head_branch !== 'main' || run.event !== 'workflow_dispatch' || run.head_repository?.full_name !== repozytorium()) throw new Error('Archiwum nie pochodzi z oficjalnego workflow.')
    execFileSync('gh', ['run', 'download', String(run.id), '--repo', repozytorium(), '--name', nazwa, '--dir', katalog], { stdio: 'inherit' })
  } else {
    const wydanie = await wydanieDlaTagu(`v${stan.wersja}`)
    const nazwy = [...nazwyEtapu(stan.wersja, etap), `${etap}.json`]
    if (wydanie && nazwy.every((nazwa) => wydanie.assets.some((asset) => asset.name === nazwa))) {
      for (const nazwa of nazwy) {
        const asset = wydanie.assets.find((wpis) => wpis.name === nazwa)
        const odpowiedz = await fetch(asset.url, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/octet-stream' }, signal: AbortSignal.timeout(120000) })
        if (!odpowiedz.ok) throw new Error(`Pobranie assetu HTTP ${odpowiedz.status}`)
        writeFileSync(join(katalog, nazwa), Buffer.from(await odpowiedz.arrayBuffer()))
      }
    } else { wynik('gotowe', 'false'); return }
  }
  await sprawdzEtap(stan, etap, plikiEtapu(stan, etap, katalog), weryfikatory(katalog))
  wynik('gotowe', 'true')
}

async function publikuj(stan, katalog) {
  wymagajOficjalnejPublikacji()
  await potwierdzCi(stan)
  const pliki = new Map(etapy.flatMap((etap) => [...plikiEtapu(stan, etap, katalog)]))
  const sumy = [...pliki].map(([nazwa, dane]) => `${skrot(dane)}  ${nazwa}\n`).join('')
  pliki.set('SHA256SUMS.txt', Buffer.from(sumy))
  pliki.set('wydanie.json', Buffer.from(`${JSON.stringify(stan, null, 2)}\n`))
  await sprawdzZestaw(stan, pliki, weryfikatory(katalog))
  const tag = `v${stan.wersja}`
  const zdalnyTag = git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`)
  if (zdalnyTag && zdalnyTag.split('\n').at(-1).split(/\s/)[0] !== stan.sha) throw new Error('Tag wskazuje inne źródła.')
  const istniejace = await wydanieDlaTagu(tag)
  const bramka = async () => {
    // Przy już publicznym wydaniu nie cofamy main ani release; kontrola integralności nadal obowiązuje.
    if (!istniejace || istniejace.draft) potwierdzMain(stan)
    const ostatnie = await api('releases/latest', true)
    if (ostatnie && obliczKodWersji(ostatnie.tag_name.replace(/^v/, '')) > obliczKodWersji(stan.wersja)) throw new Error('Istnieje nowsze publiczne wydanie; bez obniżania versionCode.')
  }
  await bramka()
  if (!zdalnyTag) { git('tag', tag, stan.sha); git('push', 'origin', `refs/tags/${tag}`) }
  const manifest = JSON.parse(pliki.get('latest.json'))
  await zapewnijRelease({ repozytorium: repozytorium(), token: process.env.GITHUB_TOKEN, manifest, stan,
    pliki: [...pliki], weryfikatory: weryfikatory(katalog), potwierdzMain: bramka })
  await sprawdzPublikacje({ repozytorium: repozytorium(), manifest, adresManifestu: process.env.VITE_ANDROID_UPDATE_MANIFEST_URL })
}

export async function uruchom(argumenty = process.argv.slice(2)) {
  const [polecenie, etap, katalog = 'artifacts/wydanie'] = argumenty
  if (polecenie === 'przygotuj') return przygotuj()
  const stan = sprawdzStan(JSON.parse(process.env.STAN_WYDANIA))
  sprawdzWersjePakietow(json('package.json'), json('package-lock.json'))
  if (json('package.json').version !== stan.wersja || git('rev-parse', 'HEAD') !== stan.sha) throw new Error('Checkout nie odpowiada źródłom wydania.')
  if (polecenie === 'odtworz') return odtworz(stan, etap, katalog)
  if (polecenie === 'metadane') { mkdirSync(etap, { recursive: true }); return zapiszJson(join(etap, 'wydanie.json'), stan) }
  if (polecenie === 'potwierdz') {
    const pliki = new Map(nazwyEtapu(stan.wersja, etap).map((nazwa) => [nazwa, readFileSync(join(katalog, nazwa))]))
    zapiszJson(join(katalog, `${etap}.json`), utworzPotwierdzenie(stan, etap, pliki))
    return sprawdzEtap(stan, etap, plikiEtapu(stan, etap, katalog), weryfikatory(katalog))
  }
  if (polecenie === 'publikuj') return publikuj(stan, katalog)
  if (polecenie === 'kanal') {
    const wydanie = await wydanieDlaTagu(`v${stan.wersja}`)
    if (!wydanie || wydanie.draft || wydanie.prerelease) throw new Error('Kanał wymaga publicznego wydania.')
    const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash'
    try { execFileSync(bash, ['scripts/publikacja-rpi-stable.sh', stan.sha], { stdio: 'inherit' }) }
    catch { throw new Error('Wydanie jest publiczne. Zatwierdzenie rpi-stable nie powiodło się; ponów resume_version. Nie cofnięto wydania ani danych.') }
    return
  }
  throw new Error('Nieznane polecenie wydania.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  uruchom().catch((blad) => { console.error(blad.message); process.exitCode = 1 })
}
