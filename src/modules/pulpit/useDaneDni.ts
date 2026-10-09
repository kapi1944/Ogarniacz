import { useMemo } from 'react'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import type { ZakresDat } from '../../domain/elementyOgarniacza'
import { datyZakresu } from '../dzisiaj/logikaHoryzontu'
import { useElementyPlanuDnia } from './useElementyPlanuDnia'
import { utworzDaneDnia } from './logikaDanychDnia'

export function useDaneDni(zakres: ZakresDat) {
  const { ustawienia } = useAplikacja()
  const { dane: wyjatki } = useRepozytorium('wyjatkiGrafiku')
  const { dane: urlopy } = useRepozytorium('urlopy')
  const dane = useElementyPlanuDnia(zakres)
  const dni = useMemo(() => datyZakresu({ od: zakres.od, do: zakres.do }).map((data) => utworzDaneDnia(data, dane?.elementy ?? [], ustawienia.harmonogram, wyjatki, urlopy)),
    [zakres.od, zakres.do, dane, ustawienia.harmonogram, wyjatki, urlopy])
  return { dni, blad: dane?.blad ?? false, ladowanie: dane === undefined }
}
