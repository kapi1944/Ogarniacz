import { format } from 'date-fns'
import { nasluchujZmianDanych } from '../data/ZdarzeniaDanych'
import { pobierzRepozytorium } from '../data/Repozytorium'
import type { ElementOgarniacza } from '../domain/elementyOgarniacza'
import type { Przypomnienie, Zadanie } from '../domain/typy'
import { platforma } from '../platform/platforma'
import { DostawcaLekowPulpitu } from '../providers/DostawcaLekowPulpitu'
import { DostawcaWizytPulpitu } from '../providers/DostawcaWizytPulpitu'
import { DostawcaZadanPulpitu } from '../providers/DostawcaZadanPulpitu'
import { czasUruchomienia } from './PrzypomnieniaService'

export interface ElementTodayWidgetSnapshot {
  id: string
  typ: 'zadanie' | 'planer' | 'lek' | 'wizyta'
  tytul: string
  termin?: string
}

export interface ZadanieTodayWidgetSnapshot {
  id: string
  tytul: string
  termin?: string
  priorytet: Zadanie['priorytet']
}

export interface PrzypomnienieTodayWidgetSnapshot {
  id: string
  tytul: string
  termin: string
}

export interface TodayWidgetSnapshot {
  data: string
  najblizszeElementyDnia: ElementTodayWidgetSnapshot[]
  pilneIZalegleZadania: ZadanieTodayWidgetSnapshot[]
  najblizszePrzypomnienie?: PrzypomnienieTodayWidgetSnapshot
  updatedAt: string
}

type ZapisSnapshotu = (dane: TodayWidgetSnapshot) => Promise<boolean>

const tabeleSnapshotu = new Set([
  'zadania',
  'blokiCzasu',
  'leki',
  'dziennikLekow',
  'wizyty',
  'przypomnienia',
])

function terminElementu(element: ElementOgarniacza): string | undefined {
  if (!element.data) return element.terminGraniczny
  return `${element.data}T${element.godzina ?? '23:59'}:00`
}

function naElementSnapshotu(element: ElementOgarniacza): ElementTodayWidgetSnapshot {
  return {
    id: element.id,
    typ: element.typ === 'wydarzenie' ? 'planer' : element.typ as ElementTodayWidgetSnapshot['typ'],
    tytul: element.tytul,
    termin: terminElementu(element),
  }
}

function czyPilneLubZalegle(zadanie: Zadanie, data: string): boolean {
  const termin = zadanie.termin ?? zadanie.terminGranicznyElementu
  return zadanie.status !== 'wykonane'
    && (['wysoki', 'krytyczny'].includes(zadanie.priorytet) || Boolean(termin && termin.slice(0, 10) < data))
}

export class WidgetSnapshotService {
  constructor(
    private readonly zapiszSnapshot: ZapisSnapshotu = (dane) => platforma.migawkiWidgetow.zapisz(dane),
    private readonly teraz: () => Date = () => new Date(),
  ) {}

  async utworzSnapshot(): Promise<TodayWidgetSnapshot> {
    const teraz = this.teraz()
    const data = format(teraz, 'yyyy-MM-dd')
    const zakres = { od: data, do: data }
    const [zadaniaDnia, leki, wizyty, bloki, wszystkieZadania, przypomnienia] = await Promise.all([
      new DostawcaZadanPulpitu().pobierzElementy(zakres),
      new DostawcaLekowPulpitu().pobierzElementy(zakres),
      new DostawcaWizytPulpitu().pobierzElementy(zakres),
      pobierzRepozytorium('blokiCzasu').lista(),
      pobierzRepozytorium('zadania').lista(),
      pobierzRepozytorium('przypomnienia').lista(),
    ])

    const elementyPlanera: ElementOgarniacza<'wydarzenie'>[] = bloki
      .filter((blok) => blok.poczatek.startsWith(data) && !['wykonany', 'odrzucony'].includes(blok.status))
      .map((blok) => ({
        id: `planer:${blok.id}`,
        typ: 'wydarzenie',
        tytul: blok.tytul,
        data,
        godzina: blok.poczatek.slice(11, 16),
        status: 'otwarty',
        createdAt: blok.createdAt,
        updatedAt: blok.updatedAt,
      }))

    const najblizszeElementyDnia = [...zadaniaDnia, ...elementyPlanera, ...leki, ...wizyty]
      .filter((element) => element.status === 'otwarty')
      .sort((a, b) => (terminElementu(a) ?? '9999').localeCompare(terminElementu(b) ?? '9999'))
      .slice(0, 8)
      .map(naElementSnapshotu)

    const pilneIZalegleZadania = wszystkieZadania
      .filter((zadanie) => czyPilneLubZalegle(zadanie, data))
      .sort((a, b) =>
        (a.termin ?? a.terminGranicznyElementu ?? '9999').localeCompare(b.termin ?? b.terminGranicznyElementu ?? '9999'))
      .slice(0, 5)
      .map((zadanie) => ({
        id: zadanie.id,
        tytul: zadanie.tytul,
        termin: zadanie.termin ?? zadanie.terminGranicznyElementu,
        priorytet: zadanie.priorytet,
      }))

    const najblizszePrzypomnienie = przypomnienia
      .map((przypomnienie) => ({ przypomnienie, termin: czasUruchomienia(przypomnienie) }))
      .filter((element): element is { przypomnienie: Przypomnienie; termin: Date } =>
        Boolean(element.termin && element.termin.getTime() >= teraz.getTime()))
      .sort((a, b) => a.termin.getTime() - b.termin.getTime())[0]

    return {
      data,
      najblizszeElementyDnia,
      pilneIZalegleZadania,
      najblizszePrzypomnienie: najblizszePrzypomnienie ? {
        id: najblizszePrzypomnienie.przypomnienie.id,
        tytul: najblizszePrzypomnienie.przypomnienie.tytul,
        termin: najblizszePrzypomnienie.termin.toISOString(),
      } : undefined,
      updatedAt: teraz.toISOString(),
    }
  }

  async aktualizuj(): Promise<TodayWidgetSnapshot> {
    const snapshot = await this.utworzSnapshot()
    await this.zapiszSnapshot(snapshot)
    return snapshot
  }
}

let zakonczNasluchiwanie: (() => void) | undefined

export function inicjalizujWidgetSnapshotService(): void {
  if (zakonczNasluchiwanie || !platforma.migawkiWidgetow.dostepne()) return
  const usluga = new WidgetSnapshotService()
  let oczekujaceOdswiezenie: number | undefined
  const zaplanuj = () => {
    if (oczekujaceOdswiezenie !== undefined) window.clearTimeout(oczekujaceOdswiezenie)
    oczekujaceOdswiezenie = window.setTimeout(() => {
      oczekujaceOdswiezenie = undefined
      void usluga.aktualizuj()
    }, 100)
  }
  zakonczNasluchiwanie = nasluchujZmianDanych((tabela) => {
    if (tabeleSnapshotu.has(tabela)) zaplanuj()
  })
  void usluga.aktualizuj()
}
