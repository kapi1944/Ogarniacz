import { z } from 'zod'
import type { WspolnaKasa, OperacjaKasy, Rozliczenie, WydatekGrupowy, ZwrotRozliczenia } from './modeleFinansowWspolnych.ts'
import { groszeNaKwote, obliczWydatekWspolny, obliczRozliczenieWspolne } from './ObliczeniaFinansowWspolnych.ts'
import { kanonicznyZapis, schematDanychOperacji, schematDanychRozliczenia } from './ZapisFinansowy.ts'
const schematUczestnika = z.object({ id: z.string().trim().min(1), nazwa: z.string().trim().min(1), nieaktywny: z.boolean().optional() }).strict()
export function obliczSaldoZOperacji(kasa: WspolnaKasa, operacje: readonly OperacjaKasy[]): number {
  groszeNaKwote(kasa.saldoPoczatkoweGrosze, kasa.waluta)
  let saldo = BigInt(kasa.saldoPoczatkoweGrosze)
  for (const operacja of operacje) {
    if (operacja.kasaId !== kasa.id || operacja.waluta !== kasa.waluta) throw new Error('Operacja musi należeć do kasy i mieć jej walutę.')
    walidujOperacjeKasy(operacja)
    if (!operacja.usunietoAt) saldo += BigInt(operacja.kwotaGrosze) * (operacja.typ === 'wydatek' ? -1n : 1n)
  }
  if (saldo > BigInt(Number.MAX_SAFE_INTEGER) || saldo < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Saldo przekracza bezpieczny zakres.')
  return Number(saldo)
}

export function walidujOperacjeKasy(operacja: z.infer<typeof schematDanychOperacji>): void {
  groszeNaKwote(operacja.kwotaGrosze, operacja.waluta)
  if (operacja.typ === 'korekta' ? operacja.kwotaGrosze === 0 : operacja.kwotaGrosze <= 0) throw new Error('Wpływ i wydatek muszą być dodatnie, a korekta różna od zera.')
  if (operacja.typ === 'korekta' && !operacja.opis.trim()) throw new Error('Korekta wymaga uzasadnienia w opisie.')
  if (operacja.kaucja) {
    const kaucja = operacja.kaucja
    const suma = kaucja.pozycje.reduce((wynik, pozycja) => wynik + BigInt(pozycja.liczbaSztuk) * BigInt(pozycja.stawkaGrosze), 0n)
    if (operacja.typ !== 'wplyw' || suma !== BigInt(kaucja.sumaGrosze) || operacja.kwotaGrosze !== (kaucja.zatwierdzonaKwotaGrosze ?? kaucja.sumaGrosze) || operacja.kwotaGrosze !== kaucja.sumaGrosze && !kaucja.uzasadnienie?.trim()) throw new Error('Niepoprawne kwoty lub uzasadnienie kaucji.')
  }
}

export function walidujRozliczenie(rozliczenie: z.infer<typeof schematDanychRozliczenia>): void {
  groszeNaKwote(0, rozliczenie.waluta)
  const identyfikatory = new Set<string>()
  for (const uczestnik of rozliczenie.uczestnicy) {
    schematUczestnika.parse(uczestnik)
    if (identyfikatory.has(uczestnik.id)) throw new Error('Powtórzony identyfikator uczestnika.')
    identyfikatory.add(uczestnik.id)
  }
}

function doObliczen(wydatek: WydatekGrupowy) {
  return { ...wydatek, podzial: wydatek.parametryPodzialu }
}

export function walidujZapisanyWydatek(rozliczenie: Rozliczenie, wydatek: WydatekGrupowy): void {
  if (wydatek.rozliczenieId !== rozliczenie.id || wydatek.waluta !== rozliczenie.waluta) throw new Error('Wydatek musi należeć do rozliczenia i mieć jego walutę.')
  const wynik = obliczWydatekWspolny(rozliczenie.uczestnicy.map(({ id }) => id), doObliczen(wydatek))
  if (wydatek.metodaPodzialu !== wydatek.parametryPodzialu.metoda || kanonicznyZapis(wynik.podzialKosztu) !== kanonicznyZapis([...wydatek.podzialKosztu].sort((pierwsza, druga) => pierwsza.uczestnikId < druga.uczestnikId ? -1 : pierwsza.uczestnikId > druga.uczestnikId ? 1 : 0))) throw new Error('Zapisany podział kosztu jest niezgodny z parametrami.')
}

export function obliczBilansZRekordow(rozliczenie: Rozliczenie, wydatki: readonly WydatekGrupowy[], zwroty: readonly ZwrotRozliczenia[]) {
  walidujRozliczenie(rozliczenie)
  for (const wydatek of wydatki) walidujZapisanyWydatek(rozliczenie, wydatek)
  for (const zwrot of zwroty) {
    if (zwrot.rozliczenieId !== rozliczenie.id) throw new Error('Zwrot nie należy do rozliczenia.')
    // Walidujemy również zachowaną historię usuniętych zwrotów.
    obliczRozliczenieWspolne(rozliczenie.uczestnicy.map(({ id }) => id), rozliczenie.waluta, [], [zwrot])
  }
  return obliczRozliczenieWspolne(rozliczenie.uczestnicy.map(({ id }) => id), rozliczenie.waluta, wydatki.filter((wydatek) => !wydatek.usunietoAt).map(doObliczen), zwroty.filter((zwrot) => !zwrot.usunietoAt))
}
