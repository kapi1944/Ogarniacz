import { addDays, format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { dzisiajIso } from '../../domain/fabryki'

export function NawigatorDnia({ data, zmienDate }: { data: string; zmienDate: (data: string) => void }) {
  const dzisiaj = dzisiajIso()
  const przesun = (liczbaDni: number) => zmienDate(format(addDays(parseISO(data), liczbaDni), 'yyyy-MM-dd'))

  return (
    <section className="nawigator-dnia" aria-label="Nawigacja wybranego dnia">
      <div>
        <span className="nawigator-dnia__kontekst">Aktywny dzień osi czasu</span>
        <strong>{format(parseISO(data), 'EEEE, d MMMM yyyy', { locale: pl })}</strong>
      </div>
      <div className="nawigator-dnia__akcje">
        <button type="button" className="przycisk-ikona" onClick={() => przesun(-1)} title="Poprzedni dzień">
          <ChevronLeft aria-hidden="true" />
        </button>
        <button type="button" className="przycisk przycisk--drugorzedny" disabled={data === dzisiaj} onClick={() => zmienDate(dzisiaj)}>
          Dzisiaj
        </button>
        <label className="wybor-daty-pulpitu">
          <CalendarDays aria-hidden="true" />
          <span className="sr-only">Wybierz datę osi czasu</span>
          <input aria-label="Wybierz datę osi czasu" type="date" value={data} onChange={(zdarzenie) => zdarzenie.target.value && zmienDate(zdarzenie.target.value)} />
        </label>
        <button type="button" className="przycisk-ikona" onClick={() => przesun(1)} title="Następny dzień">
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
