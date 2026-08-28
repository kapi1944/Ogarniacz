import { addDays, format } from 'date-fns'
import { czyZalegle } from '../../domain/ustaleniaGlosowe'
import type { ElementOgarniacza, ReferencjaZrodla } from '../../domain/elementyOgarniacza'
import type { KonfiguracjaKafelkaPulpitu, RozmiarKafelkaPulpitu } from '../../domain/typy'

export interface AlertPulpitu {
  id: string
  tytul: string
  opis?: string
  severity: 'info' | 'warning' | 'critical'
  termin?: string
  typ: 'overdue' | 'asap' | 'near'
  sourceRef: ReferencjaZrodla
  createdAt: string
}

export function rozwiazZakresKafelka(kafelek: KonfiguracjaKafelkaPulpitu, dataReferencyjna: Date) {
  const dni = kafelek.zakresCzasu === 'today' ? 0 : kafelek.zakresCzasu === '3d' ? 2 : kafelek.zakresCzasu === '7d' ? 6 : 29
  return { od: format(dataReferencyjna, 'yyyy-MM-dd'), do: format(addDays(dataReferencyjna, dni), 'yyyy-MM-dd') }
}

export function sortujKafelki(kafelki: readonly KonfiguracjaKafelkaPulpitu[]) {
  return [...kafelki]
    .filter((kafelek) => kafelek.widoczny)
    .sort((a, b) => a.kolejnosc - b.kolejnosc || a.typ.localeCompare(b.typ, 'pl') || a.id.localeCompare(b.id))
}

function termin(element: ElementOgarniacza) {
  return element.terminGraniczny ?? element.data
}

export function elementyDlaKafelka(kafelek: KonfiguracjaKafelkaPulpitu, elementy: readonly ElementOgarniacza[], dataReferencyjna: Date) {
  const zakres = rozwiazZakresKafelka(kafelek, dataReferencyjna)
  const otwarte = elementy.filter((element) => element.status === 'otwarty')
  const wynik = kafelek.typ === 'pilne'
    ? otwarte.filter((element) => czyZalegle({ id: element.id, date: termin(element), time: element.godzina, priority: element.priorytet, status: element.status }, dataReferencyjna) || element.priorytet === 'asap' || element.priorytet === 'pilny')
    : kafelek.typ === 'zadania'
      ? otwarte.filter((element) => {
        const dataTerminu = termin(element)
        return Boolean(dataTerminu && dataTerminu >= zakres.od && dataTerminu <= zakres.do)
      })
      : []

  return wynik
    .sort((a, b) => (termin(a) ?? '9999').localeCompare(termin(b) ?? '9999') || a.tytul.localeCompare(b.tytul, 'pl') || a.id.localeCompare(b.id))
    .slice(0, kafelek.limit)
}

export function rozwiazDaneKafelka(kafelek: KonfiguracjaKafelkaPulpitu, elementy: readonly ElementOgarniacza[], dataReferencyjna: Date) {
  if (kafelek.typ !== 'zadania' && kafelek.typ !== 'pilne') {
    return { stan: 'niedostepny' as const, elementy: [] as ElementOgarniacza[] }
  }
  return { stan: 'dostepny' as const, elementy: elementyDlaKafelka(kafelek, elementy, dataReferencyjna) }
}

export function klasaRozmiaruKafelka(rozmiar: RozmiarKafelkaPulpitu) {
  return `strefa-pulpitu--${rozmiar}`
}

export function alertyZadan(elementy: readonly ElementOgarniacza[], dataReferencyjna: Date): AlertPulpitu[] {
  return elementy
    .filter((element) => element.status === 'otwarty' && element.referencjaZrodla)
    .flatMap((element) => {
      const zalegle = czyZalegle({ id: element.id, date: termin(element), time: element.godzina, priority: element.priorytet, status: element.status }, dataReferencyjna)
      const typ = zalegle ? 'overdue' : element.priorytet === 'asap' ? 'asap' : null
      return typ && element.referencjaZrodla ? [{
        id: `${element.id}-${typ}`,
        tytul: element.tytul,
        opis: zalegle ? 'Zaległe zadanie' : 'Wymaga działania ASAP',
        severity: zalegle ? 'critical' : 'warning',
        termin: termin(element),
        typ,
        sourceRef: element.referencjaZrodla,
        createdAt: element.createdAt,
      }] : []
    })
}

export function deduplikujAlerty(alerty: readonly AlertPulpitu[]) {
  return [...new Map(alerty.map((alert) => [`${alert.sourceRef.modul}:${alert.sourceRef.encjaId}:${alert.typ}`, alert])).values()]
}

export function rangujAlerty(alerty: readonly AlertPulpitu[]) {
  const wagi = { overdue: 3, asap: 2, near: 1 }
  return [...alerty].sort((a, b) => wagi[b.typ] - wagi[a.typ]
    || (a.termin ?? '9999').localeCompare(b.termin ?? '9999')
    || a.tytul.localeCompare(b.tytul, 'pl')
    || a.id.localeCompare(b.id))
}

export function ograniczAlerty(alerty: readonly AlertPulpitu[], limit: number, pokazWszystkie: boolean) {
  const pelnaLista = [...alerty]
  const widoczne = pokazWszystkie ? pelnaLista : pelnaLista.slice(0, limit)
  return { widoczne, pelnaLista, pozostalo: pelnaLista.length - widoczne.length }
}
