import type { Przypomnienie, PowiazanieEncji } from '../domain/typy'

export type RodzajPlatformy = 'web' | 'android'
export type StanCykluZycia = 'aktywny' | 'nieaktywny'
export type StanZgody = 'przyznana' | 'odrzucona' | 'pytaj' | 'niedostepna'
export type KanalPowiadomienia = 'ogarniacz-wazne' | 'ogarniacz-zwykle' | 'ogarniacz-zdrowie' | 'ogarniacz-finanse'
export type TypAkcjiPowiadomienia = 'otworz' | 'wykonane' | 'odrocz'

export interface AkcjaPowiadomienia {
  typ: TypAkcjiPowiadomienia
  przypomnienieId?: string
  sciezka: string
  sourceRef?: PowiazanieEncji
}

export interface DanePowiadomienia {
  tytul: string
  tresc: string
  sciezka?: string
}

export interface PowiadomieniePlatformowe {
  id: number
  przypomnienieId: string
  tytul: string
  tresc: string
  termin: string
  kanal: KanalPowiadomienia
  sourceRef?: PowiazanieEncji
  sciezka: string
  wymagaDokladnosci: boolean
  wersja: string
}

export interface StanPowiadomienPlatformy {
  zgoda: StanZgody
  systemoweWlaczone: boolean
  kanalyGotowe: boolean | null
  exactAlarms: StanZgody | null
}

export interface WynikSynchronizacjiPowiadomien {
  zaplanowanePrzypomnieniaIds: string[]
}

export interface DaneUdostepniania {
  tytul?: string
  tekst?: string
  adres?: string
  pliki?: string[]
}

export interface InformacjeOWersjiAplikacji {
  wersja: string
  kod: number
}

export interface ManifestAktualizacji {
  version: string
  versionCode: number
  apkUrl: string
  sha256: string
  publishedAt: string
}

export interface WynikSprawdzeniaAktualizacji {
  manifest: ManifestAktualizacji
  adresApk: string
  czyNowsza: boolean
}

export interface PobranaAktualizacja {
  nazwaPliku: string
  sha256: string
}

export interface WynikUruchomieniaInstalatora {
  uruchomiono: boolean
  wymagaZgody: boolean
}

export interface OdebraneDaneUdostepniania {
  tekst: string
  tytul?: string
}

export interface PlatformaOgarniacza {
  rodzaj: RodzajPlatformy
  natywna: boolean
  cyklZycia: {
    pobierzStan: () => Promise<StanCykluZycia>
    nasluchuj: (obsluga: (stan: StanCykluZycia) => void) => Promise<() => void>
  }
  powiadomienia: {
    dostepne: () => boolean
    poprosOUprawnienie: () => Promise<boolean>
    sprawdzStan: () => Promise<StanPowiadomienPlatformy>
    pokaz: (dane: DanePowiadomienia) => Promise<boolean>
    zaplanuj: (powiadomienia: PowiadomieniePlatformowe[]) => Promise<void>
    anuluj: (identyfikatory: number[]) => Promise<void>
    przeplanuj: (powiadomienia: PowiadomieniePlatformowe[]) => Promise<void>
      synchronizuj: (przypomnienia: Przypomnienie[], wlaczone: boolean, ukrywajSzczegolyZdrowotne?: boolean) => Promise<WynikSynchronizacjiPowiadomien>
    nasluchujAkcji: (obsluga: (akcja: AkcjaPowiadomienia) => void) => () => void
  }
  pliki: {
    zapisz: (nazwa: string, dane: Blob) => Promise<boolean>
    zapiszTymczasowo: (nazwa: string, dane: Blob) => Promise<string | undefined>
  }
  udostepnianie: {
    dostepne: () => boolean
    udostepnij: (dane: DaneUdostepniania) => Promise<boolean>
    nasluchujOdebrania: (obsluga: (dane: OdebraneDaneUdostepniania) => void) => Promise<() => void>
  }
  haptyka: {
    dostepna: () => boolean
    dotkniecie: () => Promise<boolean>
    sukces: () => Promise<boolean>
    ostrzezenie: () => Promise<boolean>
  }
  migawkiWidgetow: {
    dostepne: () => boolean
    zapisz: (dane: unknown) => Promise<boolean>
  }
  aktualizacje: {
    skonfigurowane: () => boolean
    pobierzInformacje: () => Promise<InformacjeOWersjiAplikacji>
    sprawdz: () => Promise<WynikSprawdzeniaAktualizacji>
    pobierz: (
      manifest: ManifestAktualizacji,
      adresApk: string,
      obslugaStanu: (stan: 'pobieranie' | 'weryfikacja', procent: number) => void,
    ) => Promise<PobranaAktualizacja>
    uruchomInstalator: (aktualizacja: PobranaAktualizacja) => Promise<WynikUruchomieniaInstalatora>
  }
}
