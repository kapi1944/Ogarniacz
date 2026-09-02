import type { PersonalizacjaUI } from './personalizacja'

export type Id = string

export interface EncjaBazowa {
  id: Id
  createdAt: string
  updatedAt: string
  usunietoAt?: string
}

export type Priorytet = 'niski' | 'normalny' | 'wysoki' | 'krytyczny'
export type StatusAktywnosci = 'aktywne' | 'wstrzymane' | 'zakonczone'

export interface PowiazanieEncji {
  typ: NazwaModulu
  id: Id
}

export interface RegulaPowtarzania {
  typ: 'brak' | 'codziennie' | 'co_x_dni' | 'tygodniowo' | 'dni_tygodnia' | 'miesiecznie' | 'rocznie'
  coIle?: number
  dniTygodnia?: number[]
  dataStartu?: string
}

export interface Zadanie extends EncjaBazowa {
  tytul: string
  opis: string
  status: 'otwarte' | 'w_toku' | 'wykonane'
  priorytet: Priorytet
  termin?: string
  dataStartu?: string
  szacowanyCzasMin?: number
  projektId?: Id
  kontekst?: string
  tagi: string[]
  podzadania: { id: Id; tytul: string; wykonane: boolean }[]
  powtarzanie?: RegulaPowtarzania
  powiazania: PowiazanieEncji[]
  wykonanoAt?: string
  dataElementu?: string
  godzinaElementu?: string
  terminGranicznyElementu?: string
  trybTerminuElementu?: 'o_godzinie' | 'koniec_dnia' | 'bez_godziny'
  statusElementu?: 'otwarty' | 'wykonany' | 'anulowany' | 'pominiety'
  przypomnieniaElementu?: { id: Id; czas?: string; przesuniecieMinuty?: number }[]
  dostepnoscPlanistyczna?: DostepnoscPlanistyczna
  pokazNaPulpicie?: boolean
  zasobyIds?: Id[]

  deadlineMode?: 'AT_TIME' | 'END_OF_DAY' | 'NO_TIME'
  time?: string
}

export interface Projekt extends EncjaBazowa {
  nazwa: string
  opis: string
  status: StatusAktywnosci
  nastepneDzialanie?: string
  blokady: string
  dataStartu?: string
  termin?: string
}

export interface ElementSkrzynki extends EncjaBazowa {
  tresc: string
  zrodlo: 'tekst' | 'glos'
  sugerowanyTyp?: NazwaModulu
  status: 'nowe' | 'przetworzone'
  przeksztalconoNa?: PowiazanieEncji
}

export interface BlokCzasu extends EncjaBazowa {
  tytul: string
  poczatek: string
  koniec: string
  typ: 'praca' | 'zadanie' | 'wizyta' | 'nawyk' | 'przerwa' | 'wolne' | 'inne'
  powiazanie?: PowiazanieEncji
  elastycznosc: 'twardy' | 'elastyczny'
  status: 'propozycja' | 'zaakceptowany' | 'wykonany' | 'odrzucony'
}

export interface GrafikPracy extends EncjaBazowa {
  dzienTygodnia: number
  aktywny: boolean
  od: string
  do: string
}

export interface WyjatekGrafiku extends EncjaBazowa {
  data: string
  pracuje: boolean
  od?: string
  do?: string
  opis?: string
  dojazdDoPracyMinuty?: number
  powrotZPracyMinuty?: number
  dostepnoscDojazdu?: DostepnoscPlanistyczna
}


export type TypUrlopu =
  | 'wypoczynkowy'
  | 'na_zadanie'
  | 'bezplatny'
  | 'okolicznosciowy'
  | 'opieka'
  | 'chorobowe'
  | 'inny'

export type StatusUrlopu = 'planowany' | 'potwierdzony' | 'anulowany'

export interface Urlop extends EncjaBazowa {
  dataOd: string
  dataDo: string
  typ: TypUrlopu
  status: StatusUrlopu
  opis?: string
}

export interface Nawyk extends EncjaBazowa {
  nazwa: string
  czestotliwosc: 'codziennie' | 'dni_robocze' | 'wybrane_dni' | 'x_tygodniowo' | 'interwal'
  dniTygodnia: number[]
  razyWTygodniu?: number
  interwalDni?: number
  oknoOd?: string
  oknoDo?: string
  preferowanyCzas?: string
  minimalnaWersja?: string
  aktywny: boolean
}

export interface DziennikNawyku extends EncjaBazowa {
  nawykId: Id
  data: string
  status: 'pelna' | 'minimalna' | 'pominieta'
}

export interface Lek extends EncjaBazowa {
  nazwa: string
  dawkaInstrukcja: string
  godziny: string[]
  dodatkoweInstrukcje?: string
  aktywny: boolean
}

export interface DziennikLeku extends EncjaBazowa {
  lekId: Id
  data: string
  planowanaGodzina: string
  status: 'oczekuje' | 'zazyte' | 'odroczone' | 'pominiete'
  reakcjaAt?: string
  odroczoneDo?: string
}

export interface Wizyta extends EncjaBazowa {
  nazwa: string
  status: 'do_umowienia' | 'umowiona' | 'odbyta' | 'anulowana'
  data?: string
  godzina?: string
  terminGraniczny?: string
  miejsce?: string
  lekarzPlacowka?: string
  kontaktId?: Id
  notatka: string
  pytania: string[]
  dokumentyIds: Id[]
  checklista: string[]
}

export interface Przypomnienie extends EncjaBazowa {
  tytul: string
  zrodlo?: PowiazanieEncji
  typ: 'absolutne' | 'wzgledne' | 'cykliczne'
  czas?: string
  przesuniecieMin?: number
  powtarzanie?: RegulaPowtarzania
  priorytet: Priorytet
  stan: 'nowe' | 'dostarczone' | 'odroczone' | 'wykonane' | 'pominiete' | 'eskalowane'
  eskalacja: boolean
  odroczoneDo?: string
}

export interface ListaZakupow extends EncjaBazowa {
  nazwa: string
  sklep?: string
  lokalizacja?: string
  budzet?: number
  aktywna: boolean
  planowanaData?: string
  planowanaGodzina?: string
  priorytet?: 'normalny' | 'pilny' | 'asap'
}

export interface PozycjaZakupow extends EncjaBazowa {
  listaId: Id
  nazwa: string
  ilosc: string
  kategoria?: string
  kupione: boolean
}

export interface Rachunek extends EncjaBazowa {
  nazwa: string
  kwota: number
  termin: string
  status: 'niezaplacony' | 'zaplacony'
  powtarzanie?: RegulaPowtarzania
}

export interface PlatnoscRachunku extends EncjaBazowa {
  rachunekId: Id
  kwota: number
  zaplaconoAt: string
}

export interface Notatka extends EncjaBazowa {
  tytul: string
  tresc: string
  tagi: string[]
  powiazania: PowiazanieEncji[]
  data?: string
  godzina?: string
  przypieta?: boolean
  przypomnienieAt?: string
}

export interface Pomysl extends EncjaBazowa {
  tytul: string
  opis: string
  status: 'nowy' | 'rozwiniety' | 'zrealizowany'
}

export interface NaPozniej extends EncjaBazowa {
  tytul: string
  typ: 'przeczytac' | 'obejrzec' | 'sprawdzic' | 'kupic' | 'rozwazyc'
  adres?: string
  opis?: string
  status: 'oczekuje' | 'wykonane'
}

export interface Cel extends EncjaBazowa {
  nazwa: string
  opis: string
  status: StatusAktywnosci
  horyzont?: string
  projektyIds: Id[]
  nawykiIds: Id[]
  postep: number
}

export interface Kontakt extends EncjaBazowa {
  nazwa: string
  rola?: string
  telefon?: string
  email?: string
  adres?: string
  strona?: string
  notatki?: string
}

export interface Dokument extends EncjaBazowa {
  nazwa: string
  typ?: string
  nazwaPliku?: string
  mimeType?: string
  rozmiar?: number
  plik?: Blob
  terminWaznosci?: string
  powiazania: PowiazanieEncji[]
}

export interface Wydatek extends EncjaBazowa {
  kwota: number
  data: string
  kategoria: string
  opis: string
  powiazanie?: PowiazanieEncji
}

export interface Budzet extends EncjaBazowa {
  nazwa: string
  kategoria?: string
  okres: string
  limit: number
}

export interface Pojazd extends EncjaBazowa {
  nazwa: string
  przebieg?: number
  ocDo?: string
  przegladDo?: string
  wymianaOlejuDo?: string
  wymianaOlejuPrzebieg?: number
  planowanySerwisData?: string
  planowanySerwisGodzina?: string
  notatka?: string
}

export interface TerminWaznosci extends EncjaBazowa {
  nazwa: string
  typ: string
  dataWaznosci: string
  status: 'aktualne' | 'do_odnowienia' | 'odnowione'
  regulaOdnowienia?: RegulaPowtarzania
  dokumentId?: Id
}

export type RyzykoDzialania = 'niskie' | 'umiarkowane' | 'wysokie'

export interface PamiecEcho extends EncjaBazowa {
  tresc: string
  typ: 'fakt' | 'preferencja' | 'regula'
  zrodlo: string
  wrazliwosc: 'zwykla' | 'wrazliwa'
  sposob: 'zaproponowane' | 'reczne'
}

export interface ProfilEdytora extends EncjaBazowa {
  nazwa: string
  aktywny: boolean
}

export interface Uprawnienie extends EncjaBazowa {
  owner: 'wlasciciel'
  editorId: Id
  modul: NazwaModulu
  sekcja?: string
  odczyt: boolean
  edycja: boolean
  status: 'aktywne' | 'cofniete'
}

export interface DziennikEcho extends EncjaBazowa {
  opis: string
  dzialanie: string
  encja?: PowiazanieEncji
  ryzyko: RyzykoDzialania
  wymagaloPotwierdzenia: boolean
  wynik: 'wykonane' | 'odrzucone' | 'blad'
}

export type ModulHistorii = 'finanse' | 'leki' | 'wizyty' | 'samochod' | 'zadania'
export type OperacjaHistorii = 'utworzenie' | 'aktualizacja' | 'usuniecie'

export interface WpisHistoriiZmian extends EncjaBazowa {
  modul: ModulHistorii
  typEncji: string
  encjaId: Id
  operacja: OperacjaHistorii
  znacznikCzasu: string
  zmienionePola: string[]
  przed?: Record<string, unknown>
  po?: Record<string, unknown>
}

export type StatusSynchronizacji = 'zsynchronizowano' | 'synchronizacja' | 'oczekuje' | 'offline' | 'konflikt' | 'blad'

export interface StanSynchronizacji extends EncjaBazowa {
  stan: StatusSynchronizacji
  ostatniSync?: string
  ostatniBlad?: string
  liczbaKonfliktow: number
}

export interface KonfliktSynchronizacji extends EncjaBazowa {
  tabela: string
  rekordId: string
  lokalny: EncjaBazowa
  zdalny: EncjaBazowa
  wykrytoAt: string
}

export type MotywAplikacji = 'jasny' | 'ciemny' | 'systemowy'
export type GestoscInterfejsu = 'komfortowa' | 'zwarta'
export type DostepnoscPlanistyczna = 'czesciowa' | 'pelna'
export type ZakresZmianyHarmonogramu = 'tylko_ten_dzien' | 'nowa_regula'
export type TypSzybkiegoDodawania = 'zadanie' | 'notatka' | 'wydarzenie' | 'przypomnienie' | 'wizyta' | 'lek' | 'wydatek' | 'samochod'

export interface DaneSzybkiegoDodawania {
  typ?: TypSzybkiegoDodawania
  tresc?: string
  tytul?: string
}

export type TypKafelkaPulpitu = 'zadania' | 'pilne' | 'wizyty' | 'leki' | 'finanse' | 'samochod' | 'zakupy' | 'poczekalnia' | 'notatki'
export type RozmiarKafelkaPulpitu = 'small' | 'medium' | 'large'
export type ZakresCzasuKafelkaPulpitu = 'today' | '3d' | '7d' | '30d' | 'custom'

export interface KonfiguracjaKafelkaPulpitu {
  id: string
  typ: TypKafelkaPulpitu
  widoczny: boolean
  kolejnosc: number
  rozmiar: RozmiarKafelkaPulpitu
  zakresCzasu: ZakresCzasuKafelkaPulpitu
  limit: number
}
export interface UstawieniaWygladu {
  motyw: MotywAplikacji
  gestosc: GestoscInterfejsu
  promienKart: number
  promienPol: number
  czasAnimacjiMs: number
  personalizacja: PersonalizacjaUI
}

export interface UstawieniaNawigacji {
  szerokoscMenu: number
  wysokoscPozycji: number
  menuDomyslnieZwiniete: boolean
  przypiete: boolean
  zachowanieNaMalymEkranie: 'nakladka' | 'stale'
}

export interface UstawieniaPulpitu {
  pokazAlerty: boolean
  pokazKafelki: boolean
  pokazOsCzasu: boolean
  pokazMiniatury: boolean
  pokazWykonane: boolean
  efektyAsap: boolean
  limitAlertow: number
  kafelki: KonfiguracjaKafelkaPulpitu[]
}

export interface UstawieniaHarmonogramu {
  dniPracy: number[]
  godzinaRozpoczecia: string
  godzinaZakonczenia: string
  poczatekSnu: string
  koniecSnu: string
  skalaSnuNaOsi: number
  dojazdDoPracyMinuty: number
  powrotZPracyMinuty: number
  dostepnoscDojazdu: DostepnoscPlanistyczna
  zezwalajNaPelnaDostepnoscDojazdu: boolean
  domyslnyZakresZmiany: ZakresZmianyHarmonogramu
}

export interface UstawieniaZadan {
  domyslnyPriorytet: Priorytet
  domyslnyTrybTerminu: 'o_godzinie' | 'koniec_dnia' | 'bez_godziny'
  pokazPoWykonaniu: boolean
}

export interface UstawieniaSzybkiegoDodawania {
  widoczneTypy: TypSzybkiegoDodawania[]
  kolejnoscTypow: TypSzybkiegoDodawania[]
  uczKolejnosci: boolean
  parserWlaczony: boolean
  licznikiUzyc: Record<TypSzybkiegoDodawania, number>
}

export interface UstawieniaDostepnosci {
  ograniczRuch: boolean
  wysokiKontrast: boolean
  nieTylkoKolor: boolean
}

export interface Ustawienia extends EncjaBazowa {
  wersja: 1
  wyglad: UstawieniaWygladu
  nawigacja: UstawieniaNawigacji
  pulpit: UstawieniaPulpitu
  harmonogram: UstawieniaHarmonogramu
  zadania: UstawieniaZadan
  szybkieDodawanie: UstawieniaSzybkiegoDodawania
  dostepnosc: UstawieniaDostepnosci
  powiadomienia: boolean
  proaktywnoscEcho: boolean
  echoWyciszone: boolean
  trybUzytkownika: 'wlasciciel' | 'edytor'
  aktywnyEdytorId?: Id
}

export type NazwaModulu =
  | 'zadania'
  | 'projekty'
  | 'skrzynka'
  | 'planer'
  | 'grafik'
  | 'nawyki'
  | 'leki'
  | 'wizyty'
  | 'przypomnienia'
  | 'zakupy'
  | 'rachunki'
  | 'miasto'
  | 'cele'
  | 'notatki'
  | 'pomysly'
  | 'na_pozniej'
  | 'kontakty'
  | 'dokumenty'
  | 'finanse'
  | 'samochod'
  | 'terminy'
  | 'echo'
  | 'ustawienia'

export interface MapaTabel {
  zadania: Zadanie
  projekty: Projekt
  skrzynka: ElementSkrzynki
  blokiCzasu: BlokCzasu
  grafikPracy: GrafikPracy
  wyjatkiGrafiku: WyjatekGrafiku
  urlopy: Urlop
  nawyki: Nawyk
  dziennikNawykow: DziennikNawyku
  leki: Lek
  dziennikLekow: DziennikLeku
  wizyty: Wizyta
  przypomnienia: Przypomnienie
  listyZakupow: ListaZakupow
  pozycjeZakupow: PozycjaZakupow
  rachunki: Rachunek
  platnosciRachunkow: PlatnoscRachunku
  notatki: Notatka
  pomysly: Pomysl
  naPozniej: NaPozniej
  cele: Cel
  kontakty: Kontakt
  dokumenty: Dokument
  wydatki: Wydatek
  budzety: Budzet
  pojazdy: Pojazd
  terminyWaznosci: TerminWaznosci
  pamiecEcho: PamiecEcho
  uprawnienia: Uprawnienie
  edytorzy: ProfilEdytora
  dziennikEcho: DziennikEcho
  ustawienia: Ustawienia
  historiaZmian: WpisHistoriiZmian
  stanSynchronizacji: StanSynchronizacji
  konfliktySynchronizacji: KonfliktSynchronizacji
}

export type NazwaTabeli = keyof MapaTabel
