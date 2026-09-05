import type { Miejsce, Zadanie } from '../domain/typy'

export interface FiltrSprawMiejsca {
  miejsceId?: string
  typMiejsca?: string
  lokalizacja?: { szerokosc: number; dlugosc: number }
}

export function pobierzSprawyWedlugMiejsca(zadania: readonly Zadanie[], miejsca: readonly Miejsce[], filtr: FiltrSprawMiejsca): Zadanie[] {
  const typ = filtr.typMiejsca?.trim().toLocaleLowerCase('pl-PL')
  const brakFiltrow = !filtr.miejsceId && !typ && !filtr.lokalizacja
  const dopasowaneIds = new Set(miejsca
    .filter((miejsce) => !filtr.miejsceId || miejsce.id === filtr.miejsceId)
    .filter((miejsce) => !typ || miejsce.typ?.toLocaleLowerCase('pl-PL').includes(typ))
    .filter((miejsce) => !filtr.lokalizacja || miejsce.szerokosc !== undefined && miejsce.dlugosc !== undefined)
    .map((miejsce) => miejsce.id))
  return zadania.filter((zadanie) => zadanie.status !== 'wykonane' && (
    Boolean(brakFiltrow && (zadanie.miejsceId || zadanie.kontekst))
    ||
    Boolean(zadanie.miejsceId && dopasowaneIds.has(zadanie.miejsceId))
    || Boolean(typ && zadanie.kontekst?.toLocaleLowerCase('pl-PL').includes(typ))
  ))
}
