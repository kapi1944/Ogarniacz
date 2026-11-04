import type { KonfiguracjaKokpitu, TrybKokpitu } from '../domain/kokpit'
import type { Urlop, UstawieniaHarmonogramu, WyjatekGrafiku } from '../domain/typy'
import { dzisiajIso } from '../domain/fabryki'
import { utworzHarmonogramDnia } from '../modules/pulpit/logikaOsiCzasu'

type Regula = KonfiguracjaKokpitu['harmonogram'][number]
export type NadpisanieKokpitu = { tryb: TrybKokpitu; do?: number; regula?: string }

export function poprzedniDzien(teraz: Date) {
  const wczoraj = new Date(teraz)
  wczoraj.setDate(wczoraj.getDate() - 1)
  return wczoraj
}

function godzinaDnia(teraz: Date) {
  return `${String(teraz.getHours()).padStart(2, '0')}:${String(teraz.getMinutes()).padStart(2, '0')}`
}

function pasujePrzedzial(teraz: Date, od: string, doGodziny: string, dzis: boolean, wczoraj: boolean) {
  const godzina = godzinaDnia(teraz)
  if (od === doGodziny) return false
  return od < doGodziny ? dzis && od <= godzina && godzina < doGodziny
    : (dzis && godzina >= od) || (wczoraj && godzina < doGodziny)
}

export function czyTrwaPracaKokpitu(teraz: Date, ustawienia: UstawieniaHarmonogramu, wyjatki: WyjatekGrafiku[], urlopy: Urlop[]) {
  const rozklad = (dzien: Date) => {
    const data = dzisiajIso(dzien)
    return utworzHarmonogramDnia(data, ustawienia, wyjatki.find((wyjatek) => wyjatek.data === data), urlopy)
  }
  const dzis = rozklad(teraz)
  const wczoraj = rozklad(poprzedniDzien(teraz))
  return (dzis.pracuje && pasujePrzedzial(teraz, dzis.odPracy, dzis.doPracy, true, false))
    || (wczoraj.pracuje && pasujePrzedzial(teraz, wczoraj.odPracy, wczoraj.doPracy, false, true))
}

export function regulaPrywatnosci(teraz: Date, reguly: Regula[], praca: boolean) {
  if (praca) return { id: 'praca', tryb: 'prywatny' as const }
  // Pierwszy pasujący wpis ma pierwszeństwo.
  const aktywna = reguly.find(({ dni, od, do: koniec }) =>
    pasujePrzedzial(teraz, od, koniec, dni.includes(teraz.getDay()), dni.includes((teraz.getDay() + 6) % 7)))
  return aktywna ?? { id: 'domyslny', tryb: 'publiczny' as const }
}

export function rozwiazPrywatnosc(teraz: Date, uwierzytelniony: boolean, regula: { id: string; tryb: TrybKokpitu }, nadpisanie?: NadpisanieKokpitu): TrybKokpitu {
  if (!uwierzytelniony) return 'publiczny'
  if (nadpisanie && (nadpisanie.do === undefined || teraz.getTime() < nadpisanie.do)
    && (nadpisanie.regula === undefined || nadpisanie.regula === regula.id)) return nadpisanie.tryb
  return regula.tryb
}
