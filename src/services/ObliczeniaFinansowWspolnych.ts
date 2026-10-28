import { normalizujKwote, WALUTY } from '../domain/kwoty'
import type { BilansUczestnikaWspolnego, PodzialKosztuWspolnego, PozycjaKwotyWspolnej, PropozycjaPrzelewuWspolnego, WydatekDoObliczenWspolnych, ZwrotDoObliczenWspolnych } from '../domain/finanseWspolne'

function sprawdzWalute(waluta: string): void {
  if (!WALUTY.some((pozycja) => pozycja.kod === waluta)) throw new Error('Wybierz obsługiwaną walutę.')
}

function sprawdzLiczbe(wartosc: number, dodatnia = false): bigint {
  if (!Number.isSafeInteger(wartosc) || wartosc < (dodatnia ? 1 : 0)) throw new Error('Wymagana jest bezpieczna nieujemna liczba całkowita, a wartość operacji musi być dodatnia.')
  return BigInt(wartosc)
}

function bezpiecznaLiczba(wartosc: bigint): number {
  if (wartosc > BigInt(Number.MAX_SAFE_INTEGER) || wartosc < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Kwota lub suma przekracza bezpieczny zakres.')
  return Number(wartosc)
}

// Porządek kodów znaków, niezależny od języka urządzenia i kolejności wejścia.
function porownajId(pierwszy: string, drugi: string): number {
  return pierwszy < drugi ? -1 : pierwszy > drugi ? 1 : 0
}

function sprawdzId(identyfikatory: readonly string[]): void {
  if (identyfikatory.some((id) => typeof id !== 'string' || !id.trim()) || new Set(identyfikatory).size !== identyfikatory.length) throw new Error('Identyfikatory muszą być niepuste i niepowtarzalne.')
}

export function kwotaNaGrosze(tekst: string, waluta = 'PLN'): number {
  return bezpiecznaLiczba(BigInt(normalizujKwote(tekst, waluta).replace('.', '')))
}

export function groszeNaKwote(kwotaGrosze: number, waluta = 'PLN'): string {
  sprawdzWalute(waluta)
  if (!Number.isSafeInteger(kwotaGrosze)) throw new Error('Kwota musi być bezpieczną liczbą całkowitą.')
  const kwota = BigInt(kwotaGrosze)
  const cyfry = (kwota < 0n ? -kwota : kwota).toString().padStart(3, '0')
  return `${kwota < 0n ? '-' : ''}${cyfry.slice(0, -2)}.${cyfry.slice(-2)}`
}

export function obliczPodzialKosztu(kwotaGrosze: number, podzial: PodzialKosztuWspolnego): PozycjaKwotyWspolnej[] {
  const kwota = sprawdzLiczbe(kwotaGrosze, true)
  const pozycje = podzial.metoda === 'po_rowno'
    ? podzial.uczestnicyIds.map((uczestnikId) => ({ uczestnikId, wartosc: 1 }))
    : podzial.pozycje.map((pozycja) => ({
      uczestnikId: pozycja.uczestnikId,
      wartosc: 'kwotaGrosze' in pozycja ? pozycja.kwotaGrosze : 'procentSetne' in pozycja ? pozycja.procentSetne : pozycja.udzialy,
    }))
  sprawdzId(pozycje.map((pozycja) => pozycja.uczestnikId))
  if (!pozycje.length) throw new Error('Wybierz przynajmniej jedną osobę obciążoną kosztem.')
  const wagi = pozycje.map((pozycja) => ({ uczestnikId: pozycja.uczestnikId, waga: sprawdzLiczbe(pozycja.wartosc) }))
  const suma = wagi.reduce((wynik, pozycja) => wynik + pozycja.waga, 0n)
  if (podzial.metoda === 'kwotowo') {
    if (suma !== kwota) throw new Error('Suma kosztów musi być równa wartości wydatku.')
    return pozycje.map((pozycja) => ({ uczestnikId: pozycja.uczestnikId, kwotaGrosze: pozycja.wartosc })).sort((pierwsza, druga) => porownajId(pierwsza.uczestnikId, druga.uczestnikId))
  }
  if (podzial.metoda === 'procentowo' && suma !== 10000n) throw new Error('Suma procentów musi wynosić dokładnie 100% (10000 setnych procenta).')
  if (!suma) throw new Error('Przynajmniej jeden udział musi być dodatni.')
  const wynik = wagi.map((pozycja) => ({ uczestnikId: pozycja.uczestnikId, kwota: kwota * pozycja.waga / suma, reszta: kwota * pozycja.waga % suma }))
  let pozostalo = kwota - wynik.reduce((suma, pozycja) => suma + pozycja.kwota, 0n)
  wynik.sort((pierwsza, druga) => pierwsza.reszta === druga.reszta ? porownajId(pierwsza.uczestnikId, druga.uczestnikId) : pierwsza.reszta > druga.reszta ? -1 : 1)
  for (const pozycja of wynik) {
    if (!pozostalo) break
    pozycja.kwota += 1n
    pozostalo -= 1n
  }
  return wynik.sort((pierwsza, druga) => porownajId(pierwsza.uczestnikId, druga.uczestnikId)).map((pozycja) => ({ uczestnikId: pozycja.uczestnikId, kwotaGrosze: bezpiecznaLiczba(pozycja.kwota) }))
}

export function obliczWydatekWspolny(uczestnicyIds: readonly string[], wydatek: WydatekDoObliczenWspolnych) {
  sprawdzId(uczestnicyIds)
  sprawdzId([wydatek.id])
  sprawdzWalute(wydatek.waluta)
  const kwota = sprawdzLiczbe(wydatek.kwotaGrosze, true)
  sprawdzId(wydatek.finansujacy.map((pozycja) => pozycja.uczestnikId))
  const sumaFinansowania = wydatek.finansujacy.reduce((suma, pozycja) => suma + sprawdzLiczbe(pozycja.kwotaGrosze), 0n)
  if (sumaFinansowania !== kwota) throw new Error('Suma finansowania musi być równa wartości wydatku.')
  const podzialKosztu = obliczPodzialKosztu(wydatek.kwotaGrosze, wydatek.podzial)
  if ([...wydatek.finansujacy, ...podzialKosztu].some((pozycja) => !uczestnicyIds.includes(pozycja.uczestnikId))) throw new Error('Osoba nie należy do rozliczenia.')
  return { finansujacy: wydatek.finansujacy.map((pozycja) => ({ ...pozycja })).sort((pierwsza, druga) => porownajId(pierwsza.uczestnikId, druga.uczestnikId)), podzialKosztu }
}

// Wejście to pełna lista bieżących, nieusuniętych operacji jednego rozliczenia.
// Nie dopisuje operacji i nie zapisuje propozycji jako rzeczywistych zwrotów.
export function obliczRozliczenieWspolne(
  uczestnicyIds: readonly string[],
  waluta: string,
  wydatki: readonly WydatekDoObliczenWspolnych[],
  zwroty: readonly ZwrotDoObliczenWspolnych[] = [],
) {
  sprawdzId(uczestnicyIds)
  sprawdzId(wydatki.map((wydatek) => wydatek.id))
  sprawdzId(zwroty.map((zwrot) => zwrot.id))
  sprawdzWalute(waluta)
  const osoby = new Map([...uczestnicyIds].sort(porownajId).map((uczestnikId) => [uczestnikId, { uczestnikId, wylozone: 0n, koszt: 0n, wyslane: 0n, otrzymane: 0n }]))
  let sumaWydatkow = 0n
  for (const wydatek of wydatki) {
    if (wydatek.waluta !== waluta) throw new Error('Waluta wydatku musi odpowiadać walucie rozliczenia.')
    const wynik = obliczWydatekWspolny(uczestnicyIds, wydatek)
    sumaWydatkow += BigInt(wydatek.kwotaGrosze)
    for (const pozycja of wynik.finansujacy) osoby.get(pozycja.uczestnikId)!.wylozone += BigInt(pozycja.kwotaGrosze)
    for (const pozycja of wynik.podzialKosztu) osoby.get(pozycja.uczestnikId)!.koszt += BigInt(pozycja.kwotaGrosze)
  }
  for (const zwrot of zwroty) {
    if (zwrot.waluta !== waluta) throw new Error('Waluta zwrotu musi odpowiadać walucie rozliczenia.')
    const kwota = sprawdzLiczbe(zwrot.kwotaGrosze, true)
    const nadawca = osoby.get(zwrot.odUczestnikaId)
    const odbiorca = osoby.get(zwrot.doUczestnikaId)
    if (!nadawca || !odbiorca || nadawca === odbiorca) throw new Error('Zwrot wymaga dwóch różnych osób należących do rozliczenia.')
    nadawca.wyslane += kwota
    odbiorca.otrzymane += kwota
  }
  const bilanse: BilansUczestnikaWspolnego[] = [...osoby.values()].map((osoba) => {
    const bilans = osoba.wylozone - osoba.koszt + osoba.wyslane - osoba.otrzymane
    return {
      uczestnikId: osoba.uczestnikId,
      wylozoneGrosze: bezpiecznaLiczba(osoba.wylozone), kosztGrosze: bezpiecznaLiczba(osoba.koszt),
      wyslaneZwrotyGrosze: bezpiecznaLiczba(osoba.wyslane), otrzymaneZwrotyGrosze: bezpiecznaLiczba(osoba.otrzymane),
      bilansGrosze: bezpiecznaLiczba(bilans), doOtrzymaniaGrosze: bezpiecznaLiczba(bilans > 0n ? bilans : 0n), doOddaniaGrosze: bezpiecznaLiczba(bilans < 0n ? -bilans : 0n),
    }
  })
  const dluznicy = bilanse.filter((osoba) => osoba.doOddaniaGrosze).map((osoba) => ({ id: osoba.uczestnikId, pozostalo: osoba.doOddaniaGrosze }))
  const wierzyciele = bilanse.filter((osoba) => osoba.doOtrzymaniaGrosze).map((osoba) => ({ id: osoba.uczestnikId, pozostalo: osoba.doOtrzymaniaGrosze }))
  const propozycjePrzelewow: PropozycjaPrzelewuWspolnego[] = []
  const porownajNaleznosci = (pierwsza: { id: string; pozostalo: number }, druga: { id: string; pozostalo: number }) => druga.pozostalo - pierwsza.pozostalo || porownajId(pierwsza.id, druga.id)
  while (dluznicy.length && wierzyciele.length) {
    dluznicy.sort(porownajNaleznosci)
    wierzyciele.sort(porownajNaleznosci)
    const dluznik = dluznicy[0]
    const wierzyciel = wierzyciele[0]
    const kwotaGrosze = Math.min(dluznik.pozostalo, wierzyciel.pozostalo)
    propozycjePrzelewow.push({ odUczestnikaId: dluznik.id, doUczestnikaId: wierzyciel.id, kwotaGrosze })
    dluznik.pozostalo -= kwotaGrosze
    wierzyciel.pozostalo -= kwotaGrosze
    if (!dluznik.pozostalo) dluznicy.shift()
    if (!wierzyciel.pozostalo) wierzyciele.shift()
  }
  return { waluta, sumaWydatkowGrosze: bezpiecznaLiczba(sumaWydatkow), bilanse, propozycjePrzelewow }
}
