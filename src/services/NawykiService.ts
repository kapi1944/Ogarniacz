import { differenceInCalendarDays, format, getDay, parseISO, subDays } from 'date-fns'
import type { DziennikNawyku, Nawyk } from '../domain/typy'

export function czyNawykNaDzien(nawyk: Nawyk, data: string): boolean {
  if (!nawyk.aktywny) return false
  const dzien = getDay(parseISO(data))
  if (nawyk.czestotliwosc === 'codziennie') return true
  if (nawyk.czestotliwosc === 'dni_robocze') return dzien >= 1 && dzien <= 5
  if (nawyk.czestotliwosc === 'wybrane_dni') return nawyk.dniTygodnia.includes(dzien)
  if (nawyk.czestotliwosc === 'interwal') return differenceInCalendarDays(parseISO(data), parseISO(nawyk.createdAt)) % Math.max(1, nawyk.interwalDni ?? 1) === 0
  return true
}

export function statystykaNawyku(nawyk: Nawyk, wpisy: DziennikNawyku[], doDnia: string, liczbaDni: number) {
  const koniec = parseISO(doDnia)
  const daty = Array.from({ length: liczbaDni }, (_, indeks) => format(subDays(koniec, indeks), 'yyyy-MM-dd'))
  const planowane = daty.filter((data) => czyNawykNaDzien(nawyk, data))
  const zrealizowane = wpisy.filter((wpis) => wpis.nawykId === nawyk.id && planowane.includes(wpis.data) && ['pelna', 'minimalna'].includes(wpis.status))
  return { planowane: planowane.length, zrealizowane: zrealizowane.length, regularnosc: planowane.length ? Math.round((zrealizowane.length / planowane.length) * 100) : 100 }
}
