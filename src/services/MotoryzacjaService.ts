import type { Pojazd } from '../domain/typy'

const zaokraglij = (wartosc: number, miejsca = 3) => Number(wartosc.toFixed(miejsca))

export function statystykaPaliwa(pojazd: Pojazd) {
  const tankowania = [...(pojazd.tankowania ?? [])].sort((a, b) => a.przebieg - b.przebieg)
  const pelneTankowania = tankowania.filter((tankowanie) => tankowanie.pelnyBak)
  const kosztPaliwa = tankowania.reduce((suma, tankowanie) => suma + tankowanie.cena, 0)
  const pierwszyPelny = pelneTankowania[0]
  const ostatniPelny = pelneTankowania.at(-1)
  const przebieg = pierwszyPelny && ostatniPelny && pierwszyPelny.id !== ostatniPelny.id ? ostatniPelny.przebieg - pierwszyPelny.przebieg : 0
  const litry = pierwszyPelny && ostatniPelny
    ? tankowania.filter((tankowanie) => tankowanie.przebieg > pierwszyPelny.przebieg && tankowanie.przebieg <= ostatniPelny.przebieg).reduce((suma, tankowanie) => suma + tankowanie.litry, 0)
    : 0
  const kosztOkresu = pierwszyPelny && ostatniPelny
    ? tankowania.filter((tankowanie) => tankowanie.przebieg > pierwszyPelny.przebieg && tankowanie.przebieg <= ostatniPelny.przebieg).reduce((suma, tankowanie) => suma + tankowanie.cena, 0)
    : 0
  return {
    kosztPaliwa,
    srednieSpalanie: przebieg > 0 ? zaokraglij((litry / przebieg) * 100) : undefined,
    kosztNaKm: przebieg > 0 ? zaokraglij(kosztOkresu / przebieg) : undefined,
  }
}
