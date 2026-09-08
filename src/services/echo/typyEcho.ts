import type { RyzykoDzialania } from '../../domain/typy'

export type TrybEcho = 'pelny_agent' | 'ograniczony_lokalny'
export type TrybRozmowyEcho = 'szybki' | 'swobodny'
export type ZrodloWejsciaEcho = 'tekst' | 'stt'
export type StanPracyEcho = 'gotowy' | 'slucham' | 'rozumiem' | 'wykonuje' | 'gotowe'

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

export interface WartoscDomyslnaEcho {
  pole: 'godzina'
  wartosc: string
  opis: string
  pochodzenie?: 'fakt' | 'preferencja' | 'wartosc_wyliczona' | 'zalozenie' | 'sugestia'
}

export interface KontekstPlanowaniaEcho {
  praca?: { od: string; do: string; zrodlo: 'grafik' }
  zajetePrzedzialy: { tytul: string; od: string; do: string; zrodlo: 'blok_czasu' | 'wizyta' }[]
  preferowanaGodzinaObiadu?: { godzina: string; zrodlo: 'preferencja' }
}

export interface OczekujaceDoprecyzowanieEcho {
  intencja: 'utworz_przypomnienie' | 'przeloz_przypomnienie' | 'edytuj_zadanie' | 'wykonaj_zadanie' | 'usun_zadanie' | 'utworz_wizyte' | 'utworz_skierowanie' | 'utworz_recepte' | 'dodaj_wpis_terapii'
  brakujacePola: ('tytul' | 'data' | 'godzina' | 'encja' | 'cel' | 'pozycje' | 'terapia')[]
  zebrane: {
    tytul?: string
    data?: string
    godzina?: string
    okreslenieCzasu?: string
    fraza?: string
    termin?: string
    kandydaci?: { typ: string; id: string; etykieta?: string }[]
    rodzaj?: string
    kod?: string
    tresc?: string
  }
  propozycja?: { opis: string; pochodzenie: 'fakt' | 'preferencja' | 'wartosc_wyliczona' | 'zalozenie' | 'sugestia' }
}

export interface AktualizacjaKontekstuEcho {
  intencjaSemantyczna?: IntencjaSemantycznaEcho
  temat?: string
  ostatniaIntencja?: string
  oczekujacaAkcja?: { intencja: string; dane: unknown } | null
  oczekujaceDoprecyzowanie?: OczekujaceDoprecyzowanieEcho | null
  wartosciDomyslne?: WartoscDomyslnaEcho[]
}

export interface MigawkaKontekstuEcho {
  intencjaSemantyczna?: IntencjaSemantycznaEcho
  historiaIntencji?: IntencjaSemantycznaEcho[]
  tury: TuraRozmowyEcho[]
  streszczenie?: string
  temat?: string
  ostatnieEncje: { typ: string; id: string; etykieta?: string }[]
  ostatnieWynikiNarzedzi: WynikNarzedziaEcho[]
  ostatniaAkcja?: { narzedzie: string; argumenty: unknown }
  ostatniaIntencja?: string
  oczekujacaAkcja?: { intencja: string; dane: unknown }
  oczekujaceDoprecyzowanie?: OczekujaceDoprecyzowanieEcho
  wartosciDomyslne: WartoscDomyslnaEcho[]
  nierozwiazanePytanie?: string
  odniesieniaCzasowe: string[]
  planWykonania?: PlanWykonaniaEcho
}

export interface DefinicjaNarzedziaEcho {
  rodzaj?: 'odczyt' | 'zapis'
  nazwa: string
  opis: string
  schematArgumentow: unknown
  ryzyko: RyzykoDzialania
}

export interface WywolanieNarzedziaEcho {
  id: string
  nazwa: string
  argumenty: unknown
  zaleznosci?: string[]
}

export interface KrokPlanuWykonaniaEcho {
  id: string
  kolejnosc: number
  narzedzie: string
  opis: string
  parametry: unknown
  zaleznosci: string[]
  ryzyko: RyzykoDzialania
  wymagaPotwierdzenia: boolean
  status: 'oczekuje' | 'wykonany' | 'blad' | 'pominiety'
  komunikat?: string
}

export interface PlanWykonaniaEcho {
  id: string
  cel: string
  utworzonoAt: string
  status: 'oczekuje' | 'w_trakcie' | 'wykonany' | 'czesciowo_wykonany'
  kroki: KrokPlanuWykonaniaEcho[]
}

export type DecyzjaModeluEcho =
  | { typ: 'odpowiedz'; tresc: string; aktualizacjaKontekstu?: AktualizacjaKontekstuEcho; wartosciDomyslne?: WartoscDomyslnaEcho[] }
  | { typ: 'pytanie'; tresc: string; aktualizacjaKontekstu?: AktualizacjaKontekstuEcho; wartosciDomyslne?: WartoscDomyslnaEcho[] }
  | { typ: 'narzedzia'; wywolania: WywolanieNarzedziaEcho[]; aktualizacjaKontekstu?: AktualizacjaKontekstuEcho }

export interface ZadanieModeluEcho {
  wynikiBiezacejTury?: WynikNarzedziaEcho[]
  instrukcjeSystemowe: string[]
  trybRozmowy: TrybRozmowyEcho
  kontekstCzasu: KontekstCzasuEcho
  kontekstRozmowy: MigawkaKontekstuEcho
  pamiecPreferencji: KandydatPamieciEcho[]
  kontekstPlanowania?: KontekstPlanowaniaEcho
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
  plan?: PlanWykonaniaEcho
}

export interface OdpowiedzEcho {
  tekst: string
  ryzyko: RyzykoDzialania
  tryb: TrybEcho
  wymagaPotwierdzenia?: boolean
  akcjaDoPotwierdzenia?: AkcjaDoPotwierdzeniaEcho
  oczekujeDoprecyzowania?: boolean
  wartosciDomyslne?: WartoscDomyslnaEcho[]
  wyniki?: WynikNarzedziaEcho[]
}

export interface IntencjaSemantycznaEcho {
  typ: string
  pewnosc: number
  wartosci: { pole: string; wartosc: string; zrodlo: 'wypowiedz' | 'kontekst' | 'dane' | 'propozycja' }[]
  encje: { typ: string; id?: string; etykieta: string }[]
  brakujacePola: string[]
  konflikty: string[]
  korekta: boolean
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
