import { useState } from 'react'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { utworzMetadane } from '../../domain/fabryki'
import type { ZakresZmianyHarmonogramu } from '../../domain/typy'
import { useDaneDni } from './useDaneDni'
import { utworzNowaReguleHarmonogramu, type EdycjaHarmonogramuDnia } from './logikaOsiCzasu'

const repozytoriumWyjatkow = pobierzRepozytorium('wyjatkiGrafiku')

function ograniczMinuty(wartosc: number): number {
  return Number.isFinite(wartosc) ? Math.min(180, Math.max(0, Math.round(wartosc))) : 0
}

export function usePlanDniaPulpitu(data: string) {
  const { ustawienia, zapiszUstawienia } = useAplikacja()
  const [edycjaHarmonogramu, ustawEdycjeHarmonogramu] = useState(false)
  const [komunikat, ustawKomunikat] = useState('')
  const dane = useDaneDni({ od: data, do: data })
  const { harmonogram, wyjatekDnia, elementy: elementyDnia, elementyOsi } = dane.dni[0]
  const daneDnia = dane.ladowanie ? undefined : { ...dane.dni[0], blad: dane.blad }

  const zapiszWyjatekDnia = async (edycja: EdycjaHarmonogramuDnia) => {
    await repozytoriumWyjatkow.zapisz({
      ...(wyjatekDnia ?? utworzMetadane()), data, pracuje: edycja.pracuje,
      od: edycja.pracuje ? edycja.odPracy : undefined, do: edycja.pracuje ? edycja.doPracy : undefined,
      dojazdDoPracyMinuty: edycja.pracuje ? ograniczMinuty(edycja.dojazdDoPracyMinuty) : 0,
      powrotZPracyMinuty: edycja.pracuje ? ograniczMinuty(edycja.powrotZPracyMinuty) : 0,
      dostepnoscDojazdu: edycja.dostepnoscDojazdu, opis: edycja.opis?.trim() || undefined,
    })
  }

  const zapiszZmianeHarmonogramu = async (edycja: EdycjaHarmonogramuDnia, zakres: ZakresZmianyHarmonogramu) => {
    if (zakres === 'tylko_ten_dzien') {
      await zapiszWyjatekDnia(edycja)
      ustawKomunikat('Zapisano wyjątek wyłącznie dla wybranego dnia.')
    } else {
      await zapiszUstawienia({ harmonogram: utworzNowaReguleHarmonogramu(ustawienia.harmonogram, data, edycja) })
      if (wyjatekDnia) await repozytoriumWyjatkow.usun(wyjatekDnia.id)
      ustawKomunikat('Zapisano nową domyślną regułę harmonogramu.')
    }
    ustawEdycjeHarmonogramu(false)
  }

  const przelaczDostepnosc = async () => {
    await zapiszWyjatekDnia({
      pracuje: harmonogram.pracuje, odPracy: harmonogram.odPracy, doPracy: harmonogram.doPracy,
      dojazdDoPracyMinuty: harmonogram.dojazdDoPracyMinuty, powrotZPracyMinuty: harmonogram.powrotZPracyMinuty,
      dostepnoscDojazdu: harmonogram.dostepnoscDojazdu === 'pelna' ? 'czesciowa' : 'pelna', opis: wyjatekDnia?.opis,
    })
    ustawKomunikat('Dostępność dojazdów zmieniono tylko dla wybranego dnia.')
  }

  const usunWyjatek = async () => {
    if (!wyjatekDnia) return
    await repozytoriumWyjatkow.usun(wyjatekDnia.id)
    ustawKomunikat('Przywrócono domyślną regułę harmonogramu dla tego dnia.')
  }


  return { daneDnia, elementyDnia, elementyOsi, harmonogram, wyjatekDnia, edycjaHarmonogramu, ustawEdycjeHarmonogramu, komunikat, ustawKomunikat, zapiszZmianeHarmonogramu, przelaczDostepnosc, usunWyjatek }
}