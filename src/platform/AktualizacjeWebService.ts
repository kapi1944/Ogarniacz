import { App } from '@capacitor/app'
import { CapacitorHttp, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { z } from 'zod'
import type {
  ManifestAktualizacjiWeb,
  StanAktualizacjiWeb,
  WynikSprawdzeniaAktualizacjiWeb,
} from './typy'

type StanPobieraniaWeb = 'pobieranie' | 'weryfikacja' | 'rozpakowywanie'

interface WtyczkaAktualizacjiWeb {
  pobierzStan: () => Promise<StanAktualizacjiWeb>
  pobierzIAktywuj: (dane: ManifestAktualizacjiWeb & { ponownaProba: boolean }) => Promise<void>
  potwierdzGotowoscBundle: () => Promise<void>
  przywrocPoprzednia: () => Promise<void>
  przywrocWbudowana: () => Promise<void>
  addListener: (
    nazwa: 'stanAktualizacjiWeb',
    obsluga: (dane: { stan: StanPobieraniaWeb; procent: number }) => void,
  ) => Promise<PluginListenerHandle>
}

const wtyczkaAktualizacjiWeb = registerPlugin<WtyczkaAktualizacjiWeb>('AktualizacjeWeb')
const adresManifestuWeb = (import.meta.env.VITE_ANDROID_WEB_UPDATE_MANIFEST_URL ?? '').trim()

const schematManifestuWeb = z.object({
  bundleVersion: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
  commitSha: z.string().regex(/^[a-f0-9]{40}$/i),
  url: z.string().url().refine((wartosc) => new URL(wartosc).protocol === 'https:'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  signature: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(4096),
  minNativeVersionCode: z.number().int().positive().max(2_100_000_000),
  publishedAt: z.string().refine((wartosc) => !Number.isNaN(Date.parse(wartosc))),
})

export function parsujManifestAktualizacjiWeb(wartosc: unknown): ManifestAktualizacjiWeb {
  const wynik = schematManifestuWeb.safeParse(wartosc)
  if (!wynik.success) throw new Error('Serwer zwrócił nieprawidłowy manifest szybkiej aktualizacji.')
  return {
    ...wynik.data,
    commitSha: wynik.data.commitSha.toLowerCase(),
    sha256: wynik.data.sha256.toLowerCase(),
  }
}

export function utworzDaneDoPodpisuWeb(manifest: Omit<ManifestAktualizacjiWeb, 'signature'>) {
  return [
    'ogarniacz-web-ota-v1',
    manifest.bundleVersion,
    manifest.commitSha.toLowerCase(),
    manifest.url,
    manifest.sha256.toLowerCase(),
    String(manifest.minNativeVersionCode),
    manifest.publishedAt,
  ].join('\n')
}

function sprawdzAdresManifestu(adres: string) {
  let url: URL
  try {
    url = new URL(adres)
  } catch {
    throw new Error('Adres manifestu szybkiej aktualizacji jest nieprawidłowy.')
  }
  if (url.protocol !== 'https:') throw new Error('Adres manifestu szybkiej aktualizacji musi używać HTTPS.')
  if (url.pathname.includes('/releases/latest/')) {
    throw new Error('Web OTA musi używać kanału niezależnego od latest dla APK.')
  }
  return url.toString()
}

function czyTenSamBundle(
  lewy: Pick<ManifestAktualizacjiWeb, 'bundleVersion' | 'commitSha'>,
  prawy: Pick<ManifestAktualizacjiWeb, 'bundleVersion' | 'commitSha'>,
) {
  return lewy.bundleVersion === prawy.bundleVersion
    && lewy.commitSha.toLowerCase() === prawy.commitSha.toLowerCase()
}

export function utworzUslugeAktualizacjiWeb(czyAndroid: boolean) {
  const pobierzStan = async (): Promise<StanAktualizacjiWeb> => {
    if (czyAndroid) return wtyczkaAktualizacjiWeb.pobierzStan()
    return {
      aktualny: {
        bundleVersion: __WERSJA_BUNDLE__,
        commitSha: __COMMIT_SHA_BUNDLE__,
        installedAt: '',
        source: 'builtin',
      },
      odrzucone: [],
      pending: false,
    }
  }

  return {
    skonfigurowane: () => czyAndroid && adresManifestuWeb !== '',
    pobierzStan,
    sprawdz: async (): Promise<WynikSprawdzeniaAktualizacjiWeb> => {
      if (!czyAndroid) throw new Error('Szybkie aktualizacje są dostępne tylko w aplikacji Android.')
      if (!adresManifestuWeb) throw new Error('Źródło szybkich aktualizacji nie jest skonfigurowane w tym buildzie.')
      const bezpiecznyAdres = sprawdzAdresManifestu(adresManifestuWeb)
      const odpowiedz = await CapacitorHttp.get({
        url: bezpiecznyAdres,
        connectTimeout: 15_000,
        readTimeout: 15_000,
        responseType: 'json',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      })
      if (odpowiedz.status < 200 || odpowiedz.status >= 300) {
        throw new Error(`Serwer szybkich aktualizacji zwrócił HTTP ${odpowiedz.status}.`)
      }
      const surowyManifest = typeof odpowiedz.data === 'string' ? JSON.parse(odpowiedz.data) : odpowiedz.data
      const manifest = parsujManifestAktualizacjiWeb(surowyManifest)
      const stan = await pobierzStan()
      const informacjeApk = await App.getInfo()
      const kodApk = Number(informacjeApk.build)
      if (!Number.isInteger(kodApk) || kodApk <= 0) {
        throw new Error('Nie udało się odczytać versionCode aplikacji Android.')
      }
      const czyOdrzucona = stan.odrzucone.some((odrzucona) => czyTenSamBundle(odrzucona, manifest))
      return {
        manifest,
        stan,
        czyDostepna: !czyTenSamBundle(stan.aktualny, manifest),
        czyOdrzucona,
        wymagaNowszegoApk: kodApk < manifest.minNativeVersionCode,
      }
    },
    pobierzIAktywuj: async (
      manifest: ManifestAktualizacjiWeb,
      ponownaProba: boolean,
      obslugaStanu: (stan: StanPobieraniaWeb, procent: number) => void,
    ) => {
      if (!czyAndroid) throw new Error('Szybkie aktualizacje są dostępne tylko w aplikacji Android.')
      const nasluchiwanie = await wtyczkaAktualizacjiWeb.addListener('stanAktualizacjiWeb', (dane) => {
        obslugaStanu(dane.stan, dane.procent)
      })
      try {
        await wtyczkaAktualizacjiWeb.pobierzIAktywuj({ ...manifest, ponownaProba })
      } finally {
        await nasluchiwanie.remove()
      }
    },
    potwierdzGotowoscBundle: async () => {
      if (czyAndroid) await wtyczkaAktualizacjiWeb.potwierdzGotowoscBundle()
    },
    przywrocPoprzednia: async () => {
      if (!czyAndroid) throw new Error('Przywracanie bundle jest dostępne tylko w aplikacji Android.')
      await wtyczkaAktualizacjiWeb.przywrocPoprzednia()
    },
    przywrocWbudowana: async () => {
      if (!czyAndroid) throw new Error('Przywracanie bundle jest dostępne tylko w aplikacji Android.')
      await wtyczkaAktualizacjiWeb.przywrocWbudowana()
    },
  }
}
