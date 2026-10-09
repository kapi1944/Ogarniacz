import { addDays, eachDayOfInterval, endOfWeek, format, parseISO, startOfWeek } from 'date-fns'
import { pl } from 'date-fns/locale'
import type { ZakresDat } from '../../domain/elementyOgarniacza'

export function zakresTygodnia(data: string): ZakresDat {
  const dzien = parseISO(data)
  return {
    od: format(startOfWeek(dzien, { locale: pl, weekStartsOn: 1 }), 'yyyy-MM-dd'),
    do: format(endOfWeek(dzien, { locale: pl, weekStartsOn: 1 }), 'yyyy-MM-dd'),
  }
}

export function czteryTygodnie(data: string): ZakresDat[] {
  const poczatek = parseISO(zakresTygodnia(data).od)
  return Array.from({ length: 4 }, (_, indeks) => zakresTygodnia(format(addDays(poczatek, indeks * 7), 'yyyy-MM-dd')))
}

export function zakresHoryzontu(data: string): ZakresDat {
  const tygodnie = czteryTygodnie(data)
  return { od: tygodnie[0].od, do: tygodnie[3].do }
}

export function datyZakresu(zakres: ZakresDat): string[] {
  return eachDayOfInterval({ start: parseISO(zakres.od), end: parseISO(zakres.do) }).map((dzien) => format(dzien, 'yyyy-MM-dd'))
}
