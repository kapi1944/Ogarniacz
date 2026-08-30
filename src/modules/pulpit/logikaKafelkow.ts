import { addDays, format } from 'date-fns'
import { czyZalegle } from '../../domain/ustaleniaGlosowe'
import type { ElementOgarniacza, ReferencjaZrodla } from '../../domain/elementyOgarniacza'
import type { KonfiguracjaKafelkaPulpitu, RozmiarKafelkaPulpitu } from '../../domain/typy'
import { czasDawkiDoUwagi } from '../../services/LekiService'

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

function dataCzasElementu(element: ElementOgarniacza): string {
  return `${element.data ?? '9999-12-31'}T${element.godzina ?? '99:99'}`
}

function wagaDawki(element: ElementOgarniacza, dataReferencyjna: Date): number {
  if (element.typ !== 'lek' || !element.data || !element.godzina || !element.dane?.statusDawki) return 2
  const czas = czasDawkiDoUwagi(element.data, element.godzina, element.dane.statusDawki, element.dane.odroczoneDo)
  if (element.status === 'otwarty' && czas >= dataReferencyjna.getTime()) return 0
  if (element.status === 'otwarty') return 1
  return 2
}

export function elementyDlaKafelka(kafelek: KonfiguracjaKafelkaPulpitu, elementy: readonly ElementOgarniacza[], dataReferencyjna: Date) {
  const zakres = rozwiazZakresKafelka(kafelek, dataReferencyjna)
  const wZakresie = (element: ElementOgarniacza) => Boolean(element.data && element.data >= zakres.od && element.data <= zakres.do)
  const otwarte = elementy.filter((element) => element.status === 'otwarty')
  const wynik = kafelek.typ === 'pilne'
    ? otwarte.filter((element) => czyZalegle({ id: element.id, date: termin(element), time: element.godzina, priority: element.priorytet, status: element.status }, dataReferencyjna) || element.priorytet === 'asap' || element.priorytet === 'pilny')
    : kafelek.typ === 'zadania'
      ? otwarte.filter((element) => element.typ === 'zadanie' && wZakresie(element))
      : kafelek.typ === 'leki'
        ? elementy.filter((element) => element.typ === 'lek' && wZakresie(element))
      : kafelek.typ === 'wizyty'
          ? otwarte.filter((element) => element.typ === 'wizyta' && wZakresie(element))
          : kafelek.typ === 'finanse'
            ? otwarte.filter((element) => (element.typ === 'platnosc' || element.typ === 'wydatek') && wZakresie(element))
            : kafelek.typ === 'samochod'
              ? (() => {
                  const terminy = otwarte.filter((element) => element.typ === 'samochod')
                  const wZakresieKafelka = terminy.filter(wZakresie)
                  return wZakresieKafelka.length > 0 ? wZakresieKafelka : terminy.filter((element) => element.data && element.data >= zakres.od).slice(0, 1)
                })()
              : kafelek.typ === 'zakupy'
                ? otwarte.filter((element) => element.typ === 'zakupy' && (!element.data || wZakresie(element)))
          : []

  return wynik
    .sort((a, b) => (kafelek.typ === 'leki' ? wagaDawki(a, dataReferencyjna) - wagaDawki(b, dataReferencyjna) : 0)
      || dataCzasElementu(a).localeCompare(dataCzasElementu(b))
      || a.tytul.localeCompare(b.tytul, 'pl') || a.id.localeCompare(b.id))
    .slice(0, kafelek.limit)
}

export function rozwiazDaneKafelka(kafelek: KonfiguracjaKafelkaPulpitu, elementy: readonly ElementOgarniacza[], dataReferencyjna: Date) {
  if (!['zadania', 'pilne', 'leki', 'wizyty', 'finanse', 'samochod', 'zakupy'].includes(kafelek.typ)) {
    return { stan: 'niedostepny' as const, elementy: [] as ElementOgarniacza[] }
  }
  return { stan: 'dostepny' as const, elementy: elementyDlaKafelka(kafelek, elementy, dataReferencyjna) }
}

export function klasaRozmiaruKafelka(rozmiar: RozmiarKafelkaPulpitu) {
  return `strefa-pulpitu--${rozmiar}`
}

export function adresReferencjiZrodla(sourceRef: ReferencjaZrodla): string {
  const adresy = { zadania: '/zadania', leki: '/leki', wizyty: '/wizyty', finanse: '/finanse', rachunki: '/rachunki', samochod: '/samochod', zakupy: '/zakupy' } as const
  const adres = adresy[sourceRef.modul as keyof typeof adresy] ?? '/'
  const parametry = new URLSearchParams({ element: sourceRef.encjaId })
  if (sourceRef.wystapienieId) parametry.set('wystapienie', sourceRef.wystapienieId)
  return `${adres}?${parametry.toString()}`
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
        severity: zalegle ? 'critical' as const : 'warning' as const,
        termin: termin(element),
        typ,
        sourceRef: element.referencjaZrodla,
        createdAt: element.createdAt,
      }] : []
    })
}

function przypomnienieWymagaUwagi(element: ElementOgarniacza, dataReferencyjna: Date): boolean {
  return Boolean(element.przypomnienia?.some((przypomnienie) => przypomnienie.aktywne
    && przypomnienie.czas && new Date(przypomnienie.czas).getTime() <= dataReferencyjna.getTime()))
}

export function alertyLekow(elementy: readonly ElementOgarniacza[], dataReferencyjna: Date): AlertPulpitu[] {
  return elementy
    .filter((element) => element.typ === 'lek' && element.status === 'otwarty' && element.referencjaZrodla && element.data && element.godzina)
    .flatMap((element) => {
      const odroczoneDo = element.typ === 'lek' ? element.dane?.odroczoneDo : undefined
      const czasDawki = new Date(odroczoneDo ?? `${element.data}T${element.godzina}:00`).getTime()
      const minelaGodzina = Number.isFinite(czasDawki) && czasDawki <= dataReferencyjna.getTime()
      const aktywnePrzypomnienie = przypomnienieWymagaUwagi(element, dataReferencyjna)
      if ((!minelaGodzina && !aktywnePrzypomnienie) || !element.referencjaZrodla) return []
      return [{
        id: `${element.id}-${minelaGodzina ? 'overdue' : 'near'}`,
        tytul: element.tytul,
        opis: minelaGodzina ? 'Planowana godzina dawki minęła' : 'Aktywne przypomnienie dawki',
        severity: 'warning' as const,
        termin: `${element.data}T${element.godzina}`,
        typ: minelaGodzina ? 'overdue' as const : 'near' as const,
        sourceRef: element.referencjaZrodla,
        createdAt: element.createdAt,
      }]
    })
}

export function alertyWizyt(elementy: readonly ElementOgarniacza[], dataReferencyjna: Date, horyzontMinuty = 24 * 60): AlertPulpitu[] {
  const teraz = dataReferencyjna.getTime()
  const koniecHoryzontu = teraz + horyzontMinuty * 60_000
  return elementy
    .filter((element) => element.typ === 'wizyta' && element.status === 'otwarty' && element.referencjaZrodla && element.data && element.godzina)
    .flatMap((element) => {
      const czasWizyty = new Date(`${element.data}T${element.godzina}:00`).getTime()
      const aktywnePrzypomnienie = przypomnienieWymagaUwagi(element, dataReferencyjna)
      const bliskaWizyta = Number.isFinite(czasWizyty) && czasWizyty >= teraz && czasWizyty <= koniecHoryzontu
      if ((!aktywnePrzypomnienie && !bliskaWizyta) || !element.referencjaZrodla) return []
      return [{
        id: `${element.id}-near`,
        tytul: element.tytul,
        opis: aktywnePrzypomnienie ? 'Aktywne przypomnienie wizyty' : 'Wizyta w ciągu 24 godzin',
        severity: aktywnePrzypomnienie ? 'warning' as const : 'info' as const,
        termin: `${element.data}T${element.godzina}`,
        typ: 'near' as const,
        sourceRef: element.referencjaZrodla,
        createdAt: element.createdAt,
      }]
    })
}

function dataHoryzontu(dataReferencyjna: Date, dni: number): string {
  return format(addDays(dataReferencyjna, dni), 'yyyy-MM-dd')
}

export function alertyFinansow(elementy: readonly ElementOgarniacza[], dataReferencyjna: Date, horyzontDni = 7): AlertPulpitu[] {
  const dzisiaj = format(dataReferencyjna, 'yyyy-MM-dd')
  const koniecHoryzontu = dataHoryzontu(dataReferencyjna, horyzontDni)
  return elementy.flatMap((element): AlertPulpitu[] => {
    if (!element.referencjaZrodla || element.status !== 'otwarty') return []
    if (element.typ === 'wydatek' && element.dane?.rodzaj === 'budzet') {
      if (element.dane.okres !== dzisiaj.slice(0, 7)) return []
      return [{
        id: `${element.id}-budget`,
        tytul: element.tytul,
        opis: element.opis ?? 'Przekroczony budżet',
        severity: 'warning' as const,
        termin: element.data,
        typ: 'asap' as const,
        sourceRef: element.referencjaZrodla,
        createdAt: element.createdAt,
      }]
    }
    if (element.typ !== 'platnosc' || !element.data || element.dane?.oplacona) return []
    const zalegla = element.godzina
      ? new Date(`${element.data}T${element.godzina}:00`).getTime() < dataReferencyjna.getTime()
      : element.data < dzisiaj
    const bliska = !zalegla && element.data >= dzisiaj && element.data <= koniecHoryzontu
    if (!zalegla && !bliska) return []
    return [{
      id: `${element.id}-${zalegla ? 'overdue' : 'near'}`,
      tytul: element.tytul,
      opis: zalegla ? 'Zaległa płatność' : 'Nadchodząca płatność',
      severity: zalegla ? 'critical' as const : 'warning' as const,
      termin: element.terminGraniczny ?? element.data,
      typ: zalegla ? 'overdue' as const : 'near' as const,
      sourceRef: element.referencjaZrodla,
      createdAt: element.createdAt,
    }]
  })
}

export function alertySamochodu(elementy: readonly ElementOgarniacza[], dataReferencyjna: Date, horyzontDni = 30): AlertPulpitu[] {
  const dzisiaj = format(dataReferencyjna, 'yyyy-MM-dd')
  const koniecHoryzontu = dataHoryzontu(dataReferencyjna, horyzontDni)
  return elementy
    .filter((element) => element.typ === 'samochod' && element.status === 'otwarty' && element.referencjaZrodla && element.data)
    .flatMap((element) => {
      const zalegly = element.data! < dzisiaj
      const bliski = !zalegly && element.data! <= koniecHoryzontu
      if (!zalegly && !bliski || !element.referencjaZrodla) return []
      return [{
        id: `${element.id}-${zalegly ? 'overdue' : 'near'}`,
        tytul: element.tytul,
        opis: zalegly ? 'Termin samochodu minął' : 'Zbliża się termin samochodu',
        severity: zalegly ? 'critical' as const : 'warning' as const,
        termin: element.data,
        typ: zalegly ? 'overdue' as const : 'near' as const,
        sourceRef: element.referencjaZrodla,
        createdAt: element.createdAt,
      }]
    })
}

export function alertyZakupow(elementy: readonly ElementOgarniacza[], dataReferencyjna: Date, horyzontDni = 1): AlertPulpitu[] {
  const dzisiaj = format(dataReferencyjna, 'yyyy-MM-dd')
  const koniecHoryzontu = dataHoryzontu(dataReferencyjna, horyzontDni)
  return elementy
    .filter((element) => element.typ === 'zakupy' && element.status === 'otwarty' && element.referencjaZrodla)
    .flatMap((element) => {
      const zalegle = Boolean(element.data && element.data < dzisiaj)
      const bliskie = Boolean(element.data && element.data >= dzisiaj && element.data <= koniecHoryzontu)
      const wazne = element.priorytet === 'pilny' || element.priorytet === 'asap'
      if (!zalegle && !bliskie && !wazne || !element.referencjaZrodla) return []
      return [{
        id: `${element.id}-${zalegle ? 'overdue' : wazne ? 'asap' : 'near'}`,
        tytul: element.tytul,
        opis: zalegle ? 'Minął termin listy zakupów' : wazne ? 'Priorytetowa lista zakupów' : 'Zbliża się termin listy zakupów',
        severity: zalegle ? 'critical' as const : 'warning' as const,
        termin: element.data,
        typ: zalegle ? 'overdue' as const : wazne ? 'asap' as const : 'near' as const,
        sourceRef: element.referencjaZrodla,
        createdAt: element.createdAt,
      }]
    })
}

export function deduplikujAlerty(alerty: readonly AlertPulpitu[]) {
  return [...new Map(alerty.map((alert) => [`${alert.sourceRef.modul}:${alert.sourceRef.encjaId}:${alert.sourceRef.wystapienieId ?? ''}:${alert.typ}`, alert])).values()]
}

export function rangujAlerty(alerty: readonly AlertPulpitu[]) {
  const wagiTypow = { overdue: 3, asap: 2, near: 1 }
  const wagiWaznosci = { info: 0, warning: 1, critical: 2 }
  return [...alerty].sort((a, b) => wagiTypow[b.typ] - wagiTypow[a.typ]
    || wagiWaznosci[b.severity] - wagiWaznosci[a.severity]
    || (a.termin ?? '9999').localeCompare(b.termin ?? '9999')
    || a.tytul.localeCompare(b.tytul, 'pl')
    || a.id.localeCompare(b.id))
}

export function ograniczAlerty(alerty: readonly AlertPulpitu[], limit: number, pokazWszystkie: boolean) {
  const pelnaLista = [...alerty]
  const widoczne = pokazWszystkie ? pelnaLista : pelnaLista.slice(0, limit)
  return { widoczne, pelnaLista, pozostalo: pelnaLista.length - widoczne.length }
}
