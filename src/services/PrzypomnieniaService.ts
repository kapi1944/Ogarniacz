import { addMinutes, parseISO } from 'date-fns'
import { terazIso } from '../domain/fabryki'
import type { Przypomnienie } from '../domain/typy'
import { nastepnaData } from './PowtarzanieService'

const SEPARATOR_WYSTAPIENIA = '::wystapienie::'

function identyfikatorNastepnegoWystapienia(przypomnienie: Przypomnienie, czas: string) {
  const indeksSeparatora = przypomnienie.id.lastIndexOf(SEPARATOR_WYSTAPIENIA)
  const identyfikatorSerii = indeksSeparatora >= 0
    ? przypomnienie.id.slice(0, indeksSeparatora)
    : przypomnienie.id
  return `${identyfikatorSerii}${SEPARATOR_WYSTAPIENIA}${czas}`
}

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

export function nadchodzacePrzypomnienia(przypomnienia: Przypomnienie[], teraz = new Date(), horyzontMinuty = 7 * 24 * 60): Przypomnienie[] {
  const od = teraz.getTime()
  const doCzasu = od + Math.max(0, horyzontMinuty) * 60_000
  return przypomnienia
    .filter((element) => ['nowe', 'dostarczone', 'odroczone', 'eskalowane'].includes(element.stan))
    .filter((element) => {
      const czas = czasUruchomienia(element)?.getTime()
      return czas !== undefined && czas > od && czas <= doCzasu
    })
    .sort((a, b) => czasUruchomienia(a)!.getTime() - czasUruchomienia(b)!.getTime())
}

export function zapiszPowiazanePrzypomnienie(przypomnienia: Przypomnienie[], nowe: Przypomnienie): Przypomnienie {
  const istniejace = przypomnienia.find((element) => element.zrodlo?.typ === nowe.zrodlo?.typ
    && element.zrodlo?.id === nowe.zrodlo?.id
    && (nowe.kluczDeduplikacji ? element.kluczDeduplikacji === nowe.kluczDeduplikacji : !element.kluczDeduplikacji)
    && ['nowe', 'dostarczone', 'odroczone', 'eskalowane'].includes(element.stan))
  if (!istniejace) return nowe
  return {
    ...nowe,
    id: istniejace.id,
    createdAt: istniejace.createdAt,
    stan: 'nowe',
    odroczoneDo: undefined,
  }
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
  if (przypomnienie.stan === 'wykonane') return { wykonane: przypomnienie }
  const wykonane = zamknijPrzypomnienie(przypomnienie)
  if (!przypomnienie.czas || !przypomnienie.powtarzanie) return { wykonane }
  const kolejnaData = nastepnaData(przypomnienie.czas.slice(0, 10), przypomnienie.powtarzanie)
  if (!kolejnaData) return { wykonane }
  const kolejnyCzas = `${kolejnaData}${przypomnienie.czas.slice(10)}`
  return {
    wykonane,
    nastepne: {
      ...przypomnienie,
      id: identyfikatorNastepnegoWystapienia(przypomnienie, kolejnyCzas),
      createdAt: przypomnienie.createdAt,
      updatedAt: wykonane.updatedAt,
      czas: kolejnyCzas,
      stan: 'nowe',
      odroczoneDo: undefined,
    },
  }
}
