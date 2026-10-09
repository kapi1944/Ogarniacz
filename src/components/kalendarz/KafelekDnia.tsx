import './kalendarz.css'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'

const skrotyDni = ['Nie', 'Pon', 'Wto', 'Śro', 'Czw', 'Pią', 'Sob']

export function KafelekDnia({ data, dzisiaj, liczbaDzialan, terminy, zakresPracy, wybrany, otwieraDialog = true, otworz }: {
  data: string
  dzisiaj: string
  liczbaDzialan?: number
  terminy: string[]
  zakresPracy?: { od: string; do: string }
  wybrany?: boolean
  otwieraDialog?: boolean
  otworz: (data: string, zrodlo: HTMLButtonElement) => void
}) {
  const dzien = parseISO(data)
  return <button type="button" className={`kafelek-dnia ${data === dzisiaj ? 'kafelek-dnia--dzisiaj' : ''} ${wybrany ? 'kafelek-dnia--wybrany' : ''}`}
    aria-label={`${otwieraDialog ? 'Otwórz' : 'Wybierz'} dzień: ${format(dzien, 'EEEE, d MMMM yyyy', { locale: pl })}`}
    aria-haspopup={otwieraDialog ? 'dialog' : undefined} aria-pressed={otwieraDialog ? undefined : wybrany} aria-current={data === dzisiaj ? 'date' : undefined}
    onClick={(zdarzenie) => otworz(data, zdarzenie.currentTarget)}>
    <span className="kafelek-dnia__tydzien">{skrotyDni[dzien.getDay()]}</span>
    <strong className="kafelek-dnia__numer">{format(dzien, 'd')}</strong>
    {data === dzisiaj && <span className="kafelek-dnia__dzisiaj">DZIŚ</span>}
    <span className="kafelek-dnia__liczba">{liczbaDzialan === undefined ? 'Ładowanie…' : liczbaDzialan === 0 ? 'Nic nie zaplanowano' : `Działania: ${liczbaDzialan}`}</span>
    {zakresPracy && <span className="kafelek-dnia__praca">Praca {zakresPracy.od}–{zakresPracy.do}</span>}
    {terminy.map((termin, indeks) => <span className="kafelek-dnia__termin" key={indeks} title={termin}>{termin}</span>)}
  </button>
}
