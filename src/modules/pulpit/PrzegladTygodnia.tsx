import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { SkupienieDnia, type ZrodloSkupieniaDnia } from '../../components/kalendarz/SkupienieDnia'
import { useDaneDni } from './useDaneDni'
import { HoryzontTygodniowy } from '../dzisiaj/HoryzontTygodniowy'
import { zakresHoryzontu } from '../dzisiaj/logikaHoryzontu'
import { PlanWybranegoDnia } from './PlanWybranegoDnia'

export function PrzegladTygodnia({ dzisiaj }: { dzisiaj: string }) {
  const [wybranyDzien, ustawWybranyDzien] = useState<{ data: string; zrodlo: ZrodloSkupieniaDnia } | null>(null)
  const dane = useDaneDni(zakresHoryzontu(dzisiaj))
  const otworz = (data: string, element: HTMLButtonElement) => ustawWybranyDzien({ data, zrodlo: { element, prostokat: element.getBoundingClientRect() } })
  return <div className="pulpit-sekcja--tydzien">
    <HoryzontTygodniowy dzisiaj={dzisiaj} dni={dane.dni} blad={dane.blad} ladowanie={dane.ladowanie} otworz={otworz} />
    {wybranyDzien && <SkupienieDnia tytul={format(parseISO(wybranyDzien.data), 'EEEE, d MMMM yyyy', { locale: pl })} zrodlo={wybranyDzien.zrodlo} zamknieto={() => ustawWybranyDzien(null)}>
      {(zamknij) => <PlanWybranegoDnia data={wybranyDzien.data} zamknij={zamknij} />}
    </SkupienieDnia>}
  </div>
}
