import './kalendarz.css'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'

export function KafelekDnia({ data, dzisiaj, liczbaDzialan, terminy, otworz }: {
  data: string
  dzisiaj: string
  liczbaDzialan?: number
  terminy: string[]
  otworz: (data: string, zrodlo: HTMLButtonElement) => void
}) {
  const dzien = parseISO(data)
  return <button type="button" className={`kafelek-dnia ${data === dzisiaj ? 'kafelek-dnia--dzisiaj' : ''}`}
    aria-label={`Otwórz dzień: ${format(dzien, 'EEEE, d MMMM yyyy', { locale: pl })}`}
    aria-haspopup="dialog" aria-current={data === dzisiaj ? 'date' : undefined}
    onClick={(zdarzenie) => otworz(data, zdarzenie.currentTarget)}>
    <span className="kafelek-dnia__tydzien">{format(dzien, 'EEE', { locale: pl })}</span>
    <strong className="kafelek-dnia__numer">{format(dzien, 'd')}</strong>
    {data === dzisiaj && <span className="kafelek-dnia__dzisiaj">DZIŚ</span>}
    <span className="kafelek-dnia__liczba">{liczbaDzialan === undefined ? 'Ładowanie…' : `Działania: ${liczbaDzialan}`}</span>
    {terminy.map((termin, indeks) => <span className="kafelek-dnia__termin" key={indeks} title={termin}>{termin}</span>)}
  </button>
}
