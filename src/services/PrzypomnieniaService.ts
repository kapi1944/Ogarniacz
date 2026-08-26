import { addMinutes, parseISO } from 'date-fns'
import { terazIso } from '../domain/fabryki'
import type { Przypomnienie } from '../domain/typy'
import { utworzMetadane } from '../domain/fabryki'
import { nastepnaData } from './PowtarzanieService'

export function czasUruchomienia(przypomnienie: Przypomnienie): Date | undefined {
  if (przypomnienie.odroczoneDo) return parseISO(przypomnienie.odroczoneDo)
  if (!przypomnienie.czas) return undefined
  const baza = parseISO(przypomnienie.czas)
  return przypomnienie.typ === 'wzgledne' ? addMinutes(baza, -(przypomnienie.przesuniecieMin ?? 0)) : baza
}

export function aktywnePrzypomnienia(przypomnienia: Przypomnienie[], teraz = new Date()): Przypomnienie[] {
  return przypomnienia
    .filter((element) => ['nowe', 'dostarczone', 'odroczone', 'eskalowane'].includes(element.stan))
    .filter((element) => {
      const czas = czasUruchomienia(element)
      return czas ? czas.getTime() <= teraz.getTime() : false
    })
    .sort((a, b) => {
      const waga = { niski: 0, normalny: 1, wysoki: 2, krytyczny: 3 }
      return waga[b.priorytet] - waga[a.priorytet]
    })
}

export function odroczPrzypomnienie(przypomnienie: Przypomnienie, minuty: number, teraz = new Date()): Przypomnienie {
  return {
    ...przypomnienie,
    stan: 'odroczone',
    odroczoneDo: addMinutes(teraz, minuty).toISOString(),
    updatedAt: terazIso(),
  }
}

export function zamknijPrzypomnienie(przypomnienie: Przypomnienie): Przypomnienie {
  return { ...przypomnienie, stan: 'wykonane', odroczoneDo: undefined, updatedAt: terazIso() }
}

export function zakonczPrzypomnienie(przypomnienie: Przypomnienie): { wykonane: Przypomnienie; nastepne?: Przypomnienie } {
  const wykonane = zamknijPrzypomnienie(przypomnienie)
  if (!przypomnienie.czas || !przypomnienie.powtarzanie) return { wykonane }
  const kolejnaData = nastepnaData(przypomnienie.czas.slice(0, 10), przypomnienie.powtarzanie)
  if (!kolejnaData) return { wykonane }
  return {
    wykonane,
    nastepne: {
      ...przypomnienie,
      ...utworzMetadane(),
      czas: `${kolejnaData}${przypomnienie.czas.slice(10)}`,
      stan: 'nowe',
      odroczoneDo: undefined,
    },
  }
}
