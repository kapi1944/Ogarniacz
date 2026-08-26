import { utworzMetadane } from './fabryki'
import { DOMYSLNA_PERSONALIZACJA, normalizujPersonalizacje, zastosujPersonalizacje } from './personalizacja'
import type {
  DostepnoscPlanistyczna,
  GestoscInterfejsu,
  MotywAplikacji,
  Priorytet,
  TypSzybkiegoDodawania,
  Ustawienia,
  ZakresZmianyHarmonogramu,
} from './typy'

export const WERSJA_USTAWIEN = 1 as const

const domyslneTypySzybkiegoDodawania: TypSzybkiegoDodawania[] = [
  'zadanie', 'notatka', 'wizyta', 'lek', 'wydatek', 'samochod',
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
  },
  harmonogram: {
    dniPracy: [1, 2, 3, 4, 5],
    godzinaRozpoczecia: '07:45',
    godzinaZakonczenia: '16:00',
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
  },
  dostepnosc: {
    ograniczRuch: false,
    wysokiKontrast: false,
    nieTylkoKolor: true,
  },
  powiadomienia: false,
  proaktywnoscEcho: true,
  echoWyciszone: false,
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
      limitAlertow: liczba(pulpit.limitAlertow, 1, 10, domyslne.pulpit.limitAlertow),
    },
    harmonogram: {
      dniPracy: dniPracy(harmonogram.dniPracy),
      godzinaRozpoczecia,
      godzinaZakonczenia,
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
    },
    dostepnosc: {
      ograniczRuch: logiczna(dostepnosc.ograniczRuch, domyslne.dostepnosc.ograniczRuch),
      wysokiKontrast: logiczna(dostepnosc.wysokiKontrast, domyslne.dostepnosc.wysokiKontrast),
      nieTylkoKolor: logiczna(dostepnosc.nieTylkoKolor, domyslne.dostepnosc.nieTylkoKolor),
    },
    powiadomienia: logiczna(zrodlo.powiadomienia, domyslne.powiadomienia),
    proaktywnoscEcho: logiczna(zrodlo.proaktywnoscEcho, domyslne.proaktywnoscEcho),
    echoWyciszone: logiczna(zrodlo.echoWyciszone, domyslne.echoWyciszone),
    trybUzytkownika: enumWartosci(zrodlo.trybUzytkownika, ['wlasciciel', 'edytor'], domyslne.trybUzytkownika),
    ...(opcjonalnyTekst(zrodlo.aktywnyEdytorId) ? { aktywnyEdytorId: opcjonalnyTekst(zrodlo.aktywnyEdytorId) } : {}),
  }
}

export function zastosujUstawieniaInterfejsu(ustawienia: Ustawienia, ciemnyMotywSystemowy: boolean): void {
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
  zastosujPersonalizacje(ustawienia.wyglad.personalizacja, korzen, ustawienia.dostepnosc.ograniczRuch)
}
