/**
 * ${PATCH_ID}
 *
 * Stabilny, czysty kontrakt ustaleń z rozmowy głosowej.
 * Nie zmienia istniejących enumów domenowych OPEN/DONE i NORMAL/URGENT/ASAP.
 * Ujednolica jedynie sposób prezentacji/rankingu na Pulpicie.
 */

export type SekcjaPulpitu = 'TIMELINE' | 'TODAY_NO_TIME' | 'BELOW'

export interface ElementDoRankinguPulpitu {
  id: string
  title?: string
  date?: string
  time?: string
  deadline?: string
  deadlineMode?: string
  priority?: string
  status?: string
  completedAt?: string | null
}

export interface OcenaBudzetu {
  wykorzystanie: number
  procent: number
  poziom: 'OK' | 'WARNING_90' | 'CRITICAL_95' | 'OVER_LIMIT'
}

export const PROG_BUDZETU_OSTRZEZENIE = 0.9
export const PROG_BUDZETU_KRYTYCZNY = 0.95

export const KOLEJNOSC_MODULOW_DRUGIEGO_RZUTU = [
  'poczekalnia',
  'notatki-dzienne',
  'samochod',
  'zakupy',
  'integracje',
] as const

function lokalnaData(data: string, czas: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(czas)) return null
  const wynik = new Date(`${data}T${czas}:00`)
  return Number.isNaN(wynik.getTime()) ? null : wynik
}

function terminElementu(element: ElementDoRankinguPulpitu): Date | null {
  if (element.deadline) {
    const deadline = new Date(element.deadline)
    if (!Number.isNaN(deadline.getTime())) return deadline
  }
  if (!element.date) return null
  return lokalnaData(element.date, element.time || '23:59')
}

export function czyWykonane(element: ElementDoRankinguPulpitu): boolean {
  const status = String(element.status || '').toUpperCase()
  return Boolean(element.completedAt) || ['DONE', 'COMPLETED', 'WYKONANE'].includes(status)
}

export function czyZalegle(
  element: ElementDoRankinguPulpitu,
  teraz: Date = new Date(),
): boolean {
  if (czyWykonane(element)) return false
  const termin = terminElementu(element)
  return Boolean(termin && termin.getTime() < teraz.getTime())
}

export function dniOpoznienia(
  element: ElementDoRankinguPulpitu,
  teraz: Date = new Date(),
): number {
  if (!czyZalegle(element, teraz)) return 0
  const termin = terminElementu(element)
  if (!termin) return 0
  return Math.max(1, Math.ceil((teraz.getTime() - termin.getTime()) / 86_400_000))
}

export function sekcjaDlaElementuPulpitu(
  element: ElementDoRankinguPulpitu,
  dzisiaj: string,
): SekcjaPulpitu {
  const mode = String(element.deadlineMode || '').toUpperCase()
  if (mode === 'AT_TIME' && element.time) return 'TIMELINE'
  if (mode === 'END_OF_DAY') return 'TODAY_NO_TIME'
  if (element.date === dzisiaj && !element.time) return 'TODAY_NO_TIME'
  return 'BELOW'
}

function wagaPriorytetu(priority: string | undefined): number {
  switch (String(priority || '').toUpperCase()) {
    case 'ASAP': return 500
    case 'URGENT':
    case 'HIGH': return 350
    case 'NORMAL':
    case 'MEDIUM': return 200
    case 'LOW': return 50
    default: return 150
  }
}

export function wynikRankinguPulpitu(
  element: ElementDoRankinguPulpitu,
  teraz: Date = new Date(),
): number {
  if (czyWykonane(element)) return -10_000

  let wynik = wagaPriorytetu(element.priority)
  if (czyZalegle(element, teraz)) wynik += 450

  const termin = terminElementu(element)
  if (termin) {
    const roznica = termin.getTime() - teraz.getTime()
    if (roznica >= 0 && roznica <= 2 * 60 * 60 * 1000) wynik += 220
    else if (roznica > 0 && roznica <= 24 * 60 * 60 * 1000) wynik += 120
    else if (roznica > 0 && roznica <= 7 * 24 * 60 * 60 * 1000) wynik += 40
  }

  return wynik
}

export function sortujElementyPulpitu<T extends ElementDoRankinguPulpitu>(
  elementy: readonly T[],
  teraz: Date = new Date(),
): T[] {
  return [...elementy].sort((a, b) => {
    const roznica = wynikRankinguPulpitu(b, teraz) - wynikRankinguPulpitu(a, teraz)
    if (roznica !== 0) return roznica

    const terminA = terminElementu(a)?.getTime() ?? Number.POSITIVE_INFINITY
    const terminB = terminElementu(b)?.getTime() ?? Number.POSITIVE_INFINITY
    if (terminA !== terminB) return terminA - terminB

    return String(a.title || a.id).localeCompare(String(b.title || b.id), 'pl')
  })
}

export function ocenBudzet(
  wydano: number,
  limit: number,
  progOstrzezenia = PROG_BUDZETU_OSTRZEZENIE,
  progKrytyczny = PROG_BUDZETU_KRYTYCZNY,
): OcenaBudzetu {
  const bezpiecznyLimit = Number.isFinite(limit) && limit > 0 ? limit : 0
  const bezpieczneWydano = Number.isFinite(wydano) ? Math.max(0, wydano) : 0
  const wykorzystanie = bezpiecznyLimit > 0 ? bezpieczneWydano / bezpiecznyLimit : 0

  let poziom: OcenaBudzetu['poziom'] = 'OK'
  if (wykorzystanie > 1) poziom = 'OVER_LIMIT'
  else if (wykorzystanie >= progKrytyczny) poziom = 'CRITICAL_95'
  else if (wykorzystanie >= progOstrzezenia) poziom = 'WARNING_90'

  return {
    wykorzystanie,
    procent: Math.round(wykorzystanie * 1000) / 10,
    poziom,
  }
}
