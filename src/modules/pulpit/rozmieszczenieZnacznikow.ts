import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import { pozycjaGodzinyNaOsi, type ZakresSnuDnia } from './logikaOsiCzasu'

export function rozmiescZnaczniki(elementy: readonly ElementOgarniacza[], zakresSnu: ZakresSnuDnia) {
  const konceWierszy: number[] = []
  return elementy.filter((element) => element.godzina).map((element) => ({
    element, pozycja: pozycjaGodzinyNaOsi(element.godzina!, zakresSnu),
  })).sort((a, b) => a.pozycja - b.pozycja || a.element.id.localeCompare(b.element.id)).map((znacznik) => {
    // Karta zajmuje najwyżej 24% minimalnej szerokości osi (640 px).
    const lewa = Math.max(0, Math.min(76, znacznik.pozycja - 12))
    const wolnyWiersz = konceWierszy.findIndex((koniec) => koniec <= lewa)
    const wiersz = wolnyWiersz < 0 ? konceWierszy.length : wolnyWiersz
    konceWierszy[wiersz] = lewa + 25
    return { ...znacznik, lewa, wiersz }
  })
}
