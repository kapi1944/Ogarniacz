import type { RepozytoriumElementow, ElementOgarniacza } from '../domain/elementyOgarniacza'
import { zadanieLegacyNaElement } from '../domain/adapterZadania'
import type { Zadanie } from '../domain/typy'
import { czyZadanieZablokowane } from './ZadaniaService'
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
  preferencje?: PreferencjePlanowania
  zadaniaDoPrzeplanowaniaIds?: readonly string[]
  ograniczenia?: readonly OgraniczenieZadaniaPlanera[]
}

export interface OgraniczenieZadaniaPlanera {
  zadanieId: string
  nieWczesniejNiz?: string
  niePozniejNiz?: string
}

export interface PreferencjePlanowania {
  preferowanaDlugoscBlokuMinuty: number
  minimalnaPrzerwaMinuty: number
  maksymalnieIntensywnychPodRzad: number
  godzinySkupieniaOd?: string
  godzinySkupieniaDo?: string
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

export interface WolneOknoPlanera {
  poczatek: string
  koniec: string
  minuty: number
}

export const DOMYSLNE_PREFERENCJE_PLANOWANIA: PreferencjePlanowania = {
  preferowanaDlugoscBlokuMinuty: 60,
  minimalnaPrzerwaMinuty: 10,
  maksymalnieIntensywnychPodRzad: 2,
  godzinySkupieniaOd: '08:00',
  godzinySkupieniaDo: '12:00',
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

function przedzialyDostepne(dane: DanePlanera, preferencje: PreferencjePlanowania): Przedzial[] {
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
      const czas = Math.max(1, element.czasTrwaniaMinuty ?? 1)
      const margines = czas > 1 ? preferencje.minimalnaPrzerwaMinuty : 0
      return { od: Math.max(0, od - margines), do: od + czas + margines }
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
  const doPrzeplanowania = new Set(dane.zadaniaDoPrzeplanowaniaIds ?? [])
  return dane.zadania
    .map(zadanieLegacyNaElement)
    .filter((zadanie) => zadanie.status === 'otwarty')
    .filter((zadanie) => !czyZadanieZablokowane(dane.zadania.find((zrodlo) => zrodlo.id === zadanie.id)!, dane.zadania))
    .filter((zadanie) => doPrzeplanowania.has(zadanie.id) || !(zadanie.data && zadanie.godzina && zadanie.trybTerminu === 'o_godzinie'))
    .filter((zadanie) => !dane.zadania.find((zrodlo) => zrodlo.id === zadanie.id)?.dataStartu
      || dane.zadania.find((zrodlo) => zrodlo.id === zadanie.id)!.dataStartu! <= dane.data)
    .sort((a, b) => {
      const przeplanowanie = Number(doPrzeplanowania.has(b.id)) - Number(doPrzeplanowania.has(a.id))
      const terminA = a.terminGraniczny ?? '9999'
      const terminB = b.terminGraniczny ?? '9999'
      const zalegleA = terminA.slice(0, 10) < dane.data
      const zalegleB = terminB.slice(0, 10) < dane.data
      return przeplanowanie
        || Number(zalegleB) - Number(zalegleA)
        || wagiPriorytetu[b.priorytet ?? 'normalny'] - wagiPriorytetu[a.priorytet ?? 'normalny']
        || terminA.localeCompare(terminB)
        || a.tytul.localeCompare(b.tytul, 'pl')
        || a.id.localeCompare(b.id)
    })
}

function znajdzSlot(przedzialy: readonly Przedzial[], czas: number, deadline?: number, preferujSkupienie?: Przedzial, nieWczesniejNiz?: number): Przedzial | undefined {
  const dostepne = preferujSkupienie
    ? [...przedzialy.filter((przedzial) => przedzial.od >= preferujSkupienie.od && przedzial.do <= preferujSkupienie.do), ...przedzialy]
    : przedzialy
  return dostepne.map((przedzial) => ({ ...przedzial, od: Math.max(przedzial.od, nieWczesniejNiz ?? przedzial.od) })).find((przedzial) => {
    const koniec = przedzial.od + czas
    return koniec <= przedzial.do && (deadline === undefined || koniec <= deadline)
  })
}

export function generujPlan(dane: DanePlanera): WynikPlanera {
  const preferencje = { ...DOMYSLNE_PREFERENCJE_PLANOWANIA, ...dane.preferencje }
  let wolne = przedzialyDostepne(dane, preferencje)
  const minutyDostepne = wolne.reduce((suma, przedzial) => suma + przedzial.do - przedzial.od, 0)
  const pozycje: PozycjaDraftu[] = []
  const skupienie = preferencje.godzinySkupieniaOd && preferencje.godzinySkupieniaDo
    ? { od: minutyDnia(preferencje.godzinySkupieniaOd), do: minutyDnia(preferencje.godzinySkupieniaDo) }
    : undefined
  let intensywnePodRzad = 0

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
    const ograniczenie = dane.ograniczenia?.find((element) => element.zadanieId === zadanie.id)
    const niePozniejNiz = ograniczenie?.niePozniejNiz ? minutyDnia(ograniczenie.niePozniejNiz) : undefined
    const ostatecznyDeadline = deadline === undefined ? niePozniejNiz : niePozniejNiz === undefined ? deadline : Math.min(deadline, niePozniejNiz)
    const intensywne = zadanie.priorytet === 'asap' || zadanie.priorytet === 'pilny'
    const slot = ostatecznyDeadline === -1 ? undefined : znajdzSlot(wolne, czas, ostatecznyDeadline, intensywne ? skupienie : undefined, ograniczenie?.nieWczesniejNiz ? minutyDnia(ograniczenie.nieWczesniejNiz) : undefined)
    if (!slot) {
      pozycje.push({
        id: `draft:${zadanie.id}`,
        zadanieId: zadanie.id,
        tytul: zadanie.tytul,
        czasTrwaniaMinuty: czas,
        status: 'konflikt',
        powod: ostatecznyDeadline === -1 ? 'Termin zadania już minął.' : 'Brak dostępnego slotu zgodnego z terminem i preferencjami.',
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
    const potrzebnaPrzerwa = intensywne && intensywnePodRzad + 1 >= preferencje.maksymalnieIntensywnychPodRzad
    const doZajecia = Math.min(slot.do, koniec + (potrzebnaPrzerwa ? preferencje.minimalnaPrzerwaMinuty : 0))
    wolne = odejmijPrzedzial(wolne, { od: slot.od, do: doZajecia })
    intensywnePodRzad = intensywne ? (potrzebnaPrzerwa ? 0 : intensywnePodRzad + 1) : 0
  }

  return {
    data: dane.data,
    pozycje,
    minutyDostepne,
    minutyZaplanowane: pozycje.reduce((suma, pozycja) => suma + (pozycja.status === 'zaplanowana' ? pozycja.czasTrwaniaMinuty ?? 0 : 0), 0),
  }
}

export const zaproponujPlan = generujPlan

export function znajdzWolneOkna(dane: DanePlanera, wymaganeMinuty: number, limit = 3): WolneOknoPlanera[] {
  if (!Number.isFinite(wymaganeMinuty) || wymaganeMinuty <= 0) return []
  const preferencje = { ...DOMYSLNE_PREFERENCJE_PLANOWANIA, ...dane.preferencje }
  return przedzialyDostepne(dane, preferencje)
    .filter((przedzial) => przedzial.do - przedzial.od >= wymaganeMinuty)
    .slice(0, Math.max(0, limit))
    .map((przedzial) => ({
      poczatek: isoDnia(dane.data, przedzial.od),
      koniec: isoDnia(dane.data, przedzial.od + wymaganeMinuty),
      minuty: wymaganeMinuty,
    }))
}

export function generujPrzeplanowanie(dane: DanePlanera): WynikPlanera {
  if (!dane.odGodziny) return generujPlan(dane)
  const odMinuty = minutyDnia(dane.odGodziny)
  const otwarteZaplanowane = dane.zadania
    .map(zadanieLegacyNaElement)
    .filter((zadanie) => zadanie.status === 'otwarty' && zadanie.data === dane.data && zadanie.godzina && zadanie.trybTerminu === 'o_godzinie')
  const doPrzeplanowania = otwarteZaplanowane.filter((zadanie) => minutyDnia(zadanie.godzina!) < odMinuty)
  const nieruchome = otwarteZaplanowane.filter((zadanie) => minutyDnia(zadanie.godzina!) >= odMinuty)
  return generujPlan({
    ...dane,
    wydarzenia: [...dane.wydarzenia, ...nieruchome],
    zadaniaDoPrzeplanowaniaIds: doPrzeplanowania.map((zadanie) => zadanie.id),
  })
}

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

  const preferencje = { ...DOMYSLNE_PREFERENCJE_PLANOWANIA, ...dane.preferencje }
  let wolne = przedzialyDostepne(dane, preferencje)
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

export async function zatwierdzPlan(wynik: WynikPlanera, repozytorium: RepozytoriumElementow<'zadanie'>, wybraneId?: readonly string[]): Promise<number> {
  const wybrane = wybraneId ? new Set(wybraneId) : undefined
  const zaplanowane = wynik.pozycje.filter((pozycja) => pozycja.status === 'zaplanowana' && pozycja.poczatek && pozycja.czasTrwaniaMinuty && (!wybrane || wybrane.has(pozycja.id)))
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
