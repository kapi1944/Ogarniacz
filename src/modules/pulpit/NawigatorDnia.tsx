import { addDays, format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { dzisiajIso } from '../../domain/fabryki'

export function NawigatorDnia({ data, zmienDate }: { data: string; zmienDate: (data: string) => void }) {
  const dzisiaj = dzisiajIso()
  const przesun = (liczbaDni: number) => zmienDate(format(addDays(parseISO(data), liczbaDni), 'yyyy-MM-dd'))

  return (
    <div className="nawigator-dnia" role="group" aria-label="Nawigacja wybranego dnia">
      <div className="nawigator-dnia__akcje">
        <button type="button" className="przycisk-ikona nawigator-dnia__strzalka" onClick={() => przesun(-1)} title="Poprzedni dzień" aria-label="Poprzedni dzień">
          <ChevronLeft aria-hidden="true" />
        </button>
        <button type="button" className="przycisk przycisk--drugorzedny" disabled={data === dzisiaj} onClick={() => zmienDate(dzisiaj)}>
          Dzisiaj
        </button>
        <label className="wybor-daty-pulpitu">
          <CalendarDays aria-hidden="true" />
          <span className="wybor-daty-pulpitu__wartosc" aria-hidden="true">{format(parseISO(data), 'd MMM yyyy', { locale: pl })}</span>
          <input aria-label="Wybierz datę osi czasu" type="date" value={data} onChange={(zdarzenie) => zdarzenie.target.value && zmienDate(zdarzenie.target.value)} />
        </label>
        <button type="button" className="przycisk-ikona nawigator-dnia__strzalka" onClick={() => przesun(1)} title="Następny dzień" aria-label="Następny dzień">
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
