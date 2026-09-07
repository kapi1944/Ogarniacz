import type { TrybRozmowyEcho } from './typyEcho'

export type TempoRozmowyEcho = 'spokojny' | 'szybki'

export interface ParametryRozmowyGlosowejEcho {
  limitPierwszejWypowiedziMs: number
  limitKontynuacjiMs: number
  limitPauzyMs: number
}

const PARAMETRY: Record<TempoRozmowyEcho, ParametryRozmowyGlosowejEcho> = {
  spokojny: { limitPierwszejWypowiedziMs: 30_000, limitKontynuacjiMs: 12_000, limitPauzyMs: 4_000 },
  szybki: { limitPierwszejWypowiedziMs: 12_000, limitKontynuacjiMs: 4_000, limitPauzyMs: 1_200 },
}

export class KonfiguracjaRozmowyEcho {
  private tempo: TempoRozmowyEcho = 'spokojny'
  private trybRozmowy: TrybRozmowyEcho

  constructor(trybRozmowy: TrybRozmowyEcho = 'szybki') {
    this.trybRozmowy = trybRozmowy
  }

  pobierzTempo(): TempoRozmowyEcho { return this.tempo }
  pobierzParametryGlosu(): ParametryRozmowyGlosowejEcho { return PARAMETRY[this.tempo] }
  ustawTempo(tempo: TempoRozmowyEcho): void { this.tempo = tempo }
  pobierzTrybRozmowy(): TrybRozmowyEcho { return this.trybRozmowy }
  ustawTrybRozmowy(trybRozmowy: TrybRozmowyEcho): void { this.trybRozmowy = trybRozmowy }
}

export function rozpoznajZmianeTempaEcho(tekst: string): TempoRozmowyEcho | undefined {
  const uproszczony = tekst.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l')
  if (!/\btempo\s+szybkie\b/.test(uproszczony)) return /\btempo\s+spokojne\b/.test(uproszczony) ? 'spokojny' : undefined
  return 'szybki'
}

export function rozpoznajZmianeTrybuRozmowyEcho(tekst: string): TrybRozmowyEcho | undefined {
  const uproszczony = tekst.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l')
  if (/\btryb\s+rozmowy\s+swobodny\b|\btryb\s+swobodny\b/.test(uproszczony)) return 'swobodny'
  return /\btryb\s+rozmowy\s+szybki\b|\btryb\s+szybki\b/.test(uproszczony) ? 'szybki' : undefined
}

export function instrukcjaTrybuRozmowyEcho(trybRozmowy: TrybRozmowyEcho): string {
  return trybRozmowy === 'szybki'
    ? 'Tryb rozmowy: szybki. Odpowiadaj możliwie krótko. Gdy dane wystarczają, wykonaj dozwoloną akcję zamiast jej omawiania. Zadawaj najwyżej jedno pytanie doprecyzowujące naraz, a po wykonaniu podaj krótkie potwierdzenie. Nie rozwijaj wyjaśnień bez prośby użytkownika.'
    : 'Tryb rozmowy: swobodny. Prowadź naturalną, pełniejszą rozmowę. Możesz wyjaśniać użytkowe rozumowanie, przedstawiać warianty i wykorzystywać dane Ogarniacza do propozycji.'
}

export function rozpoznajZmianeAutomatycznegoOdczytuEcho(tekst: string): boolean | undefined {
  const uproszczony = tekst
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
  if (/^(nie czytaj( mi)? odpowiedzi( na glos)?|wylacz czytanie odpowiedzi|odpowiadaj tylko tekstem)$/.test(uproszczony)) return false
  if (/^(czytaj( mi)? odpowiedzi( na glos)?|mow mi odpowiedzi|wlacz czytanie odpowiedzi)$/.test(uproszczony)) return true
  return undefined
}
