import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { pobierzRepozytorium } from '../data/Repozytorium'
import type { MapaTabel, NazwaTabeli } from '../domain/typy'

// Stała referencja do czasu załadowania, żeby memoizacje u odbiorców nie przeliczały się co render.
const PUSTA_LISTA: never[] = []

export function useRepozytorium<K extends NazwaTabeli>(nazwa: K, dostepDoDanychPrywatnych?: (operacja: 'odczyt' | 'edycja') => boolean) {
  const repozytorium = useMemo(() => pobierzRepozytorium(nazwa, dostepDoDanychPrywatnych), [nazwa, dostepDoDanychPrywatnych])
  const wynik = useLiveQuery(() => repozytorium.lista(), [repozytorium]) as MapaTabel[K][] | undefined
  return { dane: wynik ?? (PUSTA_LISTA as unknown as MapaTabel[K][]), repozytorium, gotowe: wynik !== undefined }
}
