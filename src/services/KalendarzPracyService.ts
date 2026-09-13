import type { Urlop, WyjatekGrafiku } from '../domain/typy'
import { pobierzPolskieSwieto, type PolskieSwieto } from './PolskieSwietaService'
import { urlopyDnia } from './UrlopyService'

export interface DostepnoscDniaPracy {
  pracuje: boolean
  powod: 'wyjatek' | 'urlop' | 'swieto' | 'grafik'
  swieto?: PolskieSwieto
  urlopy: Urlop[]
}

export function ustalDostepnoscDniaPracy(
  data: string,
  standardowoPracuje: boolean,
  wyjatek: WyjatekGrafiku | undefined,
  urlopy: Urlop[],
): DostepnoscDniaPracy {
  const swieto = pobierzPolskieSwieto(data)
  const aktywneUrlopy = urlopyDnia(urlopy, data)

  if (wyjatek) return { pracuje: wyjatek.pracuje, powod: 'wyjatek', swieto, urlopy: aktywneUrlopy }
  if (aktywneUrlopy.length > 0) return { pracuje: false, powod: 'urlop', swieto, urlopy: aktywneUrlopy }
  if (swieto) return { pracuje: false, powod: 'swieto', swieto, urlopy: aktywneUrlopy }
  return { pracuje: standardowoPracuje, powod: 'grafik', swieto, urlopy: aktywneUrlopy }
}
