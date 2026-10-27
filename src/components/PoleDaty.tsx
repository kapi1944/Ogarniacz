import { useEffect, useId, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { addMonths, differenceInCalendarDays, format, getDaysInMonth, parseISO } from 'date-fns'
import './PoleDaty.css'
import { useObslugaWstecz } from '../platform/obslugaWstecz'

const miesiace = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']

function dataDoTekstu(data: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data.split('-').reverse().join('.') : data
}

function tekstDoDaty(tekst: string) {
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(tekst)) return undefined
  const [dzien, miesiac, rok] = tekst.split('.').map(Number)
  const przestepny = rok % 4 === 0 && (rok % 100 !== 0 || rok % 400 === 0)
  const dni = [31, przestepny ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return rok >= 1 && miesiac >= 1 && miesiac <= 12 && dzien >= 1 && dzien <= dni[miesiac - 1]
    ? tekst.split('.').reverse().join('-') : undefined
}

interface Wlasciwosci {
  etykieta: string
  wartosc: string
  zmien: (wartosc: string) => void
  wymagane?: boolean
  min?: string
  max?: string
  krok?: number
}

export function PoleDaty({ etykieta, wartosc, zmien, wymagane, min, max, krok }: Wlasciwosci) {
  const id = useId()
  const pole = useRef<HTMLInputElement>(null)
  const obszar = useRef<HTMLDivElement>(null)
  const [szkic, ustawSzkic] = useState({ zrodlo: wartosc, tekst: dataDoTekstu(wartosc) })
  const [otwarty, ustawOtwarty] = useState(false)
  const [sprawdzone, ustawSprawdzone] = useState(false)
  const [miesiac, ustawMiesiac] = useState(() => (tekstDoDaty(dataDoTekstu(wartosc)) ?? format(new Date(), 'yyyy-MM-dd')).slice(0, 7))
  const tekst = szkic.zrodlo === wartosc ? szkic.tekst : dataDoTekstu(wartosc)
  const data = tekstDoDaty(tekst)

  function bladZakresu(wybrana: string) {
    if (min && wybrana < min) return `Wybierz datę nie wcześniejszą niż ${dataDoTekstu(min)}.`
    if (max && wybrana > max) return `Wybierz datę nie późniejszą niż ${dataDoTekstu(max)}.`
    if (krok && krok > 0 && differenceInCalendarDays(parseISO(wybrana), parseISO(min ?? '1970-01-01')) % krok !== 0) return 'Wybierz datę zgodną z dozwolonym odstępem dni.'
    return ''
  }

  const blad = !tekst ? (wymagane ? 'Wpisz datę.' : '') : !data ? 'Wpisz prawidłową datę w formacie DD.MM.RRRR.' : bladZakresu(data)

  function wpisz(nowyTekst: string) {
    const nowaData = tekstDoDaty(nowyTekst)
    const nowaWartosc = nowyTekst === '' ? '' : nowaData ?? wartosc
    ustawSzkic({ zrodlo: nowaWartosc, tekst: nowyTekst })
    if (nowaData || !nowyTekst) zmien(nowaWartosc)
  }

  function zamknij() {
    ustawOtwarty(false)
    pole.current?.focus({ preventScroll: true })
  }

  useObslugaWstecz(otwarty, zamknij, 110)
  useEffect(() => {
    if (!otwarty) return
    const pozaPolem = (zdarzenie: PointerEvent) => {
      if (!obszar.current?.contains(zdarzenie.target as Node)) ustawOtwarty(false)
    }
    document.addEventListener('pointerdown', pozaPolem)
    return () => document.removeEventListener('pointerdown', pozaPolem)
  }, [otwarty])

  const pierwszy = parseISO(`${miesiac}-01`)
  const poczatek = (pierwszy.getDay() + 6) % 7
  const rok = Number(miesiac.slice(0, 4))

  return <div ref={obszar} className="pole pole-daty" onBlur={(zdarzenie) => {
    if (!zdarzenie.currentTarget.contains(zdarzenie.relatedTarget)) ustawOtwarty(false)
  }} onKeyDown={(zdarzenie) => {
    if (otwarty && zdarzenie.key === 'Escape') {
      zdarzenie.preventDefault()
      zdarzenie.stopPropagation()
      zamknij()
    }
  }}>
    <label htmlFor={id}>{etykieta}{wymagane && ' *'}</label>
    <div className="pole-daty__wiersz">
      <input id={id} ref={(element) => { pole.current = element; element?.setCustomValidity(blad) }} type="text" inputMode="text" autoComplete="off" placeholder="DD.MM.RRRR" required={wymagane}
        value={tekst} aria-invalid={sprawdzone && Boolean(blad)} aria-describedby={`${id}-pomoc${sprawdzone && blad ? ` ${id}-blad` : ''}`}
        onChange={(zdarzenie) => wpisz(zdarzenie.target.value)} onBlur={() => ustawSprawdzone(true)} onInvalid={() => ustawSprawdzone(true)} />
      <button type="button" className="przycisk-ikona" aria-label={`Kalendarz: ${etykieta}`} aria-expanded={otwarty} aria-controls={`${id}-kalendarz`} onClick={() => {
        if (!otwarty) ustawMiesiac((data ?? format(new Date(), 'yyyy-MM-dd')).slice(0, 7))
        ustawOtwarty(!otwarty)
      }}><CalendarDays aria-hidden="true" /></button>
      {!wymagane && <button type="button" className="przycisk-ikona" aria-label={`Wyczyść datę: ${etykieta}`} onClick={() => { wpisz(''); zamknij() }}><X aria-hidden="true" /></button>}
    </div>
    <small id={`${id}-pomoc`}>DD.MM.RRRR, np. 27.10.2026</small>
    {sprawdzone && blad && <small id={`${id}-blad`} role="alert">{blad}</small>}
    {otwarty && <div id={`${id}-kalendarz`} className="pole-daty__kalendarz" role="group" aria-label={`Wybór daty: ${etykieta}`}>
      <div className="pole-daty__nawigacja">
        <button type="button" className="przycisk-ikona" aria-label="Poprzedni miesiąc" disabled={miesiac === '0001-01'} onClick={() => ustawMiesiac(format(addMonths(pierwszy, -1), 'yyyy-MM'))}><ChevronLeft aria-hidden="true" /></button>
        <label><span className="sr-only">Miesiąc</span><select value={pierwszy.getMonth()} onChange={(zdarzenie) => ustawMiesiac(`${miesiac.slice(0, 4)}-${String(Number(zdarzenie.target.value) + 1).padStart(2, '0')}`)}>{miesiace.map((nazwa, indeks) => <option key={nazwa} value={indeks}>{nazwa}</option>)}</select></label>
        <label><span className="sr-only">Rok</span><input type="number" min="1" max="9999" value={rok} onChange={(zdarzenie) => {
          const nowyRok = Number(zdarzenie.target.value)
          if (Number.isInteger(nowyRok) && nowyRok >= 1 && nowyRok <= 9999) ustawMiesiac(`${String(nowyRok).padStart(4, '0')}${miesiac.slice(4)}`)
        }} /></label>
        <button type="button" className="przycisk-ikona" aria-label="Następny miesiąc" disabled={miesiac === '9999-12'} onClick={() => ustawMiesiac(format(addMonths(pierwszy, 1), 'yyyy-MM'))}><ChevronRight aria-hidden="true" /></button>
      </div>
      <div className="pole-daty__dni">
        {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map((dzien) => <span key={dzien} aria-hidden="true">{dzien}</span>)}
        {Array.from({ length: poczatek }, (_, indeks) => <span key={`puste-${indeks}`} />)}
        {Array.from({ length: getDaysInMonth(pierwszy) }, (_, indeks) => {
          const wybrana = `${miesiac}-${String(indeks + 1).padStart(2, '0')}`
          return <button type="button" key={wybrana} aria-label={dataDoTekstu(wybrana)} aria-pressed={data === wybrana} aria-current={wybrana === format(new Date(), 'yyyy-MM-dd') ? 'date' : undefined}
            disabled={Boolean(bladZakresu(wybrana))} onClick={() => { wpisz(dataDoTekstu(wybrana)); ustawSprawdzone(true); zamknij() }}>{indeks + 1}</button>
        })}
      </div>
      <button type="button" className="przycisk przycisk--drugorzedny" onClick={zamknij}>Zamknij kalendarz</button>
    </div>}
  </div>
}
