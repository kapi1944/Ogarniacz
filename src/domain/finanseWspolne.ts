// Kontrakty obliczeń, bez encji trwałych. Wszystkie kwoty to najmniejsze jednostki
// waluty (bezpieczne liczby całkowite); dotychczasowe pole kwota pozostaje bez zmian.
export interface PozycjaKwotyWspolnej {
  uczestnikId: string
  kwotaGrosze: number
}

// Listy wskazują wyłącznie osoby obciążone kosztem danego zakupu.
// Pominięta osoba może nadal finansować wydatek.
export type PodzialKosztuWspolnego =
  | { metoda: 'po_rowno'; uczestnicyIds: readonly string[] }
  | { metoda: 'kwotowo'; pozycje: readonly PozycjaKwotyWspolnej[] }
  | { metoda: 'procentowo'; pozycje: readonly { uczestnikId: string; procentSetne: number }[] }
  | { metoda: 'udzialy'; pozycje: readonly { uczestnikId: string; udzialy: number }[] }

export interface WydatekDoObliczenWspolnych {
  id: string
  kwotaGrosze: number
  waluta: string
  finansujacy: readonly PozycjaKwotyWspolnej[]
  podzial: PodzialKosztuWspolnego
}

// Faktyczny zwrot jest osobnym wejściem, nigdy automatycznym skutkiem propozycji.
export interface ZwrotDoObliczenWspolnych {
  id: string
  odUczestnikaId: string
  doUczestnikaId: string
  kwotaGrosze: number
  waluta: string
}

export interface BilansUczestnikaWspolnego {
  uczestnikId: string
  wylozoneGrosze: number
  kosztGrosze: number
  wyslaneZwrotyGrosze: number
  otrzymaneZwrotyGrosze: number
  bilansGrosze: number
  doOtrzymaniaGrosze: number
  doOddaniaGrosze: number
}

export interface PropozycjaPrzelewuWspolnego {
  odUczestnikaId: string
  doUczestnikaId: string
  kwotaGrosze: number
}
