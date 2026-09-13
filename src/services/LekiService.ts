import { addDays, differenceInCalendarDays, format, getDay, parseISO } from 'date-fns'
import { terazIso, utworzMetadane } from '../domain/fabryki'
import type { DawkaLeku, DziennikLeku, Lek, TrybDawkowaniaLeku } from '../domain/typy'

export interface DawkaDnia {
  idWystapienia: string
  lek: Lek
  dawka: DawkaLeku
  data: string
  planowanaGodzina: string
  status: DziennikLeku['status']
  wpis?: DziennikLeku
}

interface ZaplanowanaDawka {
  dawka: DawkaLeku
  kluczWystapienia?: string
}

function poprawnaGodzina(godzina: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(godzina)
}

function minutyDnia(godzina: string): number {
  const [godziny, minuty] = godzina.split(':').map(Number)
  return godziny * 60 + minuty
}

function godzinaZMinut(minuty: number): string {
  const wartosc = ((minuty % 1440) + 1440) % 1440
  return `${String(Math.floor(wartosc / 60)).padStart(2, '0')}:${String(wartosc % 60).padStart(2, '0')}`
}

export function trybDawkowania(lek: Lek): TrybDawkowaniaLeku {
  return lek.trybDawkowania ?? 'konkretne_godziny'
}

/** Zamienia stary zapis godzin na dawki z deterministycznym, trwałym id. */
export function dawkiLeku(lek: Lek): DawkaLeku[] {
  if (lek.dawki?.length) return lek.dawki.filter((dawka) => poprawnaGodzina(dawka.godzina)).sort((a, b) => a.godzina.localeCompare(b.godzina))
  return lek.godziny
    .filter(poprawnaGodzina)
    .map((godzina) => ({ id: `starsza-dawka:${lek.id}:${godzina}`, godzina, ilosc: lek.zuzycieNaDawke, instrukcja: lek.dawkaInstrukcja || undefined }))
}

export function proponujGodzinyDawek(liczbaDawek: number, od: string, doGodziny: string): string[] {
  if (!poprawnaGodzina(od) || !poprawnaGodzina(doGodziny) || !Number.isInteger(liczbaDawek) || liczbaDawek < 1) return []
  const poczatek = minutyDnia(od)
  const koniec = minutyDnia(doGodziny)
  if (koniec <= poczatek) return []
  if (liczbaDawek === 1) return [od]
  return Array.from({ length: liczbaDawek }, (_, indeks) => godzinaZMinut(Math.round(poczatek + (koniec - poczatek) * indeks / (liczbaDawek - 1))))
}

export function idWystapieniaDawki(lekId: string, data: string, dawkaId: string, kluczWystapienia?: string): string {
  const prefiksStarszejDawki = `starsza-dawka:${lekId}:`
  const idBazowy = dawkaId.startsWith(prefiksStarszejDawki) ? `${lekId}:${data}:${dawkaId.slice(prefiksStarszejDawki.length)}` : `${lekId}:${data}:${dawkaId}`
  return kluczWystapienia ? `${idBazowy}:${kluczWystapienia}` : idBazowy
}

export function czyLekZaplanowanyNaDzien(lek: Lek, data: string): boolean {
  if (lek.dataOd && data < lek.dataOd) return false
  if (lek.dataDo && data > lek.dataDo) return false
  const dzien = parseISO(data)
  if (Number.isNaN(dzien.getTime())) return false
  if (lek.dniTygodnia?.length && !lek.dniTygodnia.includes(getDay(dzien))) return false
  if (lek.coIleDni && lek.coIleDni > 1 && lek.dataOd) return differenceInCalendarDays(dzien, parseISO(lek.dataOd)) % lek.coIleDni === 0
  return true
}

export function graniceLokalnegoDnia(data: string): { od: Date; do: Date } | undefined {
  const od = parseISO(data)
  if (Number.isNaN(od.getTime())) return undefined
  return { od, do: addDays(od, 1) }
}

function dawkiInterwalowe(lek: Lek, data: string): ZaplanowanaDawka[] {
  const definicja = dawkiLeku(lek)[0]
  const interwal = lek.interwalGodzin
  const pierwszaGodzina = lek.pierwszaGodzina ?? definicja?.godzina
  if (!definicja || !interwal || interwal < 1 || !pierwszaGodzina || !poprawnaGodzina(pierwszaGodzina)) return []
  const poczatek = new Date(`${lek.dataOd ?? data}T${pierwszaGodzina}:00`).getTime()
  const graniceDnia = graniceLokalnegoDnia(data)
  if (!graniceDnia) return []
  const dzienOd = graniceDnia.od.getTime()
  const dzienDo = graniceDnia.do.getTime()
  const krok = interwal * 60 * 60_000
  const pierwszyIndeks = Math.max(0, Math.ceil((dzienOd - poczatek) / krok))
  const wynik: ZaplanowanaDawka[] = []
  for (let indeks = pierwszyIndeks; poczatek + indeks * krok < dzienDo; indeks += 1) {
    const czas = poczatek + indeks * krok
    if (czas >= dzienOd) wynik.push({ dawka: { ...definicja, godzina: format(new Date(czas), 'HH:mm') }, kluczWystapienia: `interwal-${indeks}` })
  }
  return wynik
}

function zaplanowaneDawki(lek: Lek, data: string): ZaplanowanaDawka[] {
  return trybDawkowania(lek) === 'co_x_godzin' ? dawkiInterwalowe(lek, data) : dawkiLeku(lek).map((dawka) => ({ dawka }))
}

export function dawkiZaplanowaneNaDzien(lek: Lek, data: string): DawkaLeku[] {
  return zaplanowaneDawki(lek, data).map(({ dawka }) => dawka)
}

function zuzycieDnia(lek: Lek, data: string): number {
  if (!czyLekZaplanowanyNaDzien(lek, data)) return 0
  return dawkiZaplanowaneNaDzien(lek, data).reduce((suma, dawka) => suma + (typeof dawka.ilosc === 'number' && dawka.ilosc > 0 ? dawka.ilosc : 0), 0)
}

export function przewidywanaDataWyczerpania(lek: Lek, odDnia: string): string | undefined {
  if (!lek.zapasJednostek || lek.zapasJednostek <= 0 || Number.isNaN(parseISO(odDnia).getTime())) return undefined
  let pozostalo = lek.zapasJednostek
  let data = odDnia
  for (let indeks = 0; indeks < 3660; indeks += 1) {
    const zuzycie = zuzycieDnia(lek, data)
    if (zuzycie > 0) {
      pozostalo -= zuzycie
      if (pozostalo <= 0) return data
    }
    data = format(addDays(parseISO(data), 1), 'yyyy-MM-dd')
    if (lek.dataDo && data > lek.dataDo) return undefined
  }
  return undefined
}

export function generujDawkiDnia(leki: Lek[], wpisy: DziennikLeku[], data: string): DawkaDnia[] {
  const wpisyDnia = wpisy.filter((wpis) => wpis.data === data)
  return leki
    .filter((lek) => lek.aktywny && !lek.usunietoAt && czyLekZaplanowanyNaDzien(lek, data))
    .flatMap((lek) => zaplanowaneDawki(lek, data).map(({ dawka, kluczWystapienia }) => {
      const idWystapienia = idWystapieniaDawki(lek.id, data, dawka.id, kluczWystapienia)
      const interwalowa = Boolean(kluczWystapienia)
      const wpis = wpisyDnia.find((element) => element.lekId === lek.id && (
        element.id === idWystapienia
        || (!element.dawkaId && element.planowanaGodzina === dawka.godzina)
        || (interwalowa && element.dawkaId === dawka.id && element.planowanaGodzina === dawka.godzina)
        || (!interwalowa && element.dawkaId === dawka.id)
      ))
      return { idWystapienia, lek, dawka, data, planowanaGodzina: dawka.godzina, status: wpis?.status ?? 'oczekuje', wpis }
    }))
    .sort((a, b) => a.planowanaGodzina.localeCompare(b.planowanaGodzina) || a.idWystapienia.localeCompare(b.idWystapienia))
}

export function zapiszStatusDawki(dawka: DawkaDnia, status: DziennikLeku['status'], odroczoneDo?: string): DziennikLeku {
  const obecny = dawka.wpis
  return {
    ...(obecny ?? utworzMetadane(dawka.idWystapienia)),
    id: obecny?.id ?? dawka.idWystapienia,
    lekId: dawka.lek.id,
    dawkaId: dawka.dawka.id,
    data: dawka.data,
    planowanaGodzina: obecny?.planowanaGodzina ?? dawka.planowanaGodzina,
    status,
    reakcjaAt: terazIso(),
    odroczoneDo: status === 'odroczone' ? odroczoneDo : undefined,
    updatedAt: terazIso(),
  }
}

export function czasDawkiDoUwagi(data: string, godzina: string, status: DziennikLeku['status'], odroczoneDo?: string): number {
  return status === 'odroczone' && odroczoneDo ? new Date(odroczoneDo).getTime() : new Date(`${data}T${godzina}:00`).getTime()
}

export function wyznaczNastepnaDawke(dawki: readonly DawkaDnia[], teraz = new Date()): DawkaDnia | undefined {
  const czasTeraz = teraz.getTime()
  const czasDawki = (dawka: DawkaDnia) => dawka.status === 'odroczone' && dawka.wpis?.odroczoneDo ? new Date(dawka.wpis.odroczoneDo).getTime() : new Date(`${dawka.data}T${dawka.planowanaGodzina}:00`).getTime()
  return [...dawki]
    .filter((dawka) => dawka.status === 'oczekuje' || dawka.status === 'odroczone')
    .filter((dawka) => Number.isFinite(czasDawki(dawka)) && czasDawki(dawka) >= czasTeraz)
    .sort((a, b) => czasDawki(a) - czasDawki(b) || a.idWystapienia.localeCompare(b.idWystapienia))[0]
}
