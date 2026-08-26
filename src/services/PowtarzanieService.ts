import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, format, getDay, parseISO } from 'date-fns'
import type { RegulaPowtarzania } from '../domain/typy'

const formatDaty = (data: Date) => format(data, 'yyyy-MM-dd')

export function nastepnaData(dataBazowa: string, regula?: RegulaPowtarzania): string | undefined {
  if (!regula || regula.typ === 'brak') return undefined
  const data = parseISO(dataBazowa)
  const coIle = Math.max(1, regula.coIle ?? 1)

  if (regula.typ === 'codziennie' || regula.typ === 'co_x_dni') return formatDaty(addDays(data, coIle))
  if (regula.typ === 'tygodniowo') return formatDaty(addWeeks(data, coIle))
  if (regula.typ === 'miesiecznie') return formatDaty(addMonths(data, coIle))
  if (regula.typ === 'rocznie') return formatDaty(addYears(data, coIle))
  if (regula.typ === 'dni_tygodnia') {
    const dni = regula.dniTygodnia?.length ? regula.dniTygodnia : [getDay(data)]
    for (let przesuniecie = 1; przesuniecie <= 14; przesuniecie += 1) {
      const kandydat = addDays(data, przesuniecie)
      if (dni.includes(getDay(kandydat))) return formatDaty(kandydat)
    }
  }
  return undefined
}

export function czyRegulaPrzypadaDnia(regula: RegulaPowtarzania | undefined, data: string, dataStartu: string): boolean {
  if (!regula || regula.typ === 'brak') return data === dataStartu
  const dzien = parseISO(data)
  const start = parseISO(regula.dataStartu ?? dataStartu)
  const roznica = differenceInCalendarDays(dzien, start)
  if (roznica < 0) return false
  const coIle = Math.max(1, regula.coIle ?? 1)
  if (regula.typ === 'codziennie') return true
  if (regula.typ === 'co_x_dni') return roznica % coIle === 0
  if (regula.typ === 'tygodniowo') return roznica % (coIle * 7) === 0
  if (regula.typ === 'dni_tygodnia') return Boolean(regula.dniTygodnia?.includes(getDay(dzien)))
  if (regula.typ === 'miesiecznie') return dzien.getDate() === start.getDate() && (dzien.getMonth() - start.getMonth() + 12 * (dzien.getFullYear() - start.getFullYear())) % coIle === 0
  if (regula.typ === 'rocznie') return dzien.getDate() === start.getDate() && dzien.getMonth() === start.getMonth() && (dzien.getFullYear() - start.getFullYear()) % coIle === 0
  return false
}
