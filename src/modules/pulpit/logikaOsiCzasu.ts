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
  skala: number
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
  skala: 0.5,
}

const MINUTY_DOBY = 24 * 60
const OSTATNIA_MINUTA_DOBY = MINUTY_DOBY - 1
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
  const godziny = Number(dopasowanie[1])
  const minuty = Number(dopasowanie[2])
  if (godziny === 24 && minuty === 0) return MINUTY_DOBY
  if (godziny > 23 || minuty > 59) return 0
  return godziny * 60 + minuty
}

function godzinaZMinut(minuty: number): string {
  const bezpieczneMinuty = Math.min(OSTATNIA_MINUTA_DOBY, Math.max(0, Math.round(minuty)))
  return `${String(Math.floor(bezpieczneMinuty / 60)).padStart(2, '0')}:${String(bezpieczneMinuty % 60).padStart(2, '0')}`
}

function dzienTygodnia(data: string): number {
  return new Date(`${data}T12:00:00`).getDay()
}

function fragmentySnu(zakresSnu: ZakresSnuDnia): [number, number][] {
  const poczatekSnu = minutyDnia(zakresSnu.od)
  const koniecSnu = minutyDnia(zakresSnu.do)

  if (poczatekSnu === koniecSnu) return []
  if (poczatekSnu < koniecSnu) return [[poczatekSnu, koniecSnu]]
  return [[0, koniecSnu], [poczatekSnu, MINUTY_DOBY]]
}

function dlugoscPrzeciecia(
  od: number,
  doMinuty: number,
  odSnu: number,
  doSnu: number,
): number {
  return Math.max(0, Math.min(doMinuty, doSnu) - Math.max(od, odSnu))
}

function wagaZakresu(
  od: number,
  doMinuty: number,
  zakresSnu: ZakresSnuDnia,
): number {
  const bezpieczneOd = Math.min(MINUTY_DOBY, Math.max(0, od))
  const bezpieczneDo = Math.min(MINUTY_DOBY, Math.max(bezpieczneOd, doMinuty))
  const skalaSnu = Math.min(1, Math.max(0.1, zakresSnu.skala))
  const dlugosc = bezpieczneDo - bezpieczneOd
  const minutySnu = fragmentySnu(zakresSnu).reduce(
    (suma, [odSnu, doSnu]) => suma + dlugoscPrzeciecia(bezpieczneOd, bezpieczneDo, odSnu, doSnu),
    0,
  )

  return dlugosc - minutySnu + minutySnu * skalaSnu
}

/**
 * Główne mapowanie osi Pulpitu.
 *
 * Cała doba 00:00–24:00 jest zachowana. Wyłącznie minuty należące
 * do ustawionego snu mają zmniejszoną wagę. Pozostały czas ma wagę 1.0.
 *
 * Obsługiwany jest również zakres przechodzący przez północ,
 * np. 22:30–06:30 albo 23:30–07:00.
 */
export function pozycjaGodzinyNaOsi(
  godzina: string,
  zakresSnu: ZakresSnuDnia = DOMYSLNY_ZAKRES_SNU,
): number {
  const minuta = minutyDnia(godzina)

  if (minuta <= 0) return 0
  if (minuta >= MINUTY_DOBY) return 100

  const calosc = wagaZakresu(0, MINUTY_DOBY, zakresSnu)
  const pozycja = wagaZakresu(0, minuta, zakresSnu)

  return calosc > 0
    ? Math.min(100, Math.max(0, pozycja / calosc * 100))
    : 0
}

export function rozmiarZakresuNaOsi(
  od: string,
  doGodziny: string,
  zakresSnu: ZakresSnuDnia = DOMYSLNY_ZAKRES_SNU,
): number {
  const minutaOd = minutyDnia(od)
  const minutaDo = minutyDnia(doGodziny)
  const calosc = wagaZakresu(0, MINUTY_DOBY, zakresSnu)
  if (minutaOd === minutaDo || calosc <= 0) return 0

  const rozmiar = minutaDo > minutaOd
    ? wagaZakresu(minutaOd, minutaDo, zakresSnu)
    : wagaZakresu(minutaOd, MINUTY_DOBY, zakresSnu) + wagaZakresu(0, minutaDo, zakresSnu)

  return rozmiar / calosc * 100
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
