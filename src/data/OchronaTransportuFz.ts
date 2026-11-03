import { baza } from './BazaOgarniacza'
import { czyRekordFz } from '../../server/wspolne/WalidacjaPulZobowiazan.ts'

/** Sprawdza też dotychczasowe operacje kasy aktywowanej jako Pula. */
export async function czyWstrzymanyTransportFz(tabela: string, rekord: unknown): Promise<boolean> {
  if (czyRekordFz(tabela, rekord)) return true
  if (tabela !== 'operacjeKas' || !rekord || typeof rekord !== 'object' || !('kasaId' in rekord)) return false
  return !!(await baza.tabela('wspolneKasy').get(String(rekord.kasaId)))?.pula
}
