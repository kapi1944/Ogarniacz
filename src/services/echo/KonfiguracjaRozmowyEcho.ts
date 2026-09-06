export type TempoRozmowyEcho = 'spokojny' | 'szybki'

export interface ParametryRozmowyGlosowejEcho {
  limitPierwszejWypowiedziMs: number
  limitKontynuacjiMs: number
}

const PARAMETRY: Record<TempoRozmowyEcho, ParametryRozmowyGlosowejEcho> = {
  spokojny: { limitPierwszejWypowiedziMs: 30_000, limitKontynuacjiMs: 12_000 },
  szybki: { limitPierwszejWypowiedziMs: 12_000, limitKontynuacjiMs: 4_000 },
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
