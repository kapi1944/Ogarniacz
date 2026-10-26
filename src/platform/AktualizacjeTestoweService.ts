import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { z } from 'zod'

const repozytorium = 'kapi1944/Ogarniacz'
const adresApi = `https://api.github.com/repos/${repozytorium}`
const schematSha = z.string().regex(/^[a-f0-9]{40}$/i).transform((wartosc) => wartosc.toLowerCase())
const schematDaty = z.iso.datetime({ offset: true })
const schematPliku = z.object({
  nazwa: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/),
  rozmiar: z.number().int().positive().max(2_000_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})
const schematManifestu = z.object({
  format: z.literal('ogarniacz-test-v1'),
  repozytorium: z.literal(repozytorium),
  galaz: z.literal('main'),
  kanal: z.literal('beta'),
  sha: schematSha,
  wersja: z.string().regex(/^\d+\.\d+\.\d+-beta\.[1-9]\d*$/),
  numerBuildu: z.number().int().positive().max(2_100_000_000),
  runId: z.number().int().positive(),
  ciRunId: z.number().int().positive(),
  data: schematDaty,
  opis: z.string().max(20_000),
  artefakty: z.array(z.discriminatedUnion('platforma', [
    schematPliku.extend({ platforma: z.literal('android'), pakiet: z.literal('pl.ogarniacz.app.beta'), sha256Certyfikatu: z.string().regex(/^[a-f0-9]{64}$/) }),
    schematPliku.extend({ platforma: z.literal('raspberry') }),
    schematPliku.extend({ platforma: z.literal('web') }),
  ])).min(1).max(3),
})

export type ManifestTestowy = z.infer<typeof schematManifestu>
export interface CommitTestowy { sha: string; opis: string; data: string }
export interface StanCiTestowego { stan: 'sukces' | 'trwa' | 'blad' | 'brak'; runId?: number }
export interface WynikBuilduTestowego {
  commit: CommitTestowy
  ci: StanCiTestowego
  manifest?: ManifestTestowy
  dostepnyDlaMain: boolean
}

export class BladAktualizacjiTestowej extends Error {}

export function czyTeSameSha(lewy: string | null, prawy: string | null) {
  return schematSha.safeParse(lewy).success && schematSha.safeParse(prawy).success && lewy!.toLowerCase() === prawy!.toLowerCase()
}

export function wykryjPlatformeTestowa(dane = {
  android: Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android',
  pwa: Boolean(window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone),
  windows: /Windows/i.test(navigator.userAgent),
}) {
  if (dane.android) return { rodzaj: 'android' as const, etykieta: 'Android (aplikacja natywna)' }
  return { rodzaj: 'web' as const, etykieta: `${dane.pwa ? 'PWA' : 'Web'}${dane.windows ? ' / Windows' : ''}` }
}

export function parsujManifestTestowy(wartosc: unknown): ManifestTestowy {
  const wynik = schematManifestu.safeParse(wartosc)
  if (!wynik.success) throw new BladAktualizacjiTestowej('Nieprawidłowy manifest testowy. Artefakt został zablokowany.')
  const manifest = wynik.data
  if (Number(manifest.wersja.split('-beta.')[1]) !== manifest.numerBuildu
    || new Set(manifest.artefakty.map((artefakt) => artefakt.platforma)).size !== manifest.artefakty.length
    || new Set(manifest.artefakty.map((artefakt) => artefakt.nazwa)).size !== manifest.artefakty.length) {
    throw new BladAktualizacjiTestowej('Niespójna numeracja lub lista artefaktów testowych.')
  }
  return manifest
}

function bladAnulowania() { return new BladAktualizacjiTestowej('Anulowano sprawdzanie GitHub.') }

type OdczytJson = (sciezka: string, sygnal: AbortSignal) => Promise<unknown>

async function pobierzJson(sciezka: string, sygnal: AbortSignal): Promise<unknown> {
  sygnal.throwIfAborted()
  const ograniczenie = AbortSignal.any([sygnal, AbortSignal.timeout(15_000)])
  const naglowki = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  let usunNasluchiwanie = () => {}
  try {
    // Natywny HTTP nie zależy od konfiguracji synchronizacji ani backendu Raspberry.
    const zadanie = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
      ? CapacitorHttp.get({ url: `${adresApi}${sciezka}`, headers: naglowki, responseType: 'json', connectTimeout: 15_000, readTimeout: 15_000 })
        .then((odpowiedz) => ({ status: odpowiedz.status, json: async () => typeof odpowiedz.data === 'string' ? JSON.parse(odpowiedz.data) : odpowiedz.data }))
      : fetch(`${adresApi}${sciezka}`, { headers: naglowki, signal: ograniczenie, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' })
    const przerwanie = new Promise<never>((_wynik, odrzuc) => {
      const przerwij = () => odrzuc(bladAnulowania())
      ograniczenie.addEventListener('abort', przerwij, { once: true })
      usunNasluchiwanie = () => ograniczenie.removeEventListener('abort', przerwij)
      if (ograniczenie.aborted) przerwij()
    })
    return await Promise.race([zadanie.then(async (odpowiedz) => {
      if (odpowiedz.status === 403 || odpowiedz.status === 429) throw new BladAktualizacjiTestowej('GitHub ograniczył publiczne zapytania. Spróbuj ponownie później.')
      if (odpowiedz.status < 200 || odpowiedz.status >= 300) throw new BladAktualizacjiTestowej(`GitHub zwrócił HTTP ${odpowiedz.status}.`)
      return odpowiedz.json()
    }), przerwanie])
  } catch (blad) {
    if (sygnal.aborted) throw bladAnulowania()
    if (ograniczenie.aborted) throw new BladAktualizacjiTestowej('Przekroczono czas oczekiwania na GitHub.')
    if (blad instanceof BladAktualizacjiTestowej) throw blad
    throw new BladAktualizacjiTestowej('Nie udało się odczytać GitHub. Sprawdź połączenie z internetem.')
  } finally { usunNasluchiwanie() }
}

const schematPrzebiegu = z.object({
  id: z.number().int().positive(), run_number: z.number().int().positive(), run_attempt: z.number().int().positive(),
  head_sha: schematSha, head_branch: z.string(), event: z.string(), path: z.string(),
  status: z.string(), conclusion: z.string().nullable(),
  repository: z.object({ full_name: z.literal(repozytorium) }),
})

function czyWlasciwyPrzebieg(przebieg: z.infer<typeof schematPrzebiegu>, sha: string, plik: string) {
  return czyTeSameSha(przebieg.head_sha, sha) && przebieg.head_branch === 'main'
    && przebieg.path === `.github/workflows/${plik}`
    && (przebieg.event === 'push' || przebieg.event === 'workflow_dispatch')
}

export function utworzUslugeAktualizacjiTestowych(odczytaj: OdczytJson = pobierzJson) {
  // Jedna blokada obejmuje wszystkie panele korzystające z tej instancji usługi.
  let zajete = false
  async function chronOperacje<T>(sygnal: AbortSignal, operacja: () => Promise<T>): Promise<T> {
    if (zajete) throw new BladAktualizacjiTestowej('Sprawdzanie GitHub już trwa.')
    zajete = true
    try {
      if (sygnal.aborted) throw bladAnulowania()
      const wynik = await operacja()
      if (sygnal.aborted) throw bladAnulowania()
      return wynik
    } catch (blad) {
      if (sygnal.aborted) throw bladAnulowania()
      throw blad
    } finally { zajete = false }
  }

  async function odczytajCommit(sygnal: AbortSignal): Promise<CommitTestowy> {
    const wynik = z.object({ sha: schematSha, commit: z.object({ message: z.string().max(100_000), committer: z.object({ date: schematDaty }) }) })
      .safeParse(await odczytaj('/commits/main', sygnal))
    if (!wynik.success) throw new BladAktualizacjiTestowej('GitHub zwrócił nieprawidłowe metadane main.')
    return { sha: wynik.data.sha, opis: wynik.data.commit.message.slice(0, 20_000), data: wynik.data.commit.committer.date }
  }

  async function odczytajCi(sha: string, sygnal: AbortSignal): Promise<StanCiTestowego> {
    const wynik = z.object({ workflow_runs: z.array(schematPrzebiegu).max(100) })
      .safeParse(await odczytaj(`/actions/workflows/ci.yml/runs?head_sha=${sha}&branch=main&per_page=100`, sygnal))
    if (!wynik.success) throw new BladAktualizacjiTestowej('GitHub zwrócił nieprawidłowy status CI.')
    const najnowszy = wynik.data.workflow_runs.filter((przebieg) => czyWlasciwyPrzebieg(przebieg, sha, 'ci.yml'))
      .sort((lewy, prawy) => prawy.id - lewy.id || prawy.run_attempt - lewy.run_attempt)[0]
    if (!najnowszy) return { stan: 'brak' }
    return { runId: najnowszy.id, stan: najnowszy.status !== 'completed' ? 'trwa' : najnowszy.conclusion === 'success' ? 'sukces' : 'blad' }
  }

  async function odczytajManifest(sygnal: AbortSignal): Promise<ManifestTestowy | undefined> {
    const schematWydania = z.object({
      tag_name: z.string(), prerelease: z.boolean(), draft: z.boolean(), body: z.string().max(100_000).nullable(),
      assets: z.array(z.object({ name: z.string(), size: z.number().int(), state: z.string(), digest: z.string().nullish() })),
    })
    const wydania: z.infer<typeof schematWydania>[] = []
    for (let strona = 1; strona <= 10; strona++) {
      const wynik = z.array(schematWydania).max(100).safeParse(await odczytaj(`/releases?per_page=100&page=${strona}`, sygnal))
      if (!wynik.success) throw new BladAktualizacjiTestowej('GitHub zwrócił nieprawidłową listę buildów testowych.')
      wydania.push(...wynik.data.filter((wydanie) => wydanie.prerelease && !wydanie.draft && /^beta-[1-9]\d*-[a-f0-9]{40}$/.test(wydanie.tag_name)))
      if (wynik.data.length < 100) break
      if (strona === 10) throw new BladAktualizacjiTestowej('Nie udało się sprawdzić całej listy buildów. Wymagane zawężenie katalogu testowego.')
    }
    const wydanie = wydania.sort((lewe, prawe) => Number(prawe.tag_name.split('-')[1]) - Number(lewe.tag_name.split('-')[1]))[0]
    if (!wydanie) return undefined
    // Treść release zawiera ten sam JSON co manifest testowy. Odczyt przez publiczne API
    // działa bez tokenu i nie wymaga CORS dla github.com/releases/download.
    const tresc = /^```json\r?\n([\s\S]*)\r?\n```$/.exec(wydanie.body?.trim() ?? '')?.[1]
    let dane: unknown
    try { dane = JSON.parse(tresc ?? '') } catch { throw new BladAktualizacjiTestowej('Brakuje poprawnego manifestu w testowym prerelease.') }
    const manifest = parsujManifestTestowy(dane)
    if (wydanie.tag_name !== `beta-${manifest.numerBuildu}-${manifest.sha}`) throw new BladAktualizacjiTestowej('SHA lub numer buildu nie zgadza się z tagiem testowym.')
    for (const artefakt of manifest.artefakty) {
      const pliki = wydanie.assets.filter((plik) => plik.name === artefakt.nazwa)
      if (pliki.length !== 1 || pliki[0].state !== 'uploaded' || pliki[0].size !== artefakt.rozmiar
        || pliki[0].digest !== `sha256:${artefakt.sha256}`) {
        throw new BladAktualizacjiTestowej('Artefakt testowy ma niezgodny rozmiar, SHA-256 lub stan publikacji.')
      }
    }
    const [daneBuildu, daneCi] = await Promise.all([
      odczytaj(`/actions/runs/${manifest.runId}`, sygnal), odczytaj(`/actions/runs/${manifest.ciRunId}`, sygnal),
    ])
    const przebiegBuildu = schematPrzebiegu.safeParse(daneBuildu)
    const przebiegCi = schematPrzebiegu.safeParse(daneCi)
    if (!przebiegBuildu.success || !przebiegCi.success
      || przebiegBuildu.data.id !== manifest.runId || przebiegCi.data.id !== manifest.ciRunId
      || !czyWlasciwyPrzebieg(przebiegBuildu.data, manifest.sha, 'test-build.yml')
      || przebiegBuildu.data.event !== 'workflow_dispatch'
      || przebiegBuildu.data.run_number !== manifest.numerBuildu
      || !czyWlasciwyPrzebieg(przebiegCi.data, manifest.sha, 'ci.yml')
      || [przebiegBuildu.data, przebiegCi.data].some((przebieg) => przebieg.status !== 'completed' || przebieg.conclusion !== 'success')) {
      throw new BladAktualizacjiTestowej('Brak potwierdzonego sukcesu CI i testowego workflow dla SHA artefaktu.')
    }
    return manifest
  }

  async function sprawdzCommit(sygnal: AbortSignal) {
    const commit = await odczytajCommit(sygnal)
    return { commit, ci: await odczytajCi(commit.sha, sygnal) }
  }

  return {
    sprawdzCommit: (sygnal: AbortSignal) => chronOperacje(sygnal, () => sprawdzCommit(sygnal)),
    sprawdzBuild: (sygnal: AbortSignal) => chronOperacje(sygnal, async (): Promise<WynikBuilduTestowego> => {
      const { commit, ci } = await sprawdzCommit(sygnal)
      const manifest = await odczytajManifest(sygnal)
      const najnowszy = await odczytajCommit(sygnal)
      if (!czyTeSameSha(commit.sha, najnowszy.sha)) throw new BladAktualizacjiTestowej('main zmienił się podczas sprawdzania. Sprawdź build ponownie.')
      return { commit, ci, manifest, dostepnyDlaMain: ci.stan === 'sukces' && Boolean(manifest && czyTeSameSha(commit.sha, manifest.sha)) }
    }),
  }
}

export const aktualizacjeTestowe = utworzUslugeAktualizacjiTestowych()
