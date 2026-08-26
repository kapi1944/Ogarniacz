import { z } from 'zod'
import { dzisiajIso, terazIso, utworzMetadane } from '../domain/fabryki'
import type { Zadanie } from '../domain/typy'
import { nastepnaData } from './PowtarzanieService'

export const schematNowegoZadania = z.object({
  tytul: z.string().trim().min(1, 'Podaj tytul zadania').max(160),
  opis: z.string().max(5000).default(''),
  priorytet: z.enum(['niski', 'normalny', 'wysoki', 'krytyczny']).default('normalny'),
  termin: z.string().optional(),
  szacowanyCzasMin: z.number().int().positive().max(1440).optional(),
  projektId: z.string().optional(),
  kontekst: z.string().optional(),
})

export type DaneNowegoZadania = z.input<typeof schematNowegoZadania>

export function utworzZadanie(dane: DaneNowegoZadania): Zadanie {
  const poprawne = schematNowegoZadania.parse(dane)
  return {
    ...utworzMetadane(),
    ...poprawne,
    status: 'otwarte',
    tagi: [],
    podzadania: [],
    powiazania: [],
  }
}

export function czyZadanieZalegle(zadanie: Zadanie, dzien = dzisiajIso()): boolean {
  return zadanie.status !== 'wykonane' && Boolean(zadanie.termin && zadanie.termin < dzien)
}

export function czyZadanieNaDzis(zadanie: Zadanie, dzien = dzisiajIso()): boolean {
  return zadanie.status !== 'wykonane' && zadanie.termin === dzien
}

export function ukonczZadanie(zadanie: Zadanie): { wykonane: Zadanie; nastepne?: Zadanie } {
  const teraz = terazIso()
  const wykonane: Zadanie = { ...zadanie, status: 'wykonane', wykonanoAt: teraz, updatedAt: teraz }
  const kolejnyTermin = zadanie.termin ? nastepnaData(zadanie.termin, zadanie.powtarzanie) : undefined
  if (!kolejnyTermin) return { wykonane }
  const nastepne: Zadanie = {
    ...zadanie,
    ...utworzMetadane(),
    status: 'otwarte',
    termin: kolejnyTermin,
    wykonanoAt: undefined,
  }
  return { wykonane, nastepne }
}

export function przywrocZadanie(zadanie: Zadanie): Zadanie {
  return { ...zadanie, status: 'otwarte', wykonanoAt: undefined, updatedAt: terazIso() }
}

export function odroczZadanie(zadanie: Zadanie, nowyTermin: string): Zadanie {
  return { ...zadanie, termin: nowyTermin, updatedAt: terazIso() }
}
