import { format, getDay, parseISO } from 'date-fns'
import { utworzMetadane } from '../domain/fabryki'
import type { BlokCzasu, GrafikPracy, Nawyk, Urlop, Wizyta, WyjatekGrafiku, Zadanie } from '../domain/typy'
import { czyNawykNaDzien } from './NawykiService'
import { czyPolskieSwieto } from './PolskieSwietaService'
import { czyDataWUrlopie } from './UrlopyService'

interface Przedzial {
  od: number
  do: number
}

export interface DanePlanera {
  data: string
  tryb: 'dzien' | 'wieczor'
  zadania: Zadanie[]
  nawyki: Nawyk[]
  wizyty: Wizyta[]
  bloki: BlokCzasu[]
  grafik: GrafikPracy[]
  wyjatkiGrafiku: WyjatekGrafiku[]
  urlopy: Urlop[]
  odGodziny?: string
}

export interface WynikPlanera {
  propozycje: BlokCzasu[]
  minutyDostepne: number
  minutyObowiazkow: number
  wykorzystanieProcent: number
}

const priorytetWaga = { niski: 0, normalny: 1, wysoki: 2, krytyczny: 3 }

function naMinuty(godzina: string): number {
  const [h = 0, m = 0] = godzina.split(':').map(Number)
  return h * 60 + m
}

function naGodzine(minuty: number): string {
  return `${String(Math.floor(minuty / 60)).padStart(2, '0')}:${String(minuty % 60).padStart(2, '0')}`
}

function isoDnia(data: string, minuty: number): string {
  return `${data}T${naGodzine(minuty)}:00`
}

function odejmijZajete(zakres: Przedzial, zajete: Przedzial[]): Przedzial[] {
  let wolne = [zakres]
  for (const blok of zajete.sort((a, b) => a.od - b.od)) {
    wolne = wolne.flatMap((fragment) => {
      if (blok.do <= fragment.od || blok.od >= fragment.do) return [fragment]
      const wynik: Przedzial[] = []
      if (blok.od > fragment.od) wynik.push({ od: fragment.od, do: blok.od })
      if (blok.do < fragment.do) wynik.push({ od: blok.do, do: fragment.do })
      return wynik
    })
  }
  return wolne.filter((fragment) => fragment.do - fragment.od >= 15)
}

function pracaDnia(dane: DanePlanera): Przedzial | undefined {
  const wyjatek = dane.wyjatkiGrafiku.find((element) => element.data === dane.data)
  if (wyjatek) return wyjatek.pracuje && wyjatek.od && wyjatek.do ? { od: naMinuty(wyjatek.od), do: naMinuty(wyjatek.do) } : undefined
  if (czyPolskieSwieto(dane.data) || dane.urlopy.some((urlop) => czyDataWUrlopie(urlop, dane.data))) return undefined
  const dzien = getDay(parseISO(dane.data))
  const wpis = dane.grafik.find((element) => element.dzienTygodnia === dzien && element.aktywny)
  return wpis ? { od: naMinuty(wpis.od), do: naMinuty(wpis.do) } : undefined
}

function utworzBlok(data: string, tytul: string, typ: BlokCzasu['typ'], od: number, doMinuty: number, powiazanie?: BlokCzasu['powiazanie']): BlokCzasu {
  return {
    ...utworzMetadane(),
    tytul,
    poczatek: isoDnia(data, od),
    koniec: isoDnia(data, doMinuty),
    typ,
    powiazanie,
    elastycznosc: typ === 'zadanie' || typ === 'nawyk' || typ === 'wolne' ? 'elastyczny' : 'twardy',
    status: 'propozycja',
  }
}

export function zaproponujPlan(dane: DanePlanera): WynikPlanera {
  const start = naMinuty(dane.odGodziny ?? (dane.tryb === 'wieczor' ? '16:00' : '07:00'))
  const koniec = naMinuty('22:00')
  const zajete: Przedzial[] = []
  const praca = pracaDnia(dane)
  if (praca) zajete.push(praca)

  dane.wizyty
    .filter((wizyta) => wizyta.status === 'umowiona' && wizyta.data === dane.data && wizyta.godzina)
    .forEach((wizyta) => {
      const od = naMinuty(wizyta.godzina!)
      zajete.push({ od, do: od + 60 })
    })

  dane.bloki
    .filter((blok) => blok.poczatek.startsWith(dane.data) && blok.status !== 'odrzucony')
    .forEach((blok) => zajete.push({ od: naMinuty(format(parseISO(blok.poczatek), 'HH:mm')), do: naMinuty(format(parseISO(blok.koniec), 'HH:mm')) }))

  const wolne = odejmijZajete({ od: start, do: koniec }, zajete)
  const minutyDostepne = wolne.reduce((suma, fragment) => suma + fragment.do - fragment.od, 0)
  const limitObowiazkow = Math.floor(minutyDostepne * 0.75)
  let wykorzystane = 0
  const propozycje: BlokCzasu[] = []
  const elementy = [
    ...dane.zadania
      .filter((zadanie) => zadanie.status !== 'wykonane' && (!zadanie.dataStartu || zadanie.dataStartu <= dane.data))
      .sort((a, b) => priorytetWaga[b.priorytet] - priorytetWaga[a.priorytet] || (a.termin ?? '9999').localeCompare(b.termin ?? '9999'))
      .map((zadanie) => ({ tytul: zadanie.tytul, typ: 'zadanie' as const, minuty: zadanie.szacowanyCzasMin ?? 30, id: zadanie.id })),
    ...dane.nawyki
      .filter((nawyk) => czyNawykNaDzien(nawyk, dane.data))
      .map((nawyk) => ({ tytul: nawyk.nazwa, typ: 'nawyk' as const, minuty: 20, id: nawyk.id })),
  ]

  const kursory = wolne.map((fragment) => ({ ...fragment, kursor: fragment.od }))
  for (const element of elementy) {
    const czas = Math.max(15, Math.min(element.minuty, 180))
    if (wykorzystane + czas > limitObowiazkow) continue
    const fragment = kursory.find((kandydat) => kandydat.kursor + czas <= kandydat.do)
    if (!fragment) continue
    propozycje.push(utworzBlok(dane.data, element.tytul, element.typ, fragment.kursor, fragment.kursor + czas, { typ: element.typ === 'zadanie' ? 'zadania' : 'nawyki', id: element.id }))
    fragment.kursor += czas + 10
    wykorzystane += czas
  }

  for (const fragment of kursory) {
    if (fragment.do - fragment.kursor >= 30) {
      propozycje.push(utworzBlok(dane.data, 'Czas wolny / bufor', 'wolne', fragment.kursor, fragment.do))
    }
  }

  return {
    propozycje: propozycje.sort((a, b) => a.poczatek.localeCompare(b.poczatek)),
    minutyDostepne,
    minutyObowiazkow: wykorzystane,
    wykorzystanieProcent: minutyDostepne ? Math.round((wykorzystane / minutyDostepne) * 100) : 0,
  }
}
