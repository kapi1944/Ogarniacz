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

  pobierzTempo(): TempoRozmowyEcho { return this.tempo }
  pobierzParametryGlosu(): ParametryRozmowyGlosowejEcho { return PARAMETRY[this.tempo] }
  ustawTempo(tempo: TempoRozmowyEcho): void { this.tempo = tempo }
}

export function rozpoznajZmianeTempaEcho(tekst: string): TempoRozmowyEcho | undefined {
  const uproszczony = tekst.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l')
  if (!/\btryb\s+szybki\b/.test(uproszczony)) return /\btryb\s+spokojny\b/.test(uproszczony) ? 'spokojny' : undefined
  return 'szybki'
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
