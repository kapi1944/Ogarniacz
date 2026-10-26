import { afterEach, describe, expect, it, vi } from 'vitest'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { baza } from '../data/BazaOgarniacza'
import {
  czyTeSameSha, parsujManifestTestowy, utworzUslugeAktualizacjiTestowych, wykryjPlatformeTestowa,
} from './AktualizacjeTestoweService'

vi.mock('@capacitor/core', async (importOryginalu) => ({
  ...await importOryginalu<typeof import('@capacitor/core')>(),
  CapacitorHttp: { get: vi.fn() },
}))

const sha = 'a'.repeat(40)
const starszySha = 'b'.repeat(40)
const manifest = {
  format: 'ogarniacz-test-v1', repozytorium: 'kapi1944/Ogarniacz', galaz: 'main', kanal: 'beta', sha,
  wersja: '1.1.0-beta.42', numerBuildu: 42, runId: 30, ciRunId: 20,
  data: '2026-10-26T10:00:00Z', opis: 'Poprawki do testowania.',
  artefakty: [{ platforma: 'android', nazwa: 'Ogarniacz-beta.apk', rozmiar: 123, sha256: 'c'.repeat(64), pakiet: 'pl.ogarniacz.app.beta', sha256Certyfikatu: 'd'.repeat(64) }],
}

function przebieg(dane = {}) {
  return { id: 20, run_number: 12, run_attempt: 1, head_sha: sha, head_branch: 'main', event: 'push', path: '.github/workflows/ci.yml', status: 'completed', conclusion: 'success', repository: { full_name: 'kapi1944/Ogarniacz' }, ...dane }
}

function wydanie(dane = manifest) {
  return { tag_name: `beta-${dane.numerBuildu}-${dane.sha}`, prerelease: true, draft: false,
    body: '```json\n' + JSON.stringify(dane) + '\n```',
    assets: dane.artefakty.map((artefakt) => ({ name: artefakt.nazwa, size: artefakt.rozmiar, state: 'uploaded', digest: `sha256:${artefakt.sha256}` as string | null })),
  }
}

function przygotuj(ustawienia: { manifest?: typeof manifest; ci?: ReturnType<typeof przebieg>[]; wydania?: ReturnType<typeof wydanie>[]; build?: ReturnType<typeof przebieg> } = {}) {
  const wybranyManifest = ustawienia.manifest ?? manifest
  const odczytaj = vi.fn(async (sciezka: string) => {
    if (sciezka === '/commits/main') return { sha, commit: { message: 'Zmiana main', committer: { date: manifest.data } } }
    if (sciezka.startsWith('/actions/workflows/ci.yml/')) return { workflow_runs: ustawienia.ci ?? [przebieg()] }
    if (sciezka.startsWith('/releases?')) return ustawienia.wydania ?? [wydanie(wybranyManifest)]
    if (sciezka === '/actions/runs/20') return przebieg({ head_sha: wybranyManifest.sha })
    if (sciezka === '/actions/runs/30') return ustawienia.build ?? przebieg({ id: 30, run_number: 42, path: '.github/workflows/test-build.yml', event: 'workflow_dispatch', head_sha: wybranyManifest.sha })
    throw new Error('Niedozwolone żądanie: ' + sciezka)
  })
  return { odczytaj, usluga: utworzUslugeAktualizacjiTestowych(odczytaj), sygnal: new AbortController().signal }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('wykrywanie rzeczywistej platformy', () => {
  it.each([
    [{ android: true, pwa: false, windows: false }, 'android', 'Android'],
    [{ android: false, pwa: false, windows: true }, 'web', 'Web / Windows'],
    [{ android: false, pwa: true, windows: true }, 'web', 'PWA / Windows'],
    [{ android: false, pwa: true, windows: false }, 'web', 'PWA'],
    [{ android: false, pwa: false, windows: false }, 'web', 'Web'],
  ] as const)('rozpoznaje %j bez wymyślania natywnego Windows lub Raspberry', (dane, rodzaj, etykieta) => {
    expect(wykryjPlatformeTestowa(dane)).toEqual({ rodzaj, etykieta: expect.stringContaining(etykieta) })
  })
})

describe('manifest i pełne SHA', () => {
  it('porównuje wyłącznie pełne SHA, bez dopasowywania prefiksu', () => {
    expect(czyTeSameSha(sha, sha.toUpperCase())).toBe(true)
    expect(czyTeSameSha(sha, sha.slice(0, 7))).toBe(false)
    expect(czyTeSameSha(null, null)).toBe(false)
    expect(czyTeSameSha(sha, starszySha)).toBe(false)
    expect(czyTeSameSha('z'.repeat(40), 'z'.repeat(40))).toBe(false)
  })

  it('oddziela Betę od produkcyjnego manifestu i pakietu', () => {
    expect(parsujManifestTestowy(manifest).wersja).toBe('1.1.0-beta.42')
    expect(() => parsujManifestTestowy({ versionName: '1.0.23', versionCode: 1000023 })).toThrow('manifest')
    for (const dane of [{ kanal: 'stable' }, { galaz: 'rpi-stable' }, { repozytorium: 'obcy/Ogarniacz' }, { wersja: '1.1.0' }]) {
      expect(() => parsujManifestTestowy({ ...manifest, ...dane })).toThrow('manifest')
    }
    expect(() => parsujManifestTestowy({ ...manifest, artefakty: [{ ...manifest.artefakty[0], pakiet: 'pl.ogarniacz.app' }] })).toThrow('manifest')
    expect(() => parsujManifestTestowy({ ...manifest, artefakty: [{ ...manifest.artefakty[0], sha256Certyfikatu: 'nieznany' }] })).toThrow('manifest')
  })

  it('odrzuca niespójny numer, datę, hash, ścieżki i powtórzone artefakty', () => {
    expect(() => parsujManifestTestowy({ ...manifest, numerBuildu: 43 })).toThrow('numeracja')
    expect(() => parsujManifestTestowy({ ...manifest, data: 'jutro' })).toThrow('manifest')
    expect(() => parsujManifestTestowy({ ...manifest, artefakty: [...manifest.artefakty, ...manifest.artefakty] })).toThrow('lista')
    for (const dane of [{ sha256: '123' }, { nazwa: '../stable.apk' }, { rozmiar: 0 }]) {
      expect(() => parsujManifestTestowy({ ...manifest, artefakty: [{ ...manifest.artefakty[0], ...dane }] })).toThrow('manifest')
    }
  })
})

describe('odczyt GitHub bez synchronizacji i instalacji', () => {
  it('zachowuje rekordy produkcyjnej bazy i cache ustawień po odczycie metadanych', async () => {
    const tabela = baza.table('ustawienia')
    const rekord = { id: 'ochrona-danych-aktualizacji-testowych', updatedAt: manifest.data, zawartosc: 'Dane pozostają bez zmian' }
    await tabela.put(rekord)
    localStorage.setItem(rekord.id, rekord.zawartosc)
    try {
      const { usluga, sygnal } = przygotuj()
      await usluga.sprawdzBuild(sygnal)
      expect(await tabela.get(rekord.id)).toEqual(rekord)
      expect(localStorage.getItem(rekord.id)).toBe(rekord.zawartosc)
    } finally {
      await tabela.delete(rekord.id)
      localStorage.removeItem(rekord.id)
    }
  })

  it('sprawdza commit i CI oddzielnie od artefaktów', async () => {
    const { usluga, odczytaj, sygnal } = przygotuj()
    expect(await usluga.sprawdzCommit(sygnal)).toMatchObject({ commit: { sha }, ci: { stan: 'sukces' } })
    expect(odczytaj.mock.calls.map(([sciezka]) => sciezka)).toHaveLength(2)
    expect(odczytaj.mock.calls.some(([sciezka]) => sciezka.includes('releases'))).toBe(false)
    expect(Object.keys(usluga).sort()).toEqual(['sprawdzBuild', 'sprawdzCommit'])
  })

  it('potwierdza manifest po metadanych assetu, CI i pomyślnym workflow dokładnego SHA', async () => {
    const { usluga, sygnal } = przygotuj()
    expect(await usluga.sprawdzBuild(sygnal)).toMatchObject({ dostepnyDlaMain: true, manifest: { sha, numerBuildu: 42 } })
  })

  it('odróżnia brak buildu najnowszego commita od dostępności starszego artefaktu', async () => {
    const { usluga, sygnal } = przygotuj({ manifest: { ...manifest, sha: starszySha } })
    expect(await usluga.sprawdzBuild(sygnal)).toMatchObject({ dostepnyDlaMain: false, commit: { sha }, manifest: { sha: starszySha } })
    const brak = przygotuj({ wydania: [] })
    expect(await brak.usluga.sprawdzBuild(brak.sygnal)).toMatchObject({ dostepnyDlaMain: false, manifest: undefined })
  })

  it.each([
    [{ conclusion: 'failure' }, 'blad'], [{ conclusion: 'cancelled' }, 'blad'], [{ status: 'in_progress', conclusion: null }, 'trwa'],
  ])('nie dopuszcza buildu, jeśli najnowsze CI ma stan %j', async (dane, stan) => {
    const { usluga, sygnal } = przygotuj({ ci: [przebieg(), przebieg({ id: 21, ...dane })] })
    expect(await usluga.sprawdzBuild(sygnal)).toMatchObject({ dostepnyDlaMain: false, ci: { stan } })
  })

  it('nie akceptuje zielonego CI obcego SHA, PR ani niewłaściwej gałęzi', async () => {
    const { usluga, sygnal } = przygotuj({ ci: [przebieg({ head_sha: starszySha }), przebieg({ event: 'pull_request' }), przebieg({ head_branch: 'rpi-stable' })] })
    expect(await usluga.sprawdzBuild(sygnal)).toMatchObject({ dostepnyDlaMain: false, ci: { stan: 'brak' } })
  })

  it.each([
    { head_sha: starszySha }, { conclusion: 'failure' }, { status: 'in_progress' }, { run_number: 43 },
    { head_branch: 'inna' }, { path: '.github/workflows/android-release.yml' }, { event: 'push' },
  ])('odrzuca niepotwierdzone pochodzenie buildu %j', async (dane) => {
    const { usluga, sygnal } = przygotuj({ build: przebieg({ id: 30, run_number: 42, path: '.github/workflows/test-build.yml', event: 'workflow_dispatch', ...dane }) })
    await expect(usluga.sprawdzBuild(sygnal)).rejects.toThrow('Brak potwierdzonego sukcesu')
  })

  it('ignoruje produkcyjne release i drafty', async () => {
    const { usluga, sygnal } = przygotuj({ wydania: [{ ...wydanie(), prerelease: false }, { ...wydanie(), draft: true }, { ...wydanie(), tag_name: 'v1.0.23' }] })
    expect(await usluga.sprawdzBuild(sygnal)).toMatchObject({ manifest: undefined, dostepnyDlaMain: false })
  })

  it('blokuje niezgodny SHA tagu i niezgodny SHA-256 assetu', async () => {
    const dane = wydanie()
    const zlyTag = przygotuj({ wydania: [{ ...dane, tag_name: `beta-42-${starszySha}` }] })
    await expect(zlyTag.usluga.sprawdzBuild(zlyTag.sygnal)).rejects.toThrow('nie zgadza się z tagiem')
    for (const zmiana of [{ digest: 'sha256:' + 'e'.repeat(64) }, { digest: null }, { size: 124 }, { state: 'new' }]) {
      const blednyPlik = przygotuj({ wydania: [{ ...dane, assets: [{ ...dane.assets[0], ...zmiana }] }] })
      await expect(blednyPlik.usluga.sprawdzBuild(blednyPlik.sygnal)).rejects.toThrow('niezgodny rozmiar, SHA-256')
    }
  })

  it('czyta kolejne strony zamiast proponować starszy build z pierwszej strony', async () => {
    const { usluga, sygnal, odczytaj } = przygotuj()
    const oryginal = odczytaj.getMockImplementation()!
    odczytaj.mockImplementation(async (sciezka) => sciezka.startsWith('/releases?') && sciezka.endsWith('page=1') ? Array(100).fill({ ...wydanie(), prerelease: false }) : sciezka.startsWith('/releases?') && sciezka.endsWith('page=2') ? [wydanie()] : oryginal(sciezka))
    expect((await usluga.sprawdzBuild(sygnal)).dostepnyDlaMain).toBe(true)
    expect(odczytaj).toHaveBeenCalledWith('/releases?per_page=100&page=2', sygnal)
  })

  it('wykrywa przesunięcie main podczas weryfikacji', async () => {
    const { usluga, sygnal, odczytaj } = przygotuj()
    const oryginal = odczytaj.getMockImplementation()!
    let odczytyMain = 0
    odczytaj.mockImplementation(async (sciezka) => sciezka === '/commits/main' && odczytyMain++ ? { sha: starszySha, commit: { message: 'nowy', committer: { date: manifest.data } } } : oryginal(sciezka))
    await expect(usluga.sprawdzBuild(sygnal)).rejects.toThrow('main zmienił się')
  })

  it('chroni przed równoległymi operacjami i zwalnia blokadę po błędzie', async () => {
    let zakoncz!: (dane: unknown) => void
    const odczytaj = vi.fn(() => new Promise((wynik) => { zakoncz = wynik }))
    const usluga = utworzUslugeAktualizacjiTestowych(odczytaj)
    const kontroler = new AbortController()
    const pierwsza = usluga.sprawdzCommit(kontroler.signal)
    await expect(usluga.sprawdzBuild(kontroler.signal)).rejects.toThrow('już trwa')
    zakoncz({})
    await expect(pierwsza).rejects.toThrow('metadane main')
    kontroler.abort()
    await expect(usluga.sprawdzCommit(kontroler.signal)).rejects.toThrow('Anulowano')
    expect(odczytaj).toHaveBeenCalledTimes(1)
  })
})

describe('transport publiczny', () => {
  it('używa wyłącznie GitHub, bez tokenu, ciasteczek i połączenia z Raspberry', async () => {
    const pobierz = vi.fn().mockResolvedValueOnce({ status: 200, json: async () => ({ sha, commit: { message: 'opis', committer: { date: manifest.data } } }) })
      .mockResolvedValueOnce({ status: 200, json: async () => ({ workflow_runs: [] }) })
    vi.stubGlobal('fetch', pobierz)
    await utworzUslugeAktualizacjiTestowych().sprawdzCommit(new AbortController().signal)
    expect(pobierz).toHaveBeenCalledTimes(2)
    for (const [adres, opcje] of pobierz.mock.calls) {
      expect(adres).toMatch(/^https:\/\/api\.github\.com\/repos\/kapi1944\/Ogarniacz\//)
      expect(opcje.credentials).toBe('omit')
      expect(opcje.headers).not.toHaveProperty('Authorization')
    }
  })

  it('na Androidzie używa istniejącego transportu natywnego', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android')
    const natywny = vi.mocked(CapacitorHttp.get).mockResolvedValueOnce({ status: 200, data: { sha, commit: { message: 'opis', committer: { date: manifest.data } } }, headers: {}, url: '' })
      .mockResolvedValueOnce({ status: 200, data: { workflow_runs: [] }, headers: {}, url: '' })
    const pobierz = vi.fn()
    vi.stubGlobal('fetch', pobierz)
    await utworzUslugeAktualizacjiTestowych().sprawdzCommit(new AbortController().signal)
    expect(natywny).toHaveBeenCalledTimes(2)
    expect(pobierz).not.toHaveBeenCalled()
  })

  it.each([403, 429, 404, 500])('raportuje HTTP %s bez mylenia z błędem synchronizacji', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status }))
    await expect(utworzUslugeAktualizacjiTestowych().sprawdzCommit(new AbortController().signal)).rejects.toThrow(status === 403 || status === 429 ? 'ograniczył publiczne' : `GitHub zwrócił HTTP ${status}`)
  })

  it('obsługuje przerwanie odczytu i ukrywa surowy błąd sieci', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const kontroler = new AbortController()
    const zadanie = utworzUslugeAktualizacjiTestowych().sprawdzCommit(kontroler.signal)
    kontroler.abort()
    await expect(zadanie).rejects.toThrow('Anulowano sprawdzanie GitHub')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('TAJNY_TOKEN')))
    const ponowienie = utworzUslugeAktualizacjiTestowych().sprawdzCommit(new AbortController().signal)
    await expect(ponowienie).rejects.toThrow('Nie udało się odczytać GitHub')
    await expect(ponowienie).rejects.not.toThrow('TAJNY_TOKEN')
  })
})
