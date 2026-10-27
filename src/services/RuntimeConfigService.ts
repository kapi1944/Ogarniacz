import { Capacitor, registerPlugin } from '@capacitor/core'

export interface KonfiguracjaRuntime {
  kanalBeta?: boolean
  syncApiUrl?: string
  androidUpdateManifestUrl?: string
  diagnostyka: string[]
}

interface WtyczkaKonfiguracjiRuntime {
  pobierzKonfiguracje: () => Promise<Partial<KonfiguracjaRuntime>>
}

interface ZaleznosciKonfiguracjiRuntime {
  czyAndroid: boolean
  pobierzKonfiguracjeNatywna: () => Promise<Partial<KonfiguracjaRuntime>>
  konfiguracjaWeb: Partial<KonfiguracjaRuntime>
  pochodzenieWeb?: string
}

const wtyczkaKonfiguracjiRuntime = registerPlugin<WtyczkaKonfiguracjiRuntime>('RuntimeConfig')
const ADRES_MANIFESTU_STABLE = 'https://github.com/kapi1944/Ogarniacz/releases/latest/download/latest.json'

function oczyscAdres(wartosc: string | undefined) {
  return wartosc?.trim() || undefined
}

function utworzKonfiguracje(zrodlo: Partial<KonfiguracjaRuntime>, czyAndroid: boolean): KonfiguracjaRuntime {
  const kanalBeta = zrodlo.kanalBeta === true || import.meta.env.VITE_KANAL_BETA === 'true'
  const konfiguracja = {
    kanalBeta,
    syncApiUrl: kanalBeta ? undefined : oczyscAdres(zrodlo.syncApiUrl),
    androidUpdateManifestUrl: kanalBeta ? undefined : oczyscAdres(zrodlo.androidUpdateManifestUrl) ?? (czyAndroid ? ADRES_MANIFESTU_STABLE : undefined),
  }
  const diagnostyka = czyAndroid
    ? [
      !konfiguracja.syncApiUrl && 'Brak syncApiUrl w natywnej konfiguracji APK.',
      !kanalBeta && !oczyscAdres(zrodlo.androidUpdateManifestUrl) && 'Brak adresu manifestu w APK; używane jest publiczne źródło GitHub Releases (Stable).',
    ].filter((komunikat): komunikat is string => Boolean(komunikat))
    : []
  return { ...konfiguracja, diagnostyka }
}

function pobierzKonfiguracjeWeb(): Partial<KonfiguracjaRuntime> {
  const zSerwera = (globalThis as typeof globalThis & { __OGARNIACZ_RUNTIME_CONFIG__?: Partial<KonfiguracjaRuntime> }).__OGARNIACZ_RUNTIME_CONFIG__
  return {
    syncApiUrl: zSerwera?.syncApiUrl ?? import.meta.env.VITE_SYNC_API_URL,
    androidUpdateManifestUrl: zSerwera?.androidUpdateManifestUrl ?? import.meta.env.VITE_ANDROID_UPDATE_MANIFEST_URL,
  }
}

export function utworzRuntimeConfigService(zaleznosci: ZaleznosciKonfiguracjiRuntime) {
  const adresWlasnegoApi = !zaleznosci.czyAndroid && zaleznosci.pochodzenieWeb?.startsWith('https://')
    ? zaleznosci.pochodzenieWeb
    : undefined
  let konfiguracja = utworzKonfiguracje({
    ...(zaleznosci.czyAndroid ? {} : zaleznosci.konfiguracjaWeb),
    syncApiUrl: zaleznosci.czyAndroid ? undefined : oczyscAdres(zaleznosci.konfiguracjaWeb.syncApiUrl) ?? adresWlasnegoApi,
  }, false)

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
  pochodzenieWeb: globalThis.location?.origin,
})

export const inicjalizujRuntimeConfig = () => serwisRuntimeConfig.inicjalizuj()
export const pobierzKonfiguracjeRuntime = () => serwisRuntimeConfig.pobierz()
export const pobierzDiagnostykeRuntime = () => pobierzKonfiguracjeRuntime().diagnostyka.join(' ')

export function pobierzDiagnostykeZrodlaAktualizacji() {
  const adres = pobierzKonfiguracjeRuntime().androidUpdateManifestUrl
  if (!adres) return 'Źródło aktualizacji APK nie jest skonfigurowane.'
  try {
    const adresZrodla = new URL(adres)
    if (adresZrodla.protocol !== 'https:' || adresZrodla.username || adresZrodla.password) return 'Nieprawidłowy adres źródła aktualizacji. Wymagane HTTPS bez danych logowania.'
    return `${adres === ADRES_MANIFESTU_STABLE ? 'GitHub Releases (Stable)' : 'Źródło APK'}: ${adresZrodla.origin}${adresZrodla.pathname}`
  } catch {
    return 'Nieprawidłowy adres źródła aktualizacji.'
  }
}

export const czyKanalBeta = () => import.meta.env.VITE_KANAL_BETA === 'true' || pobierzKonfiguracjeRuntime().kanalBeta === true
