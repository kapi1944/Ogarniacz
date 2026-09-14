import { Capacitor, registerPlugin } from '@capacitor/core'

export interface KonfiguracjaRuntime {
  syncApiUrl?: string
  androidUpdateManifestUrl?: string
  androidWebUpdateManifestUrl?: string
  diagnostyka: string[]
}

interface WtyczkaKonfiguracjiRuntime {
  pobierzKonfiguracje: () => Promise<Partial<KonfiguracjaRuntime>>
}

interface ZaleznosciKonfiguracjiRuntime {
  czyAndroid: boolean
  pobierzKonfiguracjeNatywna: () => Promise<Partial<KonfiguracjaRuntime>>
  konfiguracjaWeb: Partial<KonfiguracjaRuntime>
}

const wtyczkaKonfiguracjiRuntime = registerPlugin<WtyczkaKonfiguracjiRuntime>('RuntimeConfig')

function oczyscAdres(wartosc: string | undefined) {
  return wartosc?.trim() || undefined
}

function utworzKonfiguracje(zrodlo: Partial<KonfiguracjaRuntime>, czyAndroid: boolean): KonfiguracjaRuntime {
  const konfiguracja = {
    syncApiUrl: oczyscAdres(zrodlo.syncApiUrl),
    androidUpdateManifestUrl: oczyscAdres(zrodlo.androidUpdateManifestUrl),
    androidWebUpdateManifestUrl: oczyscAdres(zrodlo.androidWebUpdateManifestUrl),
  }
  const diagnostyka = czyAndroid
    ? [
      !konfiguracja.syncApiUrl && 'Brak syncApiUrl w natywnej konfiguracji APK.',
      !konfiguracja.androidUpdateManifestUrl && 'Brak androidUpdateManifestUrl w natywnej konfiguracji APK.',
      !konfiguracja.androidWebUpdateManifestUrl && 'Brak androidWebUpdateManifestUrl w natywnej konfiguracji APK.',
    ].filter((komunikat): komunikat is string => Boolean(komunikat))
    : []
  return { ...konfiguracja, diagnostyka }
}

function pobierzKonfiguracjeWeb(): Partial<KonfiguracjaRuntime> {
  const zSerwera = (globalThis as typeof globalThis & { __OGARNIACZ_RUNTIME_CONFIG__?: Partial<KonfiguracjaRuntime> }).__OGARNIACZ_RUNTIME_CONFIG__
  return {
    syncApiUrl: zSerwera?.syncApiUrl ?? import.meta.env.VITE_SYNC_API_URL,
    androidUpdateManifestUrl: zSerwera?.androidUpdateManifestUrl ?? import.meta.env.VITE_ANDROID_UPDATE_MANIFEST_URL,
    androidWebUpdateManifestUrl: zSerwera?.androidWebUpdateManifestUrl ?? import.meta.env.VITE_ANDROID_WEB_UPDATE_MANIFEST_URL,
  }
}

export function utworzRuntimeConfigService(zaleznosci: ZaleznosciKonfiguracjiRuntime) {
  let konfiguracja = utworzKonfiguracje(zaleznosci.konfiguracjaWeb, false)

  return {
    inicjalizuj: async () => {
      if (zaleznosci.czyAndroid) {
        try {
          konfiguracja = utworzKonfiguracje(await zaleznosci.pobierzKonfiguracjeNatywna(), true)
        } catch {
          konfiguracja = utworzKonfiguracje({}, true)
          konfiguracja.diagnostyka.push('Nie udało się odczytać natywnej konfiguracji APK.')
        }
      }
      return konfiguracja
    },
    pobierz: () => konfiguracja,
  }
}

const serwisRuntimeConfig = utworzRuntimeConfigService({
  czyAndroid: Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform(),
  pobierzKonfiguracjeNatywna: () => wtyczkaKonfiguracjiRuntime.pobierzKonfiguracje(),
  konfiguracjaWeb: pobierzKonfiguracjeWeb(),
})

export const inicjalizujRuntimeConfig = () => serwisRuntimeConfig.inicjalizuj()
export const pobierzKonfiguracjeRuntime = () => serwisRuntimeConfig.pobierz()
export const pobierzDiagnostykeRuntime = () => pobierzKonfiguracjeRuntime().diagnostyka.join(' ')
