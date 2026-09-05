import type { Pojazd } from '../domain/typy'

export function statystykaPaliwa(pojazd: Pojazd) {
  const tankowania = [...(pojazd.tankowania ?? [])].sort((a, b) => a.przebieg - b.przebieg)
  const pelneTankowania = tankowania.filter((tankowanie) => tankowanie.pelnyBak)
  const kosztPaliwa = tankowania.reduce((suma, tankowanie) => suma + tankowanie.cena, 0)
  const przebieg = pelneTankowania.length >= 2 ? pelneTankowania.at(-1)!.przebieg - pelneTankowania[0].przebieg : 0
  const litry = pelneTankowania.reduce((suma, tankowanie) => suma + tankowanie.litry, 0)
  return {
    kosztPaliwa,
    srednieSpalanie: przebieg > 0 ? (litry / przebieg) * 100 : undefined,
    kosztNaKm: przebieg > 0 ? kosztPaliwa / przebieg : undefined,
  }
}
