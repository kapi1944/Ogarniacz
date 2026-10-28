import { dzisiajIso, utworzMetadane } from '../domain/fabryki'
import type { Repozytorium } from '../data/Repozytorium'
import type { Budzet, PlanRat, PlatnoscStala, Rachunek, Rata, Wydatek } from '../domain/typy'
import { kwotaDoModelu, sumaKwot } from '../domain/kwoty'

export function przygotujKwoteTransakcji(tekst: string, waluta: string, istniejaca?: Wydatek) {
  const kwota = kwotaDoModelu(tekst, waluta)
  if (kwota < 0.01) throw new Error('Kwota transakcji musi wynosić co najmniej 0,01.')
  if (waluta !== 'PLN' && (istniejaca?.platnoscStalaId || istniejaca?.rataId || istniejaca?.powiazanie)) throw new Error('Transakcja powiązana z płatnością lub innym modułem musi pozostać w PLN.')
  return { kwota, waluta }
}

export function czyTransakcjaWPLN(transakcja: Wydatek): boolean {
  return (transakcja.waluta ?? 'PLN') === 'PLN'
}

export function podsumujWaluty(miesiac: string, transakcje: readonly Wydatek[]) {
  const waluty = [...new Set(transakcje.filter((transakcja) => transakcja.data.startsWith(miesiac)).map((transakcja) => transakcja.waluta ?? 'PLN'))]
  return waluty.map((waluta) => {
    const wybrane = transakcje.filter((transakcja) => transakcja.data.startsWith(miesiac) && (transakcja.waluta ?? 'PLN') === waluta)
    const przychody = sumaKwot(wybrane.filter((transakcja) => transakcja.rodzaj === 'przychod').map((transakcja) => transakcja.kwota))
    const wydatki = sumaKwot(wybrane.filter(czyTransakcjaJestWydatkiem).map((transakcja) => transakcja.kwota))
    return { waluta, przychody, wydatki, bilans: sumaKwot([przychody, -wydatki]) }
  })
}

export interface WykorzystanieBudzetu {
  budzet: Budzet
  wydano: number
  przekroczony: boolean
  pozostalo: number
  procent: number
}

export function czyTransakcjaJestWydatkiem(transakcja: Wydatek): boolean {
  return transakcja.rodzaj === undefined || transakcja.rodzaj === 'wydatek'
}

export function obliczWykorzystanieBudzetow(
  budzety: readonly Budzet[],
  wydatki: readonly Wydatek[],
  okres: string,
): WykorzystanieBudzetu[] {
  return budzety
    .filter((budzet) => budzet.okres === okres)
    .map((budzet) => {
      const wydano = sumaKwot(wydatki
        .filter((wydatek) => czyTransakcjaWPLN(wydatek) && czyTransakcjaJestWydatkiem(wydatek) && wydatek.data.startsWith(okres) && (!budzet.kategoria || wydatek.kategoria === budzet.kategoria))
        .map((wydatek) => wydatek.kwota))
      return { budzet, wydano, przekroczony: wydano >= budzet.limit, pozostalo: sumaKwot([budzet.limit, -wydano]), procent: budzet.limit ? Math.round(wydano / budzet.limit * 100) : 0 }
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
  const transakcjeMiesiaca = transakcje.filter((transakcja) => czyTransakcjaWPLN(transakcja) && transakcja.data.startsWith(miesiac))
  const przychody = sumaKwot(transakcjeMiesiaca.filter((transakcja) => transakcja.rodzaj === 'przychod').map((transakcja) => transakcja.kwota))
  const wydatki = sumaKwot(transakcjeMiesiaca.filter(czyTransakcjaJestWydatkiem).map((transakcja) => transakcja.kwota))
  const rachunkiDoOplacenia = sumaKwot(rachunki.filter((rachunek) => rachunek.status === 'niezaplacony' && rachunek.termin.slice(0, 7) === miesiac).map((rachunek) => rachunek.kwota))
  const staleDoZaksiegowania = sumaKwot(zaplanowanePlatnosciStale(platnosciStale, miesiac)
    .filter((platnosc) => !transakcjeMiesiaca.some((transakcja) => transakcja.platnoscStalaId === platnosc.id))
    .map((platnosc) => platnosc.kwota))
  const ratyDoOplacenia = sumaKwot(raty.filter((rata) => rata.status === 'planowana' && rata.data.startsWith(miesiac)).flatMap((rata) => [rata.kwota, rata.nadplata]))
  const zobowiazania = sumaKwot([rachunkiDoOplacenia, staleDoZaksiegowania, ratyDoOplacenia])
  return { przychody, wydatki, zobowiazania, bilansBiezacy: sumaKwot([przychody, -wydatki]), prognozowanyBilans: sumaKwot([przychody, -wydatki, -zobowiazania]) }
}

export function czyZaksiegowanoZrodlo(transakcje: readonly Wydatek[], powiazanie: NonNullable<Wydatek['powiazanie']>): boolean {
  return transakcje.some((transakcja) => transakcja.powiazanie?.typ === powiazanie.typ && transakcja.powiazanie.id === powiazanie.id)
}

export function przygotujWydatekZeZrodla(
  transakcje: readonly Wydatek[],
  dane: Omit<Wydatek, keyof ReturnType<typeof utworzMetadane>>,
): Wydatek | undefined {
  if (dane.powiazanie && czyZaksiegowanoZrodlo(transakcje, dane.powiazanie)) return undefined
  return { ...utworzMetadane(), ...dane, rodzaj: 'wydatek' }
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

export async function zaksiegujPlatnoscStala(
  platnosc: PlatnoscStala,
  miesiac: string,
  repozytoriumWydatkow: Repozytorium<Wydatek>,
): Promise<void> {
  const data = `${miesiac}-${String(Math.min(platnosc.dzienMiesiaca, new Date(Number(miesiac.slice(0, 4)), Number(miesiac.slice(5, 7)), 0).getDate())).padStart(2, '0')}`
  await repozytoriumWydatkow.zapisz({ ...utworzMetadane(), opis: platnosc.nazwa, kwota: platnosc.kwota, data, kategoria: platnosc.kategoria, platnoscStalaId: platnosc.id })
}
