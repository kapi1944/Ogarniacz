import { z } from 'zod'
import { schematWspolnejKasy, schematOperacjiKasy, schematRozliczenia, schematWydatkuGrupowego, schematZwrotuRozliczenia } from './modeleFinansowWspolnych.ts'
export const TABELE_FINANSOW_WSPOLNYCH = ['wspolneKasy', 'operacjeKas', 'rozliczenia', 'wydatkiGrupowe', 'zwrotyRozliczen'] as const
export type MapaTabel = { wspolneKasy: z.infer<typeof schematWspolnejKasy>; operacjeKas: z.infer<typeof schematOperacjiKasy>; rozliczenia: z.infer<typeof schematRozliczenia>; wydatkiGrupowe: z.infer<typeof schematWydatkuGrupowego>; zwrotyRozliczen: z.infer<typeof schematZwrotuRozliczenia> }
export const schematyFinansowe = {
  wspolneKasy: schematWspolnejKasy, operacjeKas: schematOperacjiKasy, rozliczenia: schematRozliczenia,
  wydatkiGrupowe: schematWydatkuGrupowego, zwrotyRozliczen: schematZwrotuRozliczenia,
}
const metadane = { id: true, createdAt: true, updatedAt: true, usunietoAt: true, rewizja: true, historiaWersji: true } as const
export const schematDanychKasy = schematWspolnejKasy.omit(metadane).strict()
export const schematDanychOperacji = schematOperacjiKasy.omit(metadane).strict()
export const schematDanychRozliczenia = schematRozliczenia.omit(metadane).strict()
export const schematDanychWydatku = schematWydatkuGrupowego.omit(metadane).strict()
export const schematDanychZwrotu = schematZwrotuRozliczenia.omit(metadane).strict()
const schematyDanych = { wspolneKasy: schematDanychKasy, operacjeKas: schematDanychOperacji, rozliczenia: schematDanychRozliczenia, wydatkiGrupowe: schematDanychWydatku, zwrotyRozliczen: schematDanychZwrotu }
export type TabelaFinansowa = typeof TABELE_FINANSOW_WSPOLNYCH[number]

type WartoscFinansowa = z.infer<ReturnType<typeof z.json>>

export function kanonicznyZapis(wartosc: unknown): string {
  if (Array.isArray(wartosc)) return `[${wartosc.map(kanonicznyZapis).join(',')}]`
  if (wartosc && typeof wartosc === 'object') return `{${Object.entries(wartosc).filter(([, element]) => element !== undefined).sort(([pierwszy], [drugi]) => pierwszy < drugi ? -1 : pierwszy > drugi ? 1 : 0).map(([klucz, element]) => `${JSON.stringify(klucz)}:${kanonicznyZapis(element)}`).join(',')}}`
  return JSON.stringify(wartosc) ?? 'null'
}

export function daneBiznesowe<K extends TabelaFinansowa>(tabela: K, rekord: MapaTabel[K]): Record<string, WartoscFinansowa> {
  const dane = Object.fromEntries(Object.entries(rekord).filter(([klucz]) => !(klucz in metadane)))
  return JSON.parse(kanonicznyZapis(schematyDanych[tabela].parse(dane))) as Record<string, WartoscFinansowa>
}
