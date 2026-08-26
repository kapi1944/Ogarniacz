/**
 * ${PATCH_ID}
 * Minimalne adaptery reprezentacji Pulpitu. Moduły źródłowe pozostają źródłem prawdy.
 */
import { dniOpoznienia, ocenBudzet, type OcenaBudzetu } from '../../domain/ustaleniaGlosowe'

export interface ElementPulpituIntegracji {
  id: string
  type: 'MEDICATION' | 'APPOINTMENT' | 'PAYMENT' | 'BUDGET_ALERT'
  title: string
  date?: string
  time?: string
  durationMinutes?: number
  sourceRef: { module: string; entityId: string }
  status?: string
  severity?: 'INFO' | 'WARNING' | 'CRITICAL'
  overdueDays?: number
  pulse?: boolean
  meta?: Record<string, unknown>
}

export interface DawkaDoPulpitu {
  id: string
  lekId: string
  nazwa: string
  data: string
  godzina: string
  status?: string
  nastepnePrzypomnienie?: string
}

export interface WizytaDoPulpitu {
  id: string
  tytul: string
  data: string
  godzina?: string
  czasTrwaniaMinuty?: number
  miejsce?: string
}

export interface PlatnoscDoPulpitu {
  id: string
  nazwa: string
  termin: string
  kwota?: number
  status?: string
  cykliczna?: boolean
}

export function dawkaNaPulpit(dawka: DawkaDoPulpitu): ElementPulpituIntegracji {
  return {
    id: `lek:${dawka.id}`,
    type: 'MEDICATION',
    title: dawka.nazwa,
    date: dawka.data,
    time: dawka.godzina,
    sourceRef: { module: 'lek', entityId: dawka.lekId },
    status: dawka.status || 'PENDING',
    meta: { nastepnePrzypomnienie: dawka.nastepnePrzypomnienie },
  }
}

export function wizytaNaPulpit(wizyta: WizytaDoPulpitu): ElementPulpituIntegracji {
  return {
    id: `wizyta:${wizyta.id}`,
    type: 'APPOINTMENT',
    title: wizyta.tytul,
    date: wizyta.data,
    time: wizyta.godzina,
    durationMinutes: wizyta.czasTrwaniaMinuty,
    sourceRef: { module: 'wizyta', entityId: wizyta.id },
    meta: { miejsce: wizyta.miejsce },
  }
}

export function platnoscNaPulpit(
  platnosc: PlatnoscDoPulpitu,
  teraz: Date = new Date(),
): ElementPulpituIntegracji {
  const zalegle = String(platnosc.status || '').toUpperCase() !== 'PAID'
    ? dniOpoznienia({ id: platnosc.id, date: platnosc.termin, status: platnosc.status }, teraz)
    : 0

  return {
    id: `finanse:${platnosc.id}`,
    type: 'PAYMENT',
    title: platnosc.nazwa,
    date: platnosc.termin,
    sourceRef: { module: 'finanse', entityId: platnosc.id },
    status: platnosc.status || 'PENDING',
    severity: zalegle > 0 ? 'CRITICAL' : 'INFO',
    overdueDays: zalegle,
    pulse: zalegle > 0,
    meta: { kwota: platnosc.kwota, cykliczna: Boolean(platnosc.cykliczna) },
  }
}

export function alertBudzetuNaPulpit(
  idBudzetu: string,
  nazwa: string,
  wydano: number,
  limit: number,
): ElementPulpituIntegracji | null {
  const ocena: OcenaBudzetu = ocenBudzet(wydano, limit)
  if (ocena.poziom === 'OK') return null

  return {
    id: `budzet:${idBudzetu}`,
    type: 'BUDGET_ALERT',
    title: `${nazwa}: ${ocena.procent}%`,
    sourceRef: { module: 'finanse', entityId: idBudzetu },
    severity: ocena.poziom === 'WARNING_90' ? 'WARNING' : 'CRITICAL',
    pulse: ocena.poziom === 'OVER_LIMIT',
    meta: { ocena },
  }
}

export function wybierzNajblizsze<T extends { date?: string; time?: string }>(
  elementy: readonly T[],
  limit = 5,
): T[] {
  return [...elementy]
    .filter(x => x.date)
    .sort((a, b) => `${a.date}T${a.time || '23:59'}`.localeCompare(`${b.date}T${b.time || '23:59'}`))
    .slice(0, Math.max(0, limit))
}
