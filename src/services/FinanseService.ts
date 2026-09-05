import { dzisiajIso, utworzMetadane } from '../domain/fabryki'
import type { Budzet, PlanRat, PlatnoscStala, Rachunek, Rata, Wydatek } from '../domain/typy'

export interface WykorzystanieBudzetu {
  budzet: Budzet
  wydano: number
  przekroczony: boolean
  pozostalo: number
  procent: number
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
      return { budzet, wydano, przekroczony: wydano >= budzet.limit, pozostalo: budzet.limit - wydano, procent: budzet.limit ? Math.round(wydano / budzet.limit * 100) : 0 }
    })
}

export interface PodsumowanieCashFlow {
  przychody: number
  wydatki: number
  zobowiazania: number
  bilansBiezacy: number
  prognozowanyBilans: number
}

export function podsumujCashFlow(
  miesiac: string,
  transakcje: readonly Wydatek[],
  rachunki: readonly Rachunek[],
  platnosciStale: readonly PlatnoscStala[],
  raty: readonly Rata[],
): PodsumowanieCashFlow {
  const transakcjeMiesiaca = transakcje.filter((transakcja) => transakcja.data.startsWith(miesiac))
  const przychody = transakcjeMiesiaca.filter((transakcja) => transakcja.rodzaj === 'przychod').reduce((suma, transakcja) => suma + transakcja.kwota, 0)
  const wydatki = transakcjeMiesiaca.filter((transakcja) => transakcja.rodzaj !== 'przychod' && transakcja.rodzaj !== 'transfer').reduce((suma, transakcja) => suma + transakcja.kwota, 0)
  const rachunkiDoOplacenia = rachunki.filter((rachunek) => rachunek.status === 'niezaplacony' && rachunek.termin.slice(0, 7) === miesiac).reduce((suma, rachunek) => suma + rachunek.kwota, 0)
  const staleDoZaksiegowania = zaplanowanePlatnosciStale(platnosciStale, miesiac)
    .filter((platnosc) => !transakcjeMiesiaca.some((transakcja) => transakcja.platnoscStalaId === platnosc.id))
    .reduce((suma, platnosc) => suma + platnosc.kwota, 0)
  const ratyDoOplacenia = raty.filter((rata) => rata.status === 'planowana' && rata.data.startsWith(miesiac)).reduce((suma, rata) => suma + rata.kwota + rata.nadplata, 0)
  const zobowiazania = rachunkiDoOplacenia + staleDoZaksiegowania + ratyDoOplacenia
  return { przychody, wydatki, zobowiazania, bilansBiezacy: przychody - wydatki, prognozowanyBilans: przychody - wydatki - zobowiazania }
}

export function czyZaksiegowanoZrodlo(transakcje: readonly Wydatek[], powiazanie: NonNullable<Wydatek['powiazanie']>): boolean {
  return transakcje.some((transakcja) => transakcja.powiazanie?.typ === powiazanie.typ && transakcja.powiazanie.id === powiazanie.id)
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
