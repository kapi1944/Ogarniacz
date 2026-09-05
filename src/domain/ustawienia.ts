import { utworzMetadane } from './fabryki'
import { DOMYSLNA_PERSONALIZACJA, normalizujPersonalizacje, zastosujPersonalizacje } from './personalizacja'
import type {
  DostepnoscPlanistyczna,
  GestoscInterfejsu,
  NazwaModulu,
  MotywAplikacji,
  Priorytet,
  TypSzybkiegoDodawania,
  KonfiguracjaKafelkaPulpitu,
  Ustawienia,
  ZakresZmianyHarmonogramu,
} from './typy'

export const WERSJA_USTAWIEN = 1 as const
export const DOMYSLNE_KAFELKI_PULPITU: KonfiguracjaKafelkaPulpitu[] = [
  ['pilne', 'large', '7d'], ['zadania', 'large', '7d'], ['wizyty', 'medium', '30d'], ['leki', 'medium', 'today'], ['finanse', 'medium', '30d'], ['samochod', 'medium', '30d'], ['zakupy', 'small', '7d'], ['poczekalnia', 'small', '7d'], ['notatki', 'small', '7d'],
].map(([typ, rozmiar, zakresCzasu], kolejnosc) => ({ id: `pulpit-${typ}`, typ: typ as KonfiguracjaKafelkaPulpitu['typ'], widoczny: true, kolejnosc, rozmiar: rozmiar as KonfiguracjaKafelkaPulpitu['rozmiar'], zakresCzasu: zakresCzasu as KonfiguracjaKafelkaPulpitu['zakresCzasu'], limit: 4 }))


const domyslneTypySzybkiegoDodawania: TypSzybkiegoDodawania[] = [
  'zadanie', 'notatka', 'wydarzenie', 'przypomnienie', 'wizyta', 'lek', 'wydatek', 'samochod',
]

export const DOMYSLNE_USTAWIENIA: Ustawienia = {
  ...utworzMetadane('glowne'),
  wersja: WERSJA_USTAWIEN,
  wyglad: {
    motyw: 'systemowy',
    gestosc: 'komfortowa',
    promienKart: 12,
    promienPol: 7,
    czasAnimacjiMs: 180,
    personalizacja: DOMYSLNA_PERSONALIZACJA,
  },
  nawigacja: {
    szerokoscMenu: 256,
    wysokoscPozycji: 36,
    menuDomyslnieZwiniete: false,
    przypiete: true,
    zachowanieNaMalymEkranie: 'nakladka',
  },
  pulpit: {
    pokazAlerty: true,
    pokazKafelki: true,
    pokazOsCzasu: true,
    pokazMiniatury: true,
    pokazWykonane: false,
    efektyAsap: true,
    limitAlertow: 4,
    kafelki: DOMYSLNE_KAFELKI_PULPITU,
  },
  harmonogram: {
    dniPracy: [1, 2, 3, 4, 5],
    godzinaRozpoczecia: '07:45',
    godzinaZakonczenia: '16:00',
    poczatekSnu: '22:30',
    koniecSnu: '06:30',
    skalaSnuNaOsi: 0.5,
    dojazdDoPracyMinuty: 40,
    powrotZPracyMinuty: 40,
    dostepnoscDojazdu: 'czesciowa',
    zezwalajNaPelnaDostepnoscDojazdu: true,
    domyslnyZakresZmiany: 'tylko_ten_dzien',
  },
  zadania: {
    domyslnyPriorytet: 'normalny',
    domyslnyTrybTerminu: 'bez_godziny',
    pokazPoWykonaniu: false,
  },
  szybkieDodawanie: {
    widoczneTypy: [...domyslneTypySzybkiegoDodawania],
    kolejnoscTypow: [...domyslneTypySzybkiegoDodawania],
    uczKolejnosci: true,
    parserWlaczony: true,
    licznikiUzyc: { zadanie: 0, notatka: 0, wydarzenie: 0, przypomnienie: 0, wizyta: 0, lek: 0, wydatek: 0, samochod: 0 },
  },
  dostepnosc: {
    ograniczRuch: false,
    wysokiKontrast: false,
    nieTylkoKolor: true,
  },
  powiadomienia: false,
  ukrywajSzczegolyZdrowotneWPowiadomieniach: false,
  proaktywnoscEcho: true,
  echoWyciszone: false,
  glosEcho: true,
  automatycznyOdczytEcho: false,
  pamiecPreferencjiEcho: true,
  internetEcho: false,
  modulyEcho: ['zadania', 'projekty', 'skrzynka', 'planer', 'nawyki', 'leki', 'wizyty', 'zdrowie', 'skierowania', 'przypomnienia', 'zakupy', 'rachunki', 'finanse', 'samochod', 'cele', 'notatki', 'pomysly', 'na_pozniej', 'kontakty', 'dokumenty', 'terminy', 'miasto', 'miejsca'],
  trybUzytkownika: 'wlasciciel',
}

type NieznanyRekord = Record<string, unknown>

function jakoRekord(wartosc: unknown): NieznanyRekord {
  return typeof wartosc === 'object' && wartosc !== null && !Array.isArray(wartosc)
    ? wartosc as NieznanyRekord
    : {}
}

function tekst(wartosc: unknown, domyslna: string): string {
  return typeof wartosc === 'string' && wartosc.length > 0 ? wartosc : domyslna
}

function opcjonalnyTekst(wartosc: unknown): string | undefined {
  return typeof wartosc === 'string' && wartosc.length > 0 ? wartosc : undefined
}

function logiczna(wartosc: unknown, domyslna: boolean): boolean {
  return typeof wartosc === 'boolean' ? wartosc : domyslna
}

function enumWartosci<T extends string>(wartosc: unknown, wartosci: readonly T[], domyslna: T): T {
  return typeof wartosc === 'string' && wartosci.includes(wartosc as T) ? wartosc as T : domyslna
}

function liczba(wartosc: unknown, minimum: number, maksimum: number, domyslna: number): number {
  if (typeof wartosc !== 'number' || !Number.isFinite(wartosc)) return domyslna
  return Math.min(maksimum, Math.max(minimum, Math.round(wartosc)))
}

function liczbaDziesietna(wartosc: unknown, minimum: number, maksimum: number, domyslna: number): number {
  if (typeof wartosc !== 'number' || !Number.isFinite(wartosc)) return domyslna
  return Math.min(maksimum, Math.max(minimum, wartosc))
}

function poprawnaGodzina(wartosc: unknown): wartosc is string {
  return typeof wartosc === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(wartosc)
}

function minutyDnia(godzina: string): number {
  const [godziny, minuty] = godzina.split(':').map(Number)
  return godziny * 60 + minuty
}

function dniPracy(wartosc: unknown): number[] {
  if (!Array.isArray(wartosc)) return [...DOMYSLNE_USTAWIENIA.harmonogram.dniPracy]
  const dni = [...new Set(wartosc.filter((dzien): dzien is number => Number.isInteger(dzien) && dzien >= 0 && dzien <= 6))].sort()
  return dni
}

function typySzybkiegoDodawania(wartosc: unknown, domyslne: TypSzybkiegoDodawania[]): TypSzybkiegoDodawania[] {
  const dozwolone = domyslneTypySzybkiegoDodawania
  if (!Array.isArray(wartosc)) return [...domyslne]
  const typy = [...new Set(wartosc.filter((typ): typ is TypSzybkiegoDodawania => typeof typ === 'string' && dozwolone.includes(typ as TypSzybkiegoDodawania)))]
  return typy.length > 0 ? typy : [...domyslne]
}

function modulyEcho(wartosc: unknown, domyslne: NazwaModulu[]): NazwaModulu[] {
  if (!Array.isArray(wartosc)) return [...domyslne]
  const dozwolone = new Set<NazwaModulu>(domyslne)
  return [...new Set(wartosc.filter((modul): modul is NazwaModulu => typeof modul === 'string' && dozwolone.has(modul as NazwaModulu)))]
}

function licznikiSzybkiegoDodawania(wartosc: unknown): Record<TypSzybkiegoDodawania, number> {
  const zrodlo = jakoRekord(wartosc)
  return Object.fromEntries(domyslneTypySzybkiegoDodawania.map((typ) => [typ, liczba(zrodlo[typ], 0, 1_000_000, 0)])) as Record<TypSzybkiegoDodawania, number>
}
function kafelkiPulpitu(wartosc: unknown): KonfiguracjaKafelkaPulpitu[] {
  const zrodlo = Array.isArray(wartosc) ? wartosc : []
  const wedlugTypu = new Map(zrodlo.map((element) => [jakoRekord(element).typ, jakoRekord(element)] as const))
  return DOMYSLNE_KAFELKI_PULPITU.map((domyslny, indeks) => {
    const rekord = wedlugTypu.get(domyslny.typ) ?? {}
    return {
      id: tekst(rekord.id, domyslny.id), typ: domyslny.typ,
      widoczny: logiczna(rekord.widoczny, domyslny.widoczny), kolejnosc: liczba(rekord.kolejnosc, 0, 99, indeks),
      rozmiar: enumWartosci(rekord.rozmiar, ['small', 'medium', 'large'], domyslny.rozmiar),
      zakresCzasu: enumWartosci(rekord.zakresCzasu, ['today', '3d', '7d', '30d', 'custom'], domyslny.zakresCzasu),
      limit: liczba(rekord.limit, 1, 10, domyslny.limit),
    }
  }).sort((a, b) => a.kolejnosc - b.kolejnosc || a.typ.localeCompare(b.typ, 'pl')).map((kafelek, kolejnosc) => ({ ...kafelek, kolejnosc }))
}

export function normalizujUstawienia(wartosc: unknown): Ustawienia {
  const zrodlo = jakoRekord(wartosc)
  const wyglad = jakoRekord(zrodlo.wyglad)
  const nawigacja = jakoRekord(zrodlo.nawigacja)
  const pulpit = jakoRekord(zrodlo.pulpit)
  const harmonogram = jakoRekord(zrodlo.harmonogram)
  const zadania = jakoRekord(zrodlo.zadania)
  const szybkieDodawanie = jakoRekord(zrodlo.szybkieDodawanie)
  const dostepnosc = jakoRekord(zrodlo.dostepnosc)
  const domyslne = DOMYSLNE_USTAWIENIA

  let godzinaRozpoczecia = poprawnaGodzina(harmonogram.godzinaRozpoczecia)
    ? harmonogram.godzinaRozpoczecia
    : domyslne.harmonogram.godzinaRozpoczecia
  let godzinaZakonczenia = poprawnaGodzina(harmonogram.godzinaZakonczenia)
    ? harmonogram.godzinaZakonczenia
    : domyslne.harmonogram.godzinaZakonczenia
  if (minutyDnia(godzinaRozpoczecia) >= minutyDnia(godzinaZakonczenia)) {
    godzinaRozpoczecia = domyslne.harmonogram.godzinaRozpoczecia
    godzinaZakonczenia = domyslne.harmonogram.godzinaZakonczenia
  }

  let poczatekSnu = poprawnaGodzina(harmonogram.poczatekSnu)
    ? harmonogram.poczatekSnu
    : domyslne.harmonogram.poczatekSnu
  let koniecSnu = poprawnaGodzina(harmonogram.koniecSnu)
    ? harmonogram.koniecSnu
    : domyslne.harmonogram.koniecSnu
  if (poczatekSnu === koniecSnu) {
    poczatekSnu = domyslne.harmonogram.poczatekSnu
    koniecSnu = domyslne.harmonogram.koniecSnu
  }

  const staryMotyw = zrodlo.motyw

  return {
    id: tekst(zrodlo.id, domyslne.id),
    createdAt: tekst(zrodlo.createdAt, domyslne.createdAt),
    updatedAt: tekst(zrodlo.updatedAt, domyslne.updatedAt),
    ...(opcjonalnyTekst(zrodlo.usunietoAt) ? { usunietoAt: opcjonalnyTekst(zrodlo.usunietoAt) } : {}),
    wersja: WERSJA_USTAWIEN,
    wyglad: {
      motyw: enumWartosci<MotywAplikacji>(wyglad.motyw ?? staryMotyw, ['jasny', 'ciemny', 'systemowy'], domyslne.wyglad.motyw),
      gestosc: enumWartosci<GestoscInterfejsu>(wyglad.gestosc, ['komfortowa', 'zwarta'], domyslne.wyglad.gestosc),
      promienKart: liczba(wyglad.promienKart, 0, 24, domyslne.wyglad.promienKart),
      promienPol: liczba(wyglad.promienPol, 0, 16, domyslne.wyglad.promienPol),
      czasAnimacjiMs: liczba(wyglad.czasAnimacjiMs, 0, 600, domyslne.wyglad.czasAnimacjiMs),
      personalizacja: normalizujPersonalizacje(wyglad.personalizacja),
    },
    nawigacja: {
      szerokoscMenu: liczba(nawigacja.szerokoscMenu, 220, 360, domyslne.nawigacja.szerokoscMenu),
      wysokoscPozycji: liczba(nawigacja.wysokoscPozycji, 32, 52, domyslne.nawigacja.wysokoscPozycji),
      menuDomyslnieZwiniete: logiczna(nawigacja.menuDomyslnieZwiniete, domyslne.nawigacja.menuDomyslnieZwiniete),
      przypiete: logiczna(nawigacja.przypiete, domyslne.nawigacja.przypiete),
      zachowanieNaMalymEkranie: enumWartosci(nawigacja.zachowanieNaMalymEkranie, ['nakladka', 'stale'], domyslne.nawigacja.zachowanieNaMalymEkranie),
    },
    pulpit: {
      pokazAlerty: logiczna(pulpit.pokazAlerty, domyslne.pulpit.pokazAlerty),
      pokazKafelki: logiczna(pulpit.pokazKafelki, domyslne.pulpit.pokazKafelki),
      pokazOsCzasu: logiczna(pulpit.pokazOsCzasu, domyslne.pulpit.pokazOsCzasu),
      pokazMiniatury: logiczna(pulpit.pokazMiniatury, domyslne.pulpit.pokazMiniatury),
      pokazWykonane: logiczna(pulpit.pokazWykonane, domyslne.pulpit.pokazWykonane),
      efektyAsap: logiczna(pulpit.efektyAsap, domyslne.pulpit.efektyAsap),
      limitAlertow: liczba(pulpit.limitAlertow, 3, 5, domyslne.pulpit.limitAlertow),
      kafelki: kafelkiPulpitu(pulpit.kafelki),
    },
    harmonogram: {
      dniPracy: dniPracy(harmonogram.dniPracy),
      godzinaRozpoczecia,
      godzinaZakonczenia,
      poczatekSnu,
      koniecSnu,
      skalaSnuNaOsi: liczbaDziesietna(harmonogram.skalaSnuNaOsi, 0.1, 1, domyslne.harmonogram.skalaSnuNaOsi),
      dojazdDoPracyMinuty: liczba(harmonogram.dojazdDoPracyMinuty, 0, 180, domyslne.harmonogram.dojazdDoPracyMinuty),
      powrotZPracyMinuty: liczba(harmonogram.powrotZPracyMinuty, 0, 180, domyslne.harmonogram.powrotZPracyMinuty),
      dostepnoscDojazdu: enumWartosci<DostepnoscPlanistyczna>(harmonogram.dostepnoscDojazdu, ['czesciowa', 'pelna'], domyslne.harmonogram.dostepnoscDojazdu),
      zezwalajNaPelnaDostepnoscDojazdu: logiczna(harmonogram.zezwalajNaPelnaDostepnoscDojazdu, domyslne.harmonogram.zezwalajNaPelnaDostepnoscDojazdu),
      domyslnyZakresZmiany: enumWartosci<ZakresZmianyHarmonogramu>(harmonogram.domyslnyZakresZmiany, ['tylko_ten_dzien', 'nowa_regula'], domyslne.harmonogram.domyslnyZakresZmiany),
    },
    zadania: {
      domyslnyPriorytet: enumWartosci<Priorytet>(zadania.domyslnyPriorytet, ['niski', 'normalny', 'wysoki', 'krytyczny'], domyslne.zadania.domyslnyPriorytet),
      domyslnyTrybTerminu: enumWartosci(zadania.domyslnyTrybTerminu, ['o_godzinie', 'koniec_dnia', 'bez_godziny'], domyslne.zadania.domyslnyTrybTerminu),
      pokazPoWykonaniu: logiczna(zadania.pokazPoWykonaniu, domyslne.zadania.pokazPoWykonaniu),
    },
    szybkieDodawanie: {
      widoczneTypy: typySzybkiegoDodawania(szybkieDodawanie.widoczneTypy, domyslne.szybkieDodawanie.widoczneTypy),
      kolejnoscTypow: typySzybkiegoDodawania(szybkieDodawanie.kolejnoscTypow, domyslne.szybkieDodawanie.kolejnoscTypow),
      uczKolejnosci: logiczna(szybkieDodawanie.uczKolejnosci, domyslne.szybkieDodawanie.uczKolejnosci),
      parserWlaczony: logiczna(szybkieDodawanie.parserWlaczony, domyslne.szybkieDodawanie.parserWlaczony),
      licznikiUzyc: licznikiSzybkiegoDodawania(szybkieDodawanie.licznikiUzyc),
    },
    dostepnosc: {
      ograniczRuch: logiczna(dostepnosc.ograniczRuch, domyslne.dostepnosc.ograniczRuch),
      wysokiKontrast: logiczna(dostepnosc.wysokiKontrast, domyslne.dostepnosc.wysokiKontrast),
      nieTylkoKolor: logiczna(dostepnosc.nieTylkoKolor, domyslne.dostepnosc.nieTylkoKolor),
    },
    powiadomienia: logiczna(zrodlo.powiadomienia, domyslne.powiadomienia),
    ukrywajSzczegolyZdrowotneWPowiadomieniach: logiczna(zrodlo.ukrywajSzczegolyZdrowotneWPowiadomieniach, domyslne.ukrywajSzczegolyZdrowotneWPowiadomieniach),
    proaktywnoscEcho: logiczna(zrodlo.proaktywnoscEcho, domyslne.proaktywnoscEcho),
    echoWyciszone: logiczna(zrodlo.echoWyciszone, domyslne.echoWyciszone),
    glosEcho: logiczna(zrodlo.glosEcho, domyslne.glosEcho),
    automatycznyOdczytEcho: logiczna(zrodlo.automatycznyOdczytEcho, domyslne.automatycznyOdczytEcho),
    pamiecPreferencjiEcho: logiczna(zrodlo.pamiecPreferencjiEcho, domyslne.pamiecPreferencjiEcho),
    internetEcho: logiczna(zrodlo.internetEcho, domyslne.internetEcho),
    modulyEcho: modulyEcho(zrodlo.modulyEcho, domyslne.modulyEcho),
    trybUzytkownika: enumWartosci(zrodlo.trybUzytkownika, ['wlasciciel', 'edytor'], domyslne.trybUzytkownika),
    ...(opcjonalnyTekst(zrodlo.aktywnyEdytorId) ? { aktywnyEdytorId: opcjonalnyTekst(zrodlo.aktywnyEdytorId) } : {}),
  }
}

export function zastosujUstawieniaInterfejsu(
  ustawienia: Ustawienia,
  ciemnyMotywSystemowy: boolean,
  ograniczRuchSystemowo = false,
): void {
  const korzen = document.documentElement
  const motyw = ustawienia.wyglad.motyw === 'systemowy'
    ? (ciemnyMotywSystemowy ? 'ciemny' : 'jasny')
    : ustawienia.wyglad.motyw
  korzen.dataset.motyw = motyw
  korzen.dataset.gestosc = ustawienia.wyglad.gestosc
  korzen.dataset.kontrast = ustawienia.dostepnosc.wysokiKontrast ? 'wysoki' : 'standardowy'
  korzen.style.setProperty('--promien-karty', `${ustawienia.wyglad.promienKart}px`)
  korzen.style.setProperty('--promien-pola', `${ustawienia.wyglad.promienPol}px`)
  korzen.style.setProperty('--gestosc', ustawienia.wyglad.gestosc === 'zwarta' ? '0.82' : '1')
  korzen.style.setProperty('--czas-animacji', `${ustawienia.dostepnosc.ograniczRuch ? 0 : ustawienia.wyglad.czasAnimacjiMs}ms`)
  korzen.style.setProperty('--szerokosc-menu', `${ustawienia.nawigacja.szerokoscMenu}px`)
  korzen.style.setProperty('--wysokosc-pozycji-menu', `${ustawienia.nawigacja.wysokoscPozycji}px`)
  zastosujPersonalizacje(
    ustawienia.wyglad.personalizacja,
    korzen,
    ustawienia.dostepnosc.ograniczRuch || ograniczRuchSystemowo,
  )
}
