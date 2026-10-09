import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import type { UstawieniaHarmonogramu, Urlop, WyjatekGrafiku } from '../../domain/typy'
import { poprawnaGodzinaTerminu } from '../../domain/logikaTerminuZadania'
import { sortujElementyDzisiaj } from './logikaDniaPulpitu'
import { utworzHarmonogramDnia, type HarmonogramDnia } from './logikaOsiCzasu'

export interface DaneDnia {
  data: string
  harmonogram: HarmonogramDnia
  wyjatekDnia?: WyjatekGrafiku
  elementy: ElementOgarniacza[]
  elementyZGodzina: ElementOgarniacza[]
  elementyBezGodziny: ElementOgarniacza[]
  elementyOsi: ElementOgarniacza[]
  doZrobieniaBezGodziny: ElementOgarniacza[]
  najwazniejszeTerminy: ElementOgarniacza[]
  liczbaOtwartych: number
  liczbaWykonanych: number
  liczbaPilnych: number
  charakterDnia: 'roboczy' | 'wolny'
  zakresPracy?: { od: string; do: string }
}

export function utworzDaneDnia(data: string, elementyZakresu: readonly ElementOgarniacza[], ustawienia: UstawieniaHarmonogramu, wyjatki: readonly WyjatekGrafiku[], urlopy: Urlop[]): DaneDnia {
  const elementy = elementyZakresu.filter((element) => element.data === data)
  const wyjatekDnia = wyjatki.filter((wyjatek) => wyjatek.data === data).sort((pierwszy, drugi) => drugi.updatedAt.localeCompare(pierwszy.updatedAt))[0]
  const harmonogram = utworzHarmonogramDnia(data, ustawienia, wyjatekDnia, urlopy)
  const elementyZGodzina = elementy.filter((element) => element.trybTerminu === 'o_godzinie' && poprawnaGodzinaTerminu(element.godzina))
    .sort((pierwszy, drugi) => (pierwszy.godzina ?? '').localeCompare(drugi.godzina ?? '') || pierwszy.typ.localeCompare(drugi.typ, 'pl') || pierwszy.tytul.localeCompare(drugi.tytul, 'pl') || pierwszy.id.localeCompare(drugi.id))
  const elementyBezGodziny = elementy.filter((element) => !elementyZGodzina.includes(element))
  const otwarte = elementy.filter((element) => element.status === undefined || element.status === 'otwarty')
  return {
    data, harmonogram, wyjatekDnia, elementy, elementyZGodzina, elementyBezGodziny,
    elementyOsi: elementyZGodzina.filter((element) => element.status !== 'anulowany' && (element.typ === 'lek' || element.status !== 'wykonany')),
    doZrobieniaBezGodziny: sortujElementyDzisiaj(elementyBezGodziny, data),
    najwazniejszeTerminy: otwarte.filter((element) => element.typ === 'wizyta' || element.typ === 'platnosc' || element.typ === 'samochod' || element.trybTerminu === 'koniec_dnia' || element.priorytet === 'pilny' || element.priorytet === 'asap').slice(0, 2),
    liczbaOtwartych: otwarte.length,
    liczbaWykonanych: elementy.filter((element) => element.status === 'wykonany').length,
    liczbaPilnych: otwarte.filter((element) => element.priorytet === 'pilny' || element.priorytet === 'asap').length,
    charakterDnia: harmonogram.pracuje ? 'roboczy' : 'wolny',
    zakresPracy: harmonogram.pracuje ? { od: harmonogram.odPracy, do: harmonogram.doPracy } : undefined,
  }
}
