import { describe, expect, it } from 'vitest'
import { utworzRuntimeConfigService } from './RuntimeConfigService'

describe('RuntimeConfigService', () => {
  it('na Androidzie zachowuje konfigurację APK mimo pustego środowiska Web OTA', async () => {
    const serwis = utworzRuntimeConfigService({
      czyAndroid: true,
      pobierzKonfiguracjeNatywna: async () => ({
        syncApiUrl: 'https://sync.example.test',
        androidUpdateManifestUrl: 'https://updates.example.test/latest.json',
        androidWebUpdateManifestUrl: 'https://updates.example.test/web-ota.json',
      }),
      konfiguracjaWeb: {},
    })

    await serwis.inicjalizuj()

    expect(serwis.pobierz()).toMatchObject({
      syncApiUrl: 'https://sync.example.test',
      androidUpdateManifestUrl: 'https://updates.example.test/latest.json',
      androidWebUpdateManifestUrl: 'https://updates.example.test/web-ota.json',
      diagnostyka: [],
    })
  })

  it('zgłasza czytelną diagnostykę dla pustej konfiguracji APK', async () => {
    const serwis = utworzRuntimeConfigService({
      czyAndroid: true,
      pobierzKonfiguracjeNatywna: async () => ({}),
      konfiguracjaWeb: {},
    })

    await serwis.inicjalizuj()

    expect(serwis.pobierz().diagnostyka).toEqual([
      'Brak syncApiUrl w natywnej konfiguracji APK.',
      'Brak androidUpdateManifestUrl w natywnej konfiguracji APK.',
      'Brak androidWebUpdateManifestUrl w natywnej konfiguracji APK.',
    ])
  })
})
