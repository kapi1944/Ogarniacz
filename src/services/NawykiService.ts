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

export function podsumowanieRegularnosciNawyku(nawyk: Nawyk, wpisy: DziennikNawyku[], doDnia: string) {
  const koniec = parseISO(doDnia)
  const daty = Array.from({ length: 90 }, (_, indeks) => format(subDays(koniec, 89 - indeks), 'yyyy-MM-dd'))
  const wykonane = new Set(wpisy.filter((wpis) => wpis.nawykId === nawyk.id && ['pelna', 'minimalna'].includes(wpis.status)).map((wpis) => wpis.data))
  let najlepszaSeria = 0
  let seria = 0
  for (const data of daty) {
    if (!czyNawykNaDzien(nawyk, data)) continue
    if (wykonane.has(data)) {
      seria += 1
      najlepszaSeria = Math.max(najlepszaSeria, seria)
    } else seria = 0
  }
  let aktualnaSeria = 0
  for (const data of [...daty].reverse()) {
    if (!czyNawykNaDzien(nawyk, data)) continue
    if (!wykonane.has(data)) break
    aktualnaSeria += 1
  }
  const ostatnie30 = statystykaNawyku(nawyk, wpisy, doDnia, 30).regularnosc
  const poprzednie30 = statystykaNawyku(nawyk, wpisy, format(subDays(koniec, 30), 'yyyy-MM-dd'), 30).regularnosc
  return {
    daty,
    wykonane,
    aktualnaSeria,
    najlepszaSeria,
    trend: ostatnie30 >= poprzednie30 + 10 ? 'poprawia_sie' as const : ostatnie30 <= poprzednie30 - 10 ? 'spada' as const : 'stabilny' as const,
  }
}
