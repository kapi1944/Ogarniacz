import type {
  DostepnoscPlanistyczna,
  UstawieniaHarmonogramu,
  WyjatekGrafiku,
} from '../../domain/typy'

export interface ZakresAktywnegoDnia {
  od: string
  do: string
}

export interface ZakresSnuDnia {
  od: string
  do: string
}

export interface PrzedzialHarmonogramuDnia {
  id: 'dojazd-do-pracy' | 'praca' | 'powrot'
  etykieta: string
  od: string
  do: string
  dostepnosc?: DostepnoscPlanistyczna
}

export interface HarmonogramDnia {
  data: string
  pracuje: boolean
  odPracy: string
  doPracy: string
  dojazdDoPracyMinuty: number
  powrotZPracyMinuty: number
  dostepnoscDojazdu: DostepnoscPlanistyczna
  zakresAktywny: ZakresAktywnegoDnia
  przedzialy: PrzedzialHarmonogramuDnia[]
  jestWyjatkiem: boolean
}

export interface EdycjaHarmonogramuDnia {
  pracuje: boolean
  odPracy: string
  doPracy: string
  dojazdDoPracyMinuty: number
  powrotZPracyMinuty: number
  dostepnoscDojazdu: DostepnoscPlanistyczna
  opis?: string
}

export const DOMYSLNY_ZAKRES_SNU: ZakresSnuDnia = {
  od: '22:30',
  do: '06:30',
}

export const SKALA_SNU = 0.5

const MINUTY_OSTATNIEJ_GODZINY = 23 * 60 + 59
const ZAKRES_DNIA_BEZ_PRACY: ZakresAktywnegoDnia = { od: '07:00', do: '22:00' }

function poprawnaGodzina(godzina: string | undefined): godzina is string {
  return typeof godzina === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(godzina)
}

function ograniczMinuty(wartosc: number): number {
  return Number.isFinite(wartosc) ? Math.min(180, Math.max(0, Math.round(wartosc))) : 0
}

export function minutyDnia(godzina: string): number {
  const dopasowanie = /^(\d{2}):(\d{2})$/.exec(godzina)
  if (!dopasowanie) return 0
  return Math.min(MINUTY_OSTATNIEJ_GODZINY, Math.max(0, Number(dopasowanie[1]) * 60 + Number(dopasowanie[2])))
}

function godzinaZMinut(minuty: number): string {
  const bezpieczneMinuty = Math.min(MINUTY_OSTATNIEJ_GODZINY, Math.max(0, Math.round(minuty)))
  return `${String(Math.floor(bezpieczneMinuty / 60)).padStart(2, '0')}:${String(bezpieczneMinuty % 60).padStart(2, '0')}`
}

function dzienTygodnia(data: string): number {
  return new Date(`${data}T12:00:00`).getDay()
}

function czyMinutaNalezyDoSnu(
  minuta: number,
  poczatekSnu: number,
  koniecSnu: number,
): boolean {
  if (poczatekSnu === koniecSnu) return false

  if (poczatekSnu < koniecSnu) {
    return minuta >= poczatekSnu && minuta < koniecSnu
  }

  return minuta >= poczatekSnu || minuta < koniecSnu
}

function wagaOdPoczatkuDoby(
  doMinuty: number,
  zakresSnu: ZakresSnuDnia,
): number {
  const limit = Math.min(MINUTY_OSTATNIEJ_GODZINY, Math.max(0, Math.round(doMinuty)))
  const poczatekSnu = minutyDnia(zakresSnu.od)
  const koniecSnu = minutyDnia(zakresSnu.do)

  let waga = 0

  for (let minuta = 0; minuta < limit; minuta += 1) {
    waga += czyMinutaNalezyDoSnu(minuta, poczatekSnu, koniecSnu)
      ? SKALA_SNU
      : 1
  }

  return waga
}

/**
 * Główne mapowanie osi Pulpitu.
 *
 * Cała doba 00:00–23:59 jest zachowana. Wyłącznie minuty należące
 * do zaplanowanego snu mają wagę 0.5. Pozostały czas ma wagę 1.0.
 *
 * Obsługiwany jest również zakres przechodzący przez północ,
 * np. 22:30–06:30 albo 23:30–07:00.
 */
export function pozycjaGodzinyNaOsiZeSnem(
  godzina: string,
  zakresSnu: ZakresSnuDnia = DOMYSLNY_ZAKRES_SNU,
): number {
  const minuta = minutyDnia(godzina)

  if (minuta <= 0) return 0
  if (minuta >= MINUTY_OSTATNIEJ_GODZINY) return 100

  const calosc = wagaOdPoczatkuDoby(MINUTY_OSTATNIEJ_GODZINY, zakresSnu)
  const pozycja = wagaOdPoczatkuDoby(minuta, zakresSnu)

  return calosc > 0
    ? Math.min(100, Math.max(0, pozycja / calosc * 100))
    : 0
}

/**
 * Zachowane dla kompatybilności istniejących testów i ewentualnych
 * pozostałych widoków. Oś Pulpitu korzysta z pozycjaGodzinyNaOsiZeSnem().
 */
export function pozycjaGodzinyNaOsi(
  godzina: string,
  zakres: ZakresAktywnegoDnia,
): number {
  const SKALA_CZASU_POZA_AKTYWNYM_DNIEM = 0.5
  const minuta = minutyDnia(godzina)
  const poczatek = minutyDnia(zakres.od)
  const koniec = Math.max(poczatek, minutyDnia(zakres.do))
  const przed = poczatek * SKALA_CZASU_POZA_AKTYWNYM_DNIEM
  const aktywne = koniec - poczatek
  const po = (MINUTY_OSTATNIEJ_GODZINY - koniec) * SKALA_CZASU_POZA_AKTYWNYM_DNIEM
  const calosc = przed + aktywne + po
  const pozycja = minuta <= poczatek
    ? minuta * SKALA_CZASU_POZA_AKTYWNYM_DNIEM
    : minuta <= koniec
      ? przed + minuta - poczatek
      : przed + aktywne + (minuta - koniec) * SKALA_CZASU_POZA_AKTYWNYM_DNIEM

  return calosc > 0
    ? Math.min(100, Math.max(0, pozycja / calosc * 100))
    : 0
}

export function utworzHarmonogramDnia(
  data: string,
  ustawienia: UstawieniaHarmonogramu,
  wyjatek?: WyjatekGrafiku,
): HarmonogramDnia {
  const pracuje = wyjatek?.pracuje ?? ustawienia.dniPracy.includes(dzienTygodnia(data))
  const odPracy = poprawnaGodzina(wyjatek?.od) ? wyjatek.od : ustawienia.godzinaRozpoczecia
  const doPracy = poprawnaGodzina(wyjatek?.do) ? wyjatek.do : ustawienia.godzinaZakonczenia
  const dojazdDoPracyMinuty = ograniczMinuty(wyjatek?.dojazdDoPracyMinuty ?? ustawienia.dojazdDoPracyMinuty)
  const powrotZPracyMinuty = ograniczMinuty(wyjatek?.powrotZPracyMinuty ?? ustawienia.powrotZPracyMinuty)
  const dostepnoscDojazdu = wyjatek?.dostepnoscDojazdu ?? ustawienia.dostepnoscDojazdu
  const poczatekDojazdu = godzinaZMinut(minutyDnia(odPracy) - dojazdDoPracyMinuty)
  const koniecPowrotu = godzinaZMinut(minutyDnia(doPracy) + powrotZPracyMinuty)
  const przedzialy: PrzedzialHarmonogramuDnia[] = pracuje
    ? [
        ...(dojazdDoPracyMinuty > 0
          ? [{
              id: 'dojazd-do-pracy' as const,
              etykieta: 'Dojazd',
              od: poczatekDojazdu,
              do: odPracy,
              dostepnosc: dostepnoscDojazdu,
            }]
          : []),
        { id: 'praca', etykieta: 'Praca', od: odPracy, do: doPracy },
        ...(powrotZPracyMinuty > 0
          ? [{
              id: 'powrot' as const,
              etykieta: 'Powrót',
              od: doPracy,
              do: koniecPowrotu,
              dostepnosc: dostepnoscDojazdu,
            }]
          : []),
      ]
    : []

  return {
    data,
    pracuje,
    odPracy,
    doPracy,
    dojazdDoPracyMinuty,
    powrotZPracyMinuty,
    dostepnoscDojazdu,
    zakresAktywny: pracuje
      ? { od: poczatekDojazdu, do: koniecPowrotu }
      : ZAKRES_DNIA_BEZ_PRACY,
    przedzialy,
    jestWyjatkiem: Boolean(wyjatek),
  }
}

export function utworzNowaReguleHarmonogramu(
  ustawienia: UstawieniaHarmonogramu,
  data: string,
  edycja: EdycjaHarmonogramuDnia,
): UstawieniaHarmonogramu {
  const wybranyDzien = dzienTygodnia(data)
  const dniPracy = edycja.pracuje
    ? [...new Set([...ustawienia.dniPracy, wybranyDzien])].sort()
    : ustawienia.dniPracy.filter((dzien) => dzien !== wybranyDzien)

  return {
    ...ustawienia,
    dniPracy,
    godzinaRozpoczecia: edycja.odPracy,
    godzinaZakonczenia: edycja.doPracy,
    dojazdDoPracyMinuty: ograniczMinuty(edycja.dojazdDoPracyMinuty),
    powrotZPracyMinuty: ograniczMinuty(edycja.powrotZPracyMinuty),
    dostepnoscDojazdu: edycja.dostepnoscDojazdu,
  }
}
