import { useRef, useState } from 'react'
import { addDays, format } from 'date-fns'
import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import { KonfliktZmianyZadania, repozytoriumElementowZadan, type ZmianaZadaniaDnia } from '../../data/RepozytoriumElementowZadan'

export function useSzybkieDzialaniaDnia(mozeEdytowac: () => boolean) {
  const blokady = useRef(new Set<string>())
  const [zapisywane, ustawZapisywane] = useState<ReadonlySet<string>>(new Set())
  const [komunikat, ustawKomunikat] = useState<{ typ: 'sukces' | 'blad'; tresc: string }>()
  const [ostatniaZmiana, ustawOstatniaZmiane] = useState<ZmianaZadaniaDnia>()

  const wykonajOperacje = async (id: string, operacja: () => Promise<void>) => {
    if (blokady.current.has(id)) return
    if (!mozeEdytowac()) {
      ustawKomunikat({ typ: 'blad', tresc: 'Nie masz uprawnień do edycji zadań.' })
      return
    }
    blokady.current.add(id)
    ustawZapisywane(new Set(blokady.current))
    try {
      await operacja()
    } catch (blad) {
      ustawKomunikat({ typ: 'blad', tresc: blad instanceof KonfliktZmianyZadania
        ? 'Zadanie zostało zmienione lub usunięte. Otwórz jego aktualne szczegóły i spróbuj ponownie.'
        : 'Nie udało się zapisać zmiany. Spróbuj ponownie.' })
    } finally {
      blokady.current.delete(id)
      ustawZapisywane(new Set(blokady.current))
    }
  }

  const zmien = async (element: ElementOgarniacza, operacja: 'wykonaj' | 'przeloz') => {
    if (element.typ !== 'zadanie') return
    await wykonajOperacje(element.id, async () => {
      const jutro = format(addDays(new Date(), 1), 'yyyy-MM-dd')
      const zmiana = await repozytoriumElementowZadan.zmienZDnia(element, operacja === 'wykonaj'
        ? { status: 'wykonany' }
        : { data: jutro, trybTerminu: element.trybTerminu, godzina: element.godzina })
      ustawOstatniaZmiane(zmiana)
      ustawKomunikat({ typ: 'sukces', tresc: operacja === 'wykonaj' ? `Oznaczono „${element.tytul}” jako wykonane.`
        : `Przełożono „${element.tytul}” na jutro${element.godzina ? ` na ${element.godzina}` : ' bez godziny'}.` })
    })
  }

  const cofnij = async () => {
    if (!ostatniaZmiana) return
    const zmiana = ostatniaZmiana
    await wykonajOperacje(zmiana.po.id, async () => {
      await repozytoriumElementowZadan.cofnijZmianeDnia(zmiana)
      ustawOstatniaZmiane((aktualna) => aktualna === zmiana ? undefined : aktualna)
      ustawKomunikat({ typ: 'sukces', tresc: `Cofnięto zmianę: „${zmiana.przed.tytul}”.` })
    })
  }

  return { zapisywane, komunikat, ostatniaZmiana, zmien, cofnij }
}
