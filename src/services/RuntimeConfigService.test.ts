import { describe, expect, it, vi } from 'vitest'
import { utworzRuntimeConfigService } from './RuntimeConfigService'

describe('RuntimeConfigService', () => {
  it.each([undefined, '', '   '])('Web/PWA bez endpointu (%s) korzysta z własnego HTTPS', async (adresApi) => {
    const serwis = utworzRuntimeConfigService({
      czyAndroid: false,
      pobierzKonfiguracjeNatywna: async () => ({}),
      konfiguracjaWeb: { syncApiUrl: adresApi },
      pochodzenieWeb: 'https://serwer.tailnet.ts.net',
    })

    await serwis.inicjalizuj()

    expect(serwis.pobierz().syncApiUrl).toBe('https://serwer.tailnet.ts.net')
  })

  it.each(['http://localhost:5173', 'http://serwer.local', 'null', undefined])('nie dobiera API dla niezabezpieczonego lub brakującego originu %s', async (pochodzenieWeb) => {
    const serwis = utworzRuntimeConfigService({
      czyAndroid: false,
      pobierzKonfiguracjeNatywna: async () => ({}),
      konfiguracjaWeb: {},
      pochodzenieWeb,
    })

    await serwis.inicjalizuj()

    expect(serwis.pobierz().syncApiUrl).toBeUndefined()
  })

  it('zachowuje jawny endpoint dla Web/PWA hostowanego osobno', async () => {
    const serwis = utworzRuntimeConfigService({
      czyAndroid: false,
      pobierzKonfiguracjeNatywna: async () => ({}),
      konfiguracjaWeb: { syncApiUrl: ' https://sync.example.test ' },
      pochodzenieWeb: 'https://web.example.test',
    })

    await serwis.inicjalizuj()

    expect(serwis.pobierz().syncApiUrl).toBe('https://sync.example.test')
  })

  it('na Androidzie zachowuje konfigurację APK bez konfiguracji Web OTA', async () => {
    const serwis = utworzRuntimeConfigService({
      czyAndroid: true,
      pobierzKonfiguracjeNatywna: async () => ({
        syncApiUrl: 'https://sync.example.test',
        androidUpdateManifestUrl: 'https://updates.example.test/latest.json',
      }),
      konfiguracjaWeb: {},
      pochodzenieWeb: 'https://localhost',
    })

    await serwis.inicjalizuj()

    expect(serwis.pobierz()).toMatchObject({
      syncApiUrl: 'https://sync.example.test',
      androidUpdateManifestUrl: 'https://updates.example.test/latest.json',
      diagnostyka: [],
    })
  })

  it('zgłasza czytelną diagnostykę dla pustej konfiguracji APK', async () => {
    const serwis = utworzRuntimeConfigService({
      czyAndroid: true,
      pobierzKonfiguracjeNatywna: async () => ({}),
      konfiguracjaWeb: {},
      pochodzenieWeb: 'https://localhost',
    })

    await serwis.inicjalizuj()

    expect(serwis.pobierz().diagnostyka).toEqual([
      'Brak syncApiUrl w natywnej konfiguracji APK.',
      'Brak adresu manifestu w APK; używane jest publiczne źródło GitHub Releases (Stable).',
    ])
    expect(serwis.pobierz().syncApiUrl).toBeUndefined()
    expect(serwis.pobierz().androidUpdateManifestUrl).toBe('https://github.com/kapi1944/Ogarniacz/releases/latest/download/latest.json')
  })

  it('błąd odczytu APK nie uruchamia fallbacku same-origin', async () => {
    const serwis = utworzRuntimeConfigService({
      czyAndroid: true,
      pobierzKonfiguracjeNatywna: async () => { throw new Error('Brak wtyczki') },
      konfiguracjaWeb: {},
      pochodzenieWeb: 'https://localhost',
    })

    expect(serwis.pobierz().syncApiUrl).toBeUndefined()
    await serwis.inicjalizuj()
    expect(serwis.pobierz().syncApiUrl).toBeUndefined()
    expect(serwis.pobierz().diagnostyka).toContain('Nie udało się odczytać natywnej konfiguracji APK.')
    expect(serwis.pobierz().androidUpdateManifestUrl).toBe('https://github.com/kapi1944/Ogarniacz/releases/latest/download/latest.json')
  })

  it('Beta bez backendu nie włącza aktualizacji Stable', async () => {
    const serwis = utworzRuntimeConfigService({ czyAndroid: true, pobierzKonfiguracjeNatywna: async () => ({ kanalBeta: true }), konfiguracjaWeb: {} })
    await serwis.inicjalizuj()
    expect(serwis.pobierz().androidUpdateManifestUrl).toBeUndefined()
  })

  it.each(['https://example.test/latest.json?token=sekret#fragment', 'https://login:sekret@example.test/latest.json'])('diagnostyka źródła nie ujawnia danych logowania ani parametrów: %s', async (adres) => {
    vi.stubGlobal('__OGARNIACZ_RUNTIME_CONFIG__', { androidUpdateManifestUrl: adres })
    vi.resetModules()
    try {
      const { pobierzDiagnostykeZrodlaAktualizacji } = await import('./RuntimeConfigService')
      expect(pobierzDiagnostykeZrodlaAktualizacji()).not.toMatch(/sekret|login|fragment/)
    } finally {
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  })
})
