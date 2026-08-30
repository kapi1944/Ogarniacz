import { z } from 'zod'
import { repozytoriumUstawien } from '../data/RepozytoriumUstawien'
import { normalizujUstawienia, WERSJA_USTAWIEN } from '../domain/ustawienia'
import type { Ustawienia } from '../domain/typy'

export const WERSJA_FORMATU_USTAWIEN = 1

export interface EksportUstawien {
  formatVersion: number
  createdAt: string
  settings: Ustawienia
}

const schematEksportuUstawien = z.object({
  formatVersion: z.literal(WERSJA_FORMATU_USTAWIEN),
  createdAt: z.string().min(1),
  settings: z.object({ wersja: z.literal(WERSJA_USTAWIEN) }).passthrough(),
}).strict()

export async function utworzEksportUstawien(
  teraz: () => string = () => new Date().toISOString(),
): Promise<EksportUstawien> {
  return {
    formatVersion: WERSJA_FORMATU_USTAWIEN,
    createdAt: teraz(),
    settings: await repozytoriumUstawien.wczytaj(),
  }
}

export function przygotujImportUstawien(tresc: string): Ustawienia {
  let wartosc: unknown
  try {
    wartosc = JSON.parse(tresc)
  } catch (blad) {
    throw new Error('Plik ustawień nie zawiera poprawnego JSON.', { cause: blad })
  }
  const wynik = schematEksportuUstawien.safeParse(wartosc)
  if (!wynik.success) throw new Error('Plik ma niepoprawny format ustawień.', { cause: wynik.error })
  return normalizujUstawienia(wynik.data.settings)
}

export async function importujUstawienia(tresc: string): Promise<Ustawienia> {
  const ustawienia = przygotujImportUstawien(tresc)
  return repozytoriumUstawien.zapisz(ustawienia)
}
