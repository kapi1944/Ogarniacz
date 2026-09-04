import { App } from '@capacitor/app'
import { CapacitorHttp, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { z } from 'zod'
import type {
  InformacjeOWersjiAplikacji,
  ManifestAktualizacji,
  PobranaAktualizacja,
  WynikSprawdzeniaAktualizacji,
  WynikUruchomieniaInstalatora,
} from './typy'

interface WtyczkaAktualizacji {
  pobierzApk: (dane: { adres: string; sha256: string; nazwaPliku: string }) => Promise<PobranaAktualizacja>
  uruchomInstalator: (dane: { nazwaPliku: string }) => Promise<WynikUruchomieniaInstalatora>
  addListener: (
    nazwa: 'stanAktualizacji',
    obsluga: (dane: { stan: 'pobieranie' | 'weryfikacja'; procent: number }) => void,
  ) => Promise<PluginListenerHandle>
}

const wtyczkaAktualizacji = registerPlugin<WtyczkaAktualizacji>('Aktualizacje')
const adresManifestu = (import.meta.env.VITE_ANDROID_UPDATE_MANIFEST_URL ?? '').trim()

const schematManifestu = z.object({
  versionName: z.string().regex(/^\d+\.\d+\.\d+$/),
  versionCode: z.number().int().positive().max(2_100_000_000),
  apkUrl: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  size: z.number().int().positive().optional(),
  releaseNotes: z.string().max(20_000).optional(),
  publishedAt: z.string().refine((wartosc) => !Number.isNaN(Date.parse(wartosc))).optional(),
})

export function obliczKodWersji(wersja: string) {
  const dopasowanie = /^(\d+)\.(\d+)\.(\d+)$/.exec(wersja)
  if (!dopasowanie) throw new Error('Wersja aplikacji ma nieprawidłowy format.')
  const [glowna, poboczna, poprawka] = dopasowanie.slice(1).map(Number)
  if ([glowna, poboczna, poprawka].some((wartosc) => wartosc > 999)) {
    throw new Error('Wersja aplikacji przekracza obsługiwany zakres.')
  }
  return glowna * 1_000_000 + poboczna * 1_000 + poprawka
}

export function parsujManifestAktualizacji(wartosc: unknown): ManifestAktualizacji {
  const wynik = schematManifestu.safeParse(wartosc)
  if (!wynik.success) throw new Error('Serwer zwrócił nieprawidłowy manifest aktualizacji.')
  if (wynik.data.versionCode !== obliczKodWersji(wynik.data.versionName)) {
    throw new Error('Manifest aktualizacji zawiera niespójny numer wersji.')
  }
  return wynik.data
}

export function czyNowszaWersja(manifest: ManifestAktualizacji, obecnyKodWersji: number) {
  return manifest.versionCode > obecnyKodWersji
}

function sprawdzAdresHttps(adres: string, etykieta: string) {
  let url: URL
  try {
    url = new URL(adres)
  } catch {
    throw new Error(`${etykieta} jest nieprawidłowy.`)
  }
  if (url.protocol !== 'https:') throw new Error(`${etykieta} musi używać HTTPS.`)
  return url.toString()
}

function nazwaApk(manifest: ManifestAktualizacji) {
  return `Ogarniacz-${manifest.versionName}-release.apk`
}

export function utworzUslugeAktualizacji(czyAndroid: boolean) {
  const pobierzInformacje = async (): Promise<InformacjeOWersjiAplikacji> => {
    if (czyAndroid) {
      const informacje = await App.getInfo()
      const kod = Number(informacje.build)
      return {
        wersja: informacje.version,
        kod: Number.isInteger(kod) && kod > 0 ? kod : obliczKodWersji(informacje.version),
      }
    }
    return { wersja: __WERSJA_APLIKACJI__, kod: obliczKodWersji(__WERSJA_APLIKACJI__) }
  }

  return {
    skonfigurowane: () => czyAndroid && adresManifestu !== '',
    pobierzInformacje,
    sprawdz: async (): Promise<WynikSprawdzeniaAktualizacji> => {
      if (!czyAndroid) throw new Error('Aktualizacje APK są dostępne tylko w aplikacji Android.')
      if (!adresManifestu) throw new Error('Źródło aktualizacji nie jest skonfigurowane w tym buildzie.')
      const bezpiecznyAdresManifestu = sprawdzAdresHttps(adresManifestu, 'Adres manifestu aktualizacji')
      const odpowiedz = await CapacitorHttp.get({
        url: bezpiecznyAdresManifestu,
        connectTimeout: 15_000,
        readTimeout: 15_000,
        responseType: 'json',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      })
      if (odpowiedz.status < 200 || odpowiedz.status >= 300) {
        throw new Error(`Serwer aktualizacji zwrócił HTTP ${odpowiedz.status}.`)
      }
      const surowyManifest = typeof odpowiedz.data === 'string' ? JSON.parse(odpowiedz.data) : odpowiedz.data
      const manifest = parsujManifestAktualizacji(surowyManifest)
      const informacje = await pobierzInformacje()
      const adresApk = sprawdzAdresHttps(new URL(manifest.apkUrl, bezpiecznyAdresManifestu).toString(), 'Adres APK')
      return { manifest, adresApk, czyNowsza: czyNowszaWersja(manifest, informacje.kod) }
    },
    pobierz: async (
      manifest: ManifestAktualizacji,
      adresApk: string,
      obslugaStanu: (stan: 'pobieranie' | 'weryfikacja', procent: number) => void,
    ) => {
      if (!czyAndroid) throw new Error('Pobieranie APK jest dostępne tylko w aplikacji Android.')
      const nasluchiwanie = await wtyczkaAktualizacji.addListener('stanAktualizacji', (dane) => {
        obslugaStanu(dane.stan, dane.procent)
      })
      try {
        return await wtyczkaAktualizacji.pobierzApk({
          adres: sprawdzAdresHttps(adresApk, 'Adres APK'),
          sha256: manifest.sha256,
          nazwaPliku: nazwaApk(manifest),
        })
      } finally {
        await nasluchiwanie.remove()
      }
    },
    uruchomInstalator: async (aktualizacja: PobranaAktualizacja) => {
      if (!czyAndroid) throw new Error('Instalator APK jest dostępny tylko w aplikacji Android.')
      return wtyczkaAktualizacji.uruchomInstalator({ nazwaPliku: aktualizacja.nazwaPliku })
    },
  }
}
