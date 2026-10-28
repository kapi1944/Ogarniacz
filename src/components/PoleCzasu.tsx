import { useEffect, useId, useRef, useState } from 'react'
import { Clock, X } from 'lucide-react'
import { useObslugaWstecz } from '../platform/obslugaWstecz'
import './PoleCzasu.css'

interface Wlasciwosci {
  etykieta: string
  wartosc: string
  zmien: (wartosc: string) => void
  wymagane?: boolean
  min?: string
  max?: string
  krok?: number
}

function sekundy(czas: string) {
  const [godzina, minuta, sekunda = 0] = czas.split(':').map(Number)
  return godzina * 3600 + minuta * 60 + sekunda
}

function bladCzasu(wartosc: string, { wymagane, min, max, krok = 60 }: Partial<Wlasciwosci> = {}) {
  if (!wartosc) return wymagane ? 'Wpisz godzinę.' : ''
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(wartosc)) return 'Wpisz prawidłową godzinę w formacie HH:mm (00:00–23:59).'
  const czas = sekundy(wartosc)
  const pozaZakresem = min && max && min > max
    ? czas < sekundy(min) && czas > sekundy(max)
    : (min && czas < sekundy(min)) || (max && czas > sekundy(max))
  if (pozaZakresem) return `Wybierz godzinę w dozwolonym zakresie${min ? ` od ${min}` : ''}${max ? ` do ${max}` : ''}.`
  if (krok > 0 && Math.abs((czas - sekundy(min ?? '00:00')) / krok - Math.round((czas - sekundy(min ?? '00:00')) / krok)) > 1e-8) return 'Wybierz godzinę zgodną z dozwolonym krokiem czasu.'
  return ''
}

export function PoleCzasu({ etykieta, wartosc, zmien, wymagane, min, max, krok }: Wlasciwosci) {
  const id = useId()
  const pole = useRef<HTMLInputElement>(null)
  const obszar = useRef<HTMLDivElement>(null)
  const [otwarty, ustawOtwarty] = useState(false)
  const [sprawdzone, ustawSprawdzone] = useState(false)
  const ograniczenia = { wymagane, min, max, krok }
  const blad = bladCzasu(wartosc, ograniczenia)
  const [godzina = '', minuta = ''] = wartosc.split(':')

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

  return <div ref={obszar} className="pole pole-czasu" onBlur={(zdarzenie) => {
    if (!zdarzenie.currentTarget.contains(zdarzenie.relatedTarget)) ustawOtwarty(false)
  }} onKeyDown={(zdarzenie) => {
    if (otwarty && zdarzenie.key === 'Escape') {
      zdarzenie.preventDefault()
      zdarzenie.stopPropagation()
      zamknij()
    }
  }}>
    <label htmlFor={id}>{etykieta}{wymagane && ' *'}</label>
    <div className="pole-czasu__wiersz">
      <input id={id} ref={(element) => { pole.current = element; element?.setCustomValidity(blad) }} type="text" inputMode="text" autoComplete="off" placeholder="HH:mm" required={wymagane}
        value={wartosc} aria-invalid={sprawdzone && Boolean(blad)} aria-describedby={`${id}-pomoc${sprawdzone && blad ? ` ${id}-blad` : ''}`}
        onChange={(zdarzenie) => zmien(zdarzenie.target.value)} onBlur={() => ustawSprawdzone(true)} onInvalid={() => ustawSprawdzone(true)} />
      <button type="button" className="przycisk-ikona" aria-label={`Zegar: ${etykieta}`} aria-expanded={otwarty} aria-controls={`${id}-zegar`} onClick={() => ustawOtwarty(!otwarty)}><Clock aria-hidden="true" /></button>
      {!wymagane && <button type="button" className="przycisk-ikona" aria-label={`Wyczyść godzinę: ${etykieta}`} onClick={() => { zmien(''); zamknij() }}><X aria-hidden="true" /></button>}
    </div>
    <small id={`${id}-pomoc`}>HH:mm, zegar 24-godzinny</small>
    {sprawdzone && blad && <small id={`${id}-blad`} role="alert">{blad}</small>}
    {otwarty && <div id={`${id}-zegar`} className="pole-czasu__wybor" role="group" aria-label={`Wybór godziny: ${etykieta}`}>
      <label>Godziny<select value={godzina} onChange={(zdarzenie) => zmien(`${zdarzenie.target.value}:${minuta}`)}>
        <option value="">—</option>
        {Array.from({ length: 24 }, (_, indeks) => {
          const godzinaOpcji = String(indeks).padStart(2, '0')
          const dozwolona = Array.from({ length: 60 }, (_, indeksMinuty) => `${godzinaOpcji}:${String(indeksMinuty).padStart(2, '0')}`).some((czas) => !bladCzasu(czas, ograniczenia))
          return <option key={godzinaOpcji} value={godzinaOpcji} disabled={!dozwolona}>{godzinaOpcji}</option>
        })}
      </select></label>
      <label>Minuty<select value={minuta} onChange={(zdarzenie) => zmien(`${godzina}:${zdarzenie.target.value}`)}>
        <option value="">—</option>
        {Array.from({ length: 60 }, (_, indeks) => {
          const minutaOpcji = String(indeks).padStart(2, '0')
          return <option key={minutaOpcji} value={minutaOpcji} disabled={/^\d{2}$/.test(godzina) && Boolean(bladCzasu(`${godzina}:${minutaOpcji}`, ograniczenia))}>{minutaOpcji}</option>
        })}
      </select></label>
      <button type="button" className="przycisk przycisk--drugorzedny" onClick={zamknij}>Zamknij zegar</button>
    </div>}
  </div>
}
