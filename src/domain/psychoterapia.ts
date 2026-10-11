import { z } from 'zod'
import type { EncjaBazowa, NazwaTabeli } from './typy'

const identyfikatory = z.array(z.string().min(1)).refine((ids) => new Set(ids).size === ids.length, 'Źródło wybrano więcej niż raz.')
export const schematSzczegolowPsychoterapii = z.object({
  terapeutaId: z.string().min(1).optional(),
  tematy: z.string().optional(),
  wypowiedzi: z.string().optional(),
  wpisySamopoczuciaIds: identyfikatory.optional(),
  ustaleniaSesjiIds: identyfikatory.optional(),
  pytaniaSesjiIds: identyfikatory.optional(),
  cwiczeniaZadaniaIds: identyfikatory.optional(),
  dokumentyIds: identyfikatory.optional(),
}).strict()
export type SzczegolyPsychoterapii = z.infer<typeof schematSzczegolowPsychoterapii>

/** Ochrona działa również po soft-delete, w kolejce i po przywróceniu backupu. */
export function czyPrywatnaPsychoterapia(tabela: NazwaTabeli, rekord?: EncjaBazowa): boolean {
  return Boolean(rekord && (tabela === 'wpisyTerapii' && 'psychoterapia' in rekord
    || tabela === 'zadania' && 'sesjaTerapiiId' in rekord))
}
