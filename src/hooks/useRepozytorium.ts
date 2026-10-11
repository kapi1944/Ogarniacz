import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { pobierzRepozytorium } from '../data/Repozytorium'
import type { MapaTabel, NazwaTabeli } from '../domain/typy'

export function useRepozytorium<K extends NazwaTabeli>(nazwa: K, dostepDoPsychoterapii?: (operacja: 'odczyt' | 'edycja') => boolean) {
  const repozytorium = useMemo(() => pobierzRepozytorium(nazwa, dostepDoPsychoterapii), [nazwa, dostepDoPsychoterapii])
  const dane = useLiveQuery(() => repozytorium.lista(), [repozytorium], []) as MapaTabel[K][]
  return { dane, repozytorium, gotowe: dane !== undefined }
}
