import { dzisiajIso, utworzMetadane } from '../domain/fabryki'
import type { Budzet, PlanRat, PlatnoscStala, Rata, Wydatek } from '../domain/typy'

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

function zaokraglijKwote(kwota: number): number {
  return Math.round(kwota * 100) / 100
}

function dodajMiesiace(data: string, miesiace: number): string {
  const [rok, miesiac, dzien] = data.split('-').map(Number)
  const dataWynikowa = new Date(rok, miesiac - 1 + miesiace, 1)
  const ostatniDzien = new Date(dataWynikowa.getFullYear(), dataWynikowa.getMonth() + 1, 0).getDate()
  dataWynikowa.setDate(Math.min(dzien, ostatniDzien))
  return dzisiajIso(dataWynikowa)
}

export function utworzRaty(planu: PlanRat): Rata[] {
  const kwotaPodstawowa = zaokraglijKwote(planu.kwotaCalkowita / planu.liczbaRat)
  const kwotaOstatniej = zaokraglijKwote(planu.kwotaCalkowita - kwotaPodstawowa * (planu.liczbaRat - 1))
  return Array.from({ length: planu.liczbaRat }, (_, indeks) => ({
    ...utworzMetadane(),
    planRatId: planu.id,
    numer: indeks + 1,
    data: dodajMiesiace(planu.dataPierwszejRaty, indeks),
    kwota: indeks === planu.liczbaRat - 1 ? kwotaOstatniej : kwotaPodstawowa,
    nadplata: 0,
    status: 'planowana',
  }))
}

export function przeliczRatyPoNadplacie(raty: readonly Rata[], rataPoEdycji: Rata): Rata[] {
  const uporzadkowane = [...raty].sort((a, b) => a.numer - b.numer)
  const indeks = uporzadkowane.findIndex((rata) => rata.id === rataPoEdycji.id)
  if (indeks < 0) return uporzadkowane
  const poprzednia = uporzadkowane[indeks]
  const roznicaNadplaty = zaokraglijKwote(rataPoEdycji.nadplata - poprzednia.nadplata)
  const wynik = uporzadkowane.map((rata) => rata.id === rataPoEdycji.id ? rataPoEdycji : rata)
  const pozostale = wynik.slice(indeks + 1).filter((rata) => rata.status === 'planowana')
  if (roznicaNadplaty <= 0 || pozostale.length === 0) return wynik
  const dostepne = zaokraglijKwote(pozostale.reduce((suma, rata) => suma + rata.kwota, 0) - roznicaNadplaty)
  const nowaSuma = Math.max(0, dostepne)
  const kwotaRaty = zaokraglijKwote(nowaSuma / pozostale.length)
  let pozostalaKwota = nowaSuma
  return wynik.map((rata) => {
    if (!pozostale.some((pozostala) => pozostala.id === rata.id)) return rata
    const ostatnia = rata.id === pozostale.at(-1)?.id
    const kwota = ostatnia ? zaokraglijKwote(pozostalaKwota) : kwotaRaty
    pozostalaKwota = zaokraglijKwote(pozostalaKwota - kwota)
    return { ...rata, kwota }
  })
}

export function zaplanowanePlatnosciStale(platnosci: readonly PlatnoscStala[], miesiac: string): PlatnoscStala[] {
  return platnosci.filter((platnosc) => platnosc.aktywna && platnosc.dataStartu.slice(0, 7) <= miesiac)
}
