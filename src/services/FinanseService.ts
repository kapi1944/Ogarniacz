import type { Budzet, Wydatek } from '../domain/typy'

export interface WykorzystanieBudzetu {
  budzet: Budzet
  wydano: number
  przekroczony: boolean
}

export function obliczWykorzystanieBudzetow(
  budzety: readonly Budzet[],
  wydatki: readonly Wydatek[],
  okres: string,
): WykorzystanieBudzetu[] {
  return budzety
    .filter((budzet) => budzet.okres === okres)
    .map((budzet) => {
      const wydano = wydatki
        .filter((wydatek) => wydatek.data.startsWith(okres) && (!budzet.kategoria || wydatek.kategoria === budzet.kategoria))
        .reduce((suma, wydatek) => suma + wydatek.kwota, 0)
      return { budzet, wydano, przekroczony: wydano > budzet.limit }
    })
}
