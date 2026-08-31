import type { RyzykoDzialania } from '../../domain/typy'

export type TrybEcho = 'pelny_agent' | 'ograniczony_lokalny'
export type ZrodloWejsciaEcho = 'tekst' | 'stt'

export interface KontekstCzasuEcho {
  teraz: string
  dataLokalna: string
  strefaCzasowa: string
}

export interface TuraRozmowyEcho {
  rola: 'uzytkownik' | 'echo'
  tresc: string
  znacznikCzasu: string
}

export interface WynikNarzedziaEcho {
  wywolanieId: string
  nazwa: string
  status: 'wykonane' | 'blad' | 'zablokowane' | 'wymaga_potwierdzenia'
  dane?: unknown
  komunikat?: string
}

export interface MigawkaKontekstuEcho {
  tury: TuraRozmowyEcho[]
  streszczenie?: string
  temat?: string
  ostatnieEncje: { typ: string; id: string; etykieta?: string }[]
  ostatnieWynikiNarzedzi: WynikNarzedziaEcho[]
  ostatniaAkcja?: { narzedzie: string; argumenty: unknown }
  nierozwiazanePytanie?: string
  odniesieniaCzasowe: string[]
}

export interface DefinicjaNarzedziaEcho {
  nazwa: string
  opis: string
  schematArgumentow: unknown
  ryzyko: RyzykoDzialania
}

export interface WywolanieNarzedziaEcho {
  id: string
  nazwa: string
  argumenty: unknown
}

export type DecyzjaModeluEcho =
  | { typ: 'odpowiedz'; tresc: string }
  | { typ: 'pytanie'; tresc: string }
  | { typ: 'narzedzia'; wywolania: WywolanieNarzedziaEcho[] }

export interface ZadanieModeluEcho {
  instrukcjeSystemowe: string[]
  kontekstCzasu: KontekstCzasuEcho
  kontekstRozmowy: MigawkaKontekstuEcho
  narzedzia: DefinicjaNarzedziaEcho[]
}

export interface ProviderModeluEcho {
  readonly nazwa: string
  readonly tryb: TrybEcho
  odpowiedz(zadanie: ZadanieModeluEcho, sygnal: AbortSignal): Promise<DecyzjaModeluEcho>
  odpowiedzStrumieniowa?(zadanie: ZadanieModeluEcho, sygnal: AbortSignal): AsyncIterable<string>
}

export interface AkcjaDoPotwierdzeniaEcho {
  wywolanie: WywolanieNarzedziaEcho
  ryzyko: RyzykoDzialania
  opis: string
}

export interface OdpowiedzEcho {
  tekst: string
  ryzyko: RyzykoDzialania
  tryb: TrybEcho
  wymagaPotwierdzenia?: boolean
  akcjaDoPotwierdzenia?: AkcjaDoPotwierdzeniaEcho
}

export interface KandydatPamieciEcho {
  tresc: string
  typ: 'fakt' | 'preferencja' | 'regula'
  zrodlo: 'jawna_prosba' | 'propozycja_echo' | 'reczne'
  utworzonoAt: string
  pewnosc: number
}

export interface MagazynPamieciEcho {
  wyszukaj(zapytanie: string, limit: number): Promise<KandydatPamieciEcho[]>
  zapisz(kandydat: KandydatPamieciEcho): Promise<string>
  usun(id: string): Promise<void>
}

export interface WgladEcho {
  id: string
  opis: string
  waznosc: 'niska' | 'srednia' | 'wysoka'
  zrodla: string[]
}

export interface SugestiaEcho {
  wgladId: string
  tresc: string
  proponowaneNarzedzie?: string
  proponowaneArgumenty?: unknown
}
