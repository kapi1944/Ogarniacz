import type { RepozytoriumElementow, ElementOgarniacza } from '../domain/elementyOgarniacza'
import { zadanieLegacyNaElement } from '../domain/adapterZadania'
import type { Zadanie } from '../domain/typy'
import type { HarmonogramDnia } from '../modules/pulpit/logikaOsiCzasu'
import { minutyDnia } from '../modules/pulpit/logikaOsiCzasu'

interface Przedzial {
  od: number
  do: number
}

export interface DanePlanera {
  data: string
  zadania: Zadanie[]
  wydarzenia: ElementOgarniacza[]
  harmonogram: HarmonogramDnia
  odGodziny?: string
}

export type StatusPozycjiDraftu = 'zaplanowana' | 'wymaga_czasu' | 'konflikt'

export interface PozycjaDraftu {
  id: string
  zadanieId: string
  tytul: string
  czasTrwaniaMinuty?: number
  poczatek?: string
  koniec?: string
  status: StatusPozycjiDraftu
  powod?: string
}

export interface WynikPlanera {
  data: string
  pozycje: PozycjaDraftu[]
  minutyDostepne: number
  minutyZaplanowane: number
}

export interface WynikWalidacjiPozycji {
  poprawna: boolean
  powod?: string
  poczatek?: string
  koniec?: string
}

const wagiPriorytetu = { normalny: 0, pilny: 1, asap: 2 }

function naGodzine(minuty: number): string {
  return `${String(Math.floor(minuty / 60)).padStart(2, '0')}:${String(minuty % 60).padStart(2, '0')}`
}

function isoDnia(data: string, minuty: number): string {
  return `${data}T${naGodzine(minuty)}:00`
}

function odejmijPrzedzial(zrodlo: readonly Przedzial[], zajety: Przedzial): Przedzial[] {
  return zrodlo.flatMap((fragment) => {
    if (zajety.do <= fragment.od || zajety.od >= fragment.do) return [fragment]
    const wynik: Przedzial[] = []
    if (zajety.od > fragment.od) wynik.push({ od: fragment.od, do: zajety.od })
    if (zajety.do < fragment.do) wynik.push({ od: zajety.do, do: fragment.do })
    return wynik
  })
}

function przedzialyDostepne(dane: DanePlanera): Przedzial[] {
  const poczatek = Math.max(
    minutyDnia(dane.harmonogram.zakresAktywny.od),
    dane.odGodziny ? minutyDnia(dane.odGodziny) : 0,
  )
  let przedzialy: Przedzial[] = [{ od: poczatek, do: minutyDnia(dane.harmonogram.zakresAktywny.do) }]

  for (const przedzial of dane.harmonogram.przedzialy) {
    const niedozwolony = przedzial.id === 'praca' || przedzial.dostepnosc === 'czesciowa'
    if (niedozwolony) {
      przedzialy = odejmijPrzedzial(przedzialy, { od: minutyDnia(przedzial.od), do: minutyDnia(przedzial.do) })
    }
  }

  const twarde = dane.wydarzenia
    .filter((element) => element.data === dane.data && element.godzina && element.status !== 'anulowany')
    .map((element) => {
      const od = minutyDnia(element.godzina!)
      return { od, do: od + Math.max(1, element.czasTrwaniaMinuty ?? 1) }
    })
    .sort((a, b) => a.od - b.od || a.do - b.do)

  for (const zajety of twarde) przedzialy = odejmijPrzedzial(przedzialy, zajety)
  return przedzialy.filter((przedzial) => przedzial.do > przedzial.od)
}

function terminMinuty(element: ElementOgarniacza<'zadanie'>, data: string): number | undefined {
  const termin = element.terminGraniczny
  if (!termin) return undefined
  const dataTerminu = termin.slice(0, 10)
  if (dataTerminu < data) return -1
  if (dataTerminu > data) return undefined
  const godzina = /T\d{2}:\d{2}/.test(termin) ? termin.slice(11, 16) : '24:00'
  return minutyDnia(godzina)
}

function kandydaci(dane: DanePlanera): ElementOgarniacza<'zadanie'>[] {
  return dane.zadania
    .map(zadanieLegacyNaElement)
    .filter((zadanie) => zadanie.status === 'otwarty')
    .filter((zadanie) => !(zadanie.data && zadanie.godzina && zadanie.trybTerminu === 'o_godzinie'))
    .filter((zadanie) => !dane.zadania.find((zrodlo) => zrodlo.id === zadanie.id)?.dataStartu
      || dane.zadania.find((zrodlo) => zrodlo.id === zadanie.id)!.dataStartu! <= dane.data)
    .sort((a, b) => {
      const terminA = a.terminGraniczny ?? '9999'
      const terminB = b.terminGraniczny ?? '9999'
      const zalegleA = terminA.slice(0, 10) < dane.data
      const zalegleB = terminB.slice(0, 10) < dane.data
      return Number(zalegleB) - Number(zalegleA)
        || wagiPriorytetu[b.priorytet ?? 'normalny'] - wagiPriorytetu[a.priorytet ?? 'normalny']
        || terminA.localeCompare(terminB)
        || a.tytul.localeCompare(b.tytul, 'pl')
        || a.id.localeCompare(b.id)
    })
}

function znajdzSlot(przedzialy: readonly Przedzial[], czas: number, deadline?: number): Przedzial | undefined {
  return przedzialy.find((przedzial) => {
    const koniec = przedzial.od + czas
    return koniec <= przedzial.do && (deadline === undefined || koniec <= deadline)
  })
}

export function generujPlan(dane: DanePlanera): WynikPlanera {
  let wolne = przedzialyDostepne(dane)
  const minutyDostepne = wolne.reduce((suma, przedzial) => suma + przedzial.do - przedzial.od, 0)
  const pozycje: PozycjaDraftu[] = []

  for (const zadanie of kandydaci(dane)) {
    const czas = zadanie.czasTrwaniaMinuty
    if (!czas || czas <= 0) {
      pozycje.push({
        id: `draft:${zadanie.id}`,
        zadanieId: zadanie.id,
        tytul: zadanie.tytul,
        status: 'wymaga_czasu',
        powod: 'Uzupełnij czas trwania przed wyznaczeniem slotu.',
      })
      continue
    }
    const deadline = terminMinuty(zadanie, dane.data)
    const slot = deadline === -1 ? undefined : znajdzSlot(wolne, czas, deadline)
    if (!slot) {
      pozycje.push({
        id: `draft:${zadanie.id}`,
        zadanieId: zadanie.id,
        tytul: zadanie.tytul,
        czasTrwaniaMinuty: czas,
        status: 'konflikt',
        powod: deadline === -1 ? 'Termin zadania już minął.' : 'Brak dostępnego slotu przed terminem.',
      })
      continue
    }
    const koniec = slot.od + czas
    pozycje.push({
      id: `draft:${zadanie.id}`,
      zadanieId: zadanie.id,
      tytul: zadanie.tytul,
      czasTrwaniaMinuty: czas,
      poczatek: isoDnia(dane.data, slot.od),
      koniec: isoDnia(dane.data, koniec),
      status: 'zaplanowana',
    })
    wolne = odejmijPrzedzial(wolne, { od: slot.od, do: koniec })
  }

  return {
    data: dane.data,
    pozycje,
    minutyDostepne,
    minutyZaplanowane: pozycje.reduce((suma, pozycja) => suma + (pozycja.status === 'zaplanowana' ? pozycja.czasTrwaniaMinuty ?? 0 : 0), 0),
  }
}

export const zaproponujPlan = generujPlan

export function walidujPozycjeDraftu(
  dane: DanePlanera,
  pozycja: PozycjaDraftu,
  godzina: string,
  czasTrwaniaMinuty: number,
  pozostale: readonly PozycjaDraftu[] = [],
): WynikWalidacjiPozycji {
  if (!Number.isFinite(czasTrwaniaMinuty) || czasTrwaniaMinuty <= 0) return { poprawna: false, powod: 'Czas trwania musi być większy od zera.' }
  const od = minutyDnia(godzina)
  const doMinuty = od + czasTrwaniaMinuty
  const zadanie = dane.zadania.find((element) => element.id === pozycja.zadanieId)
  if (!zadanie) return { poprawna: false, powod: 'Brak źródłowego Zadania.' }
  const element = zadanieLegacyNaElement(zadanie)
  const deadline = terminMinuty(element, dane.data)
  if (deadline === -1 || deadline !== undefined && doMinuty > deadline) return { poprawna: false, powod: 'Slot kończy się po terminie Zadania.' }

  let wolne = przedzialyDostepne(dane)
  for (const inna of pozostale) {
    if (inna.id === pozycja.id || inna.status !== 'zaplanowana' || !inna.poczatek || !inna.koniec) continue
    wolne = odejmijPrzedzial(wolne, { od: minutyDnia(inna.poczatek.slice(11, 16)), do: minutyDnia(inna.koniec.slice(11, 16)) })
  }
  const miesciSie = wolne.some((przedzial) => od >= przedzial.od && doMinuty <= przedzial.do)
  if (!miesciSie) return { poprawna: false, powod: 'Slot koliduje albo wypada poza pełną dostępnością.' }
  return { poprawna: true, poczatek: isoDnia(dane.data, od), koniec: isoDnia(dane.data, doMinuty) }
}

export function anulujPlan(_wynik: WynikPlanera): undefined {
  return undefined
}

export async function zatwierdzPlan(wynik: WynikPlanera, repozytorium: RepozytoriumElementow<'zadanie'>): Promise<number> {
  const zaplanowane = wynik.pozycje.filter((pozycja) => pozycja.status === 'zaplanowana' && pozycja.poczatek && pozycja.czasTrwaniaMinuty)
  for (const pozycja of zaplanowane) {
    await repozytorium.aktualizuj(pozycja.zadanieId, {
      data: wynik.data,
      godzina: pozycja.poczatek!.slice(11, 16),
      trybTerminu: 'o_godzinie',
      czasTrwaniaMinuty: pozycja.czasTrwaniaMinuty,
    })
  }
  return zaplanowane.length
}
