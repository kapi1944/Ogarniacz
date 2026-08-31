export type RodzajPlatformy = 'web' | 'android'
export type StanCykluZycia = 'aktywny' | 'nieaktywny'

export interface DanePowiadomienia {
  tytul: string
  tresc: string
}

export interface DaneUdostepniania {
  tytul?: string
  tekst?: string
  adres?: string
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
    pokaz: (dane: DanePowiadomienia) => Promise<boolean>
  }
  pliki: {
    zapisz: (nazwa: string, dane: Blob) => Promise<boolean>
  }
  udostepnianie: {
    dostepne: () => boolean
    udostepnij: (dane: DaneUdostepniania) => Promise<boolean>
  }
  haptyka: {
    dostepna: () => boolean
    dotkniecie: () => Promise<boolean>
  }
  migawkiWidgetow: {
    dostepne: () => boolean
    zapisz: (dane: unknown) => Promise<boolean>
  }
}
