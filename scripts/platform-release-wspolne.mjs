import { createHash } from 'node:crypto'
import { obliczKodWersji, walidujManifestAktualizacji } from './android-wspolne.mjs'

export const skrot = (dane) => createHash('sha256').update(dane).digest('hex')
export const etapy = ['android', 'windows', 'web', 'raspberry']

export async function znajdzWydanie(tag, pobierzStrone) {
  // Lista obejmuje także drafty; nie utożsamiamy braku publicznego tagu z brakiem rezerwacji.
  for (let strona = 1; ; strona++) {
    const wydania = await pobierzStrone(`releases?per_page=100&page=${strona}`)
    if (!Array.isArray(wydania)) throw new Error('Nieprawidłowa lista wydań GitHub.')
    const wydanie = wydania.find((wpis) => wpis.tag_name === tag)
    if (wydanie) return wydanie
    if (wydania.length < 100) return undefined
  }
}

export function nazwyEtapu(wersja, etap) {
  const baza = `Ogarniacz-${wersja}`
  const nazwy = {
    android: [`${baza}-release.apk`, `${baza}-release.apk.sha256`, 'latest.json'],
    windows: [`${baza}-Setup.exe`, `${baza}-Setup.exe.sha256`],
    web: [`${baza}-Web.tar.gz`],
    raspberry: [`${baza}-RaspberryPi.tar.gz`],
  }
  if (!nazwy[etap]) throw new Error('Nieznany etap wydania.')
  return nazwy[etap]
}

export function sprawdzStan(stan) {
  obliczKodWersji(stan?.wersja)
  if (![stan.sha, stan.zrodlo].every((sha) => /^[a-f0-9]{40}$/.test(sha))) throw new Error('Brak dokładnego SHA źródeł wydania.')
  if (!/^\d+$/.test(String(stan.ci))) throw new Error('Brak identyfikatora zielonego CI.')
  return stan
}

export function sprawdzWersjePakietow(pakiet, lock) {
  obliczKodWersji(pakiet.version)
  if (pakiet.version !== lock.version || pakiet.version !== lock.packages?.['']?.version) throw new Error('Niezgodna wersja package.json i package-lock.json.')
}

export function sprawdzBramke({ automatyczna = false, wlaczona, sha, main, repozytorium, ci }) {
  if (automatyczna && wlaczona !== 'true') throw new Error('Automatyczna publikacja jest wyłączona.')
  if (main !== sha) throw new Error('main zmienił się podczas przygotowania wydania.')
  if (!ci || ci.head_sha !== sha || ci.head_branch !== 'main' || ci.status !== 'completed'
    || ci.conclusion !== 'success' || !['push', 'workflow_dispatch'].includes(ci.event)
    || ci.head_repository?.full_name !== repozytorium || ci.path !== '.github/workflows/ci.yml') {
    throw new Error('Brak zielonego CI dokładnego SHA main.')
  }
}

export function utworzPotwierdzenie(stan, etap, pliki) {
  sprawdzStan(stan)
  return { ...stan, etap, pliki: Object.fromEntries(nazwyEtapu(stan.wersja, etap).map((nazwa) => {
    const dane = pliki.get(nazwa)
    if (!dane?.length) throw new Error(`Brak ${nazwa}.`)
    return [nazwa, { sha256: skrot(dane), rozmiar: dane.length }]
  })) }
}

export async function sprawdzEtap(stan, etap, pliki, { sprawdzApk, sprawdzPaczki } = {}) {
  sprawdzStan(stan)
  const potwierdzenie = JSON.parse(pliki.get(`${etap}.json`) ?? 'null')
  for (const pole of ['wersja', 'sha', 'zrodlo', 'ci']) {
    if (potwierdzenie?.[pole] !== stan[pole]) throw new Error(`Niezgodna wersja lub źródła ${etap}: ${pole}.`)
  }
  if (potwierdzenie.etap !== etap) throw new Error('Niezgodny etap artefaktu.')
  const oczekiwane = utworzPotwierdzenie(stan, etap, pliki)
  if (JSON.stringify(potwierdzenie.pliki) !== JSON.stringify(oczekiwane.pliki)) throw new Error(`Błędna suma SHA-256 lub rozmiar ${etap}.`)
  for (const nazwa of nazwyEtapu(stan.wersja, etap).filter((nazwa) => nazwa.endsWith('.sha256'))) {
    const plik = nazwa.slice(0, -7)
    if (pliki.get(nazwa).toString().trim() !== `${skrot(pliki.get(plik))}  ${plik}`) throw new Error(`Błędna suma SHA-256 ${plik}.`)
  }
  if (etap === 'android') {
    const manifest = walidujManifestAktualizacji(JSON.parse(pliki.get('latest.json')))
    const nazwa = nazwyEtapu(stan.wersja, etap)[0]
    if (manifest.versionName !== stan.wersja || manifest.apkUrl !== nazwa || manifest.size !== pliki.get(nazwa).length || manifest.sha256 !== skrot(pliki.get(nazwa))) throw new Error('Niezgodna wersja lub SHA-256 APK.')
    if (!sprawdzApk) throw new Error('Brak weryfikacji podpisu APK.')
    await sprawdzApk(nazwa, manifest)
  }
  if (etap === 'web' || etap === 'raspberry') {
    if (!sprawdzPaczki) throw new Error('Brak weryfikacji wersji pakietów.')
    await sprawdzPaczki(stan, etap)
  }
}

export async function sprawdzZestaw(stan, pliki, weryfikatory) {
  for (const etap of etapy) await sprawdzEtap(stan, etap, pliki, weryfikatory)
  const sumy = etapy.flatMap((etap) => [...nazwyEtapu(stan.wersja, etap), `${etap}.json`])
    .map((nazwa) => `${skrot(pliki.get(nazwa))}  ${nazwa}\n`).join('')
  if (pliki.get('SHA256SUMS.txt')?.toString() !== sumy) throw new Error('Błędna suma SHA-256 kompletnego zestawu.')
  if (pliki.get('wydanie.json')?.toString() !== `${JSON.stringify(stan, null, 2)}\n`) throw new Error('Niezgodne źródła wydania.')
}
