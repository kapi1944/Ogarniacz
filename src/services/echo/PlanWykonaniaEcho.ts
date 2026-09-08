import type { RyzykoDzialania } from '../../domain/typy'
import { czyWymagaPotwierdzenia } from '../RyzykoDzialaniaService'
import type { RejestrNarzedziEcho } from './NarzedziaEcho'
import type { PlanWykonaniaEcho, WywolanieNarzedziaEcho } from './typyEcho'

const kolejnoscRyzyka: Record<RyzykoDzialania, number> = { niskie: 0, umiarkowane: 1, wysokie: 2 }

export function utworzPlanWykonaniaEcho(cel: string, wywolania: readonly WywolanieNarzedziaEcho[], rejestr: RejestrNarzedziEcho): PlanWykonaniaEcho {
  const identyfikatory = new Set(wywolania.map((wywolanie) => wywolanie.id))
  return {
    id: crypto.randomUUID(),
    cel,
    utworzonoAt: new Date().toISOString(),
    status: 'oczekuje',
    kroki: wywolania.map((wywolanie, indeks) => {
      const narzedzie = rejestr.pobierz(wywolanie.nazwa)
      const ryzyko = narzedzie?.ryzyko ?? 'wysokie'
      const zaleznosci = [...new Set(wywolanie.zaleznosci ?? [])].filter((id) => identyfikatory.has(id) && id !== wywolanie.id)
      return {
        id: wywolanie.id,
        kolejnosc: indeks + 1,
        narzedzie: wywolanie.nazwa,
        opis: narzedzie?.opis ?? `Niedostępne narzędzie ${wywolanie.nazwa}`,
        parametry: structuredClone(wywolanie.argumenty),
        zaleznosci,
        ryzyko,
        wymagaPotwierdzenia: czyWymagaPotwierdzenia(ryzyko),
        status: 'oczekuje',
      }
    }),
  }
}

export function najwyzszeRyzykoPlanu(plan: PlanWykonaniaEcho): RyzykoDzialania {
  return plan.kroki.reduce<RyzykoDzialania>((wynik, krok) => kolejnoscRyzyka[krok.ryzyko] > kolejnoscRyzyka[wynik] ? krok.ryzyko : wynik, 'niskie')
}

export function opisPlanuDlaUzytkownika(plan: PlanWykonaniaEcho): string {
  const kroki = plan.kroki.map((krok) => `${krok.kolejnosc}. ${krok.opis.replace(/[.]$/, '')}`).join('; ')
  return `Mogę wykonać ${plan.kroki.length} ${plan.kroki.length === 1 ? 'krok' : 'kroki'}: ${kroki}. Wykonać?`
}
