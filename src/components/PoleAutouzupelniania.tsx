import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { dopasujPodpowiedzi } from '../services/PodpowiedziFormularzy'
import { useObslugaWstecz } from '../platform/obslugaWstecz'
import './PoleAutouzupelniania.css'

interface Wlasciwosci {
  etykieta: string
  wartosc: string
  zmien: (wartosc: string) => void
  propozycje: readonly string[]
  wymagane?: boolean
  podpowiedz?: string
  opis?: string
}

export function PoleAutouzupelniania({ etykieta, wartosc, zmien, propozycje, wymagane, podpowiedz, opis }: Wlasciwosci) {
  const id = useId()
  const obszar = useRef<HTMLDivElement>(null)
  const pole = useRef<HTMLInputElement>(null)
  const aktywnaOpcja = useRef<HTMLButtonElement>(null)
  const [otwarty, ustawOtwarty] = useState(false)
  const [wszystkie, ustawWszystkie] = useState(true)
  const [aktywna, ustawAktywna] = useState<string>()
  const wyniki = dopasujPodpowiedzi(propozycje, wszystkie ? '' : wartosc)
  const aktywnyIndeks = aktywna === undefined ? -1 : wyniki.indexOf(aktywna)
  const listaWidoczna = otwarty && wyniki.length > 0

  function zamknij() {
    ustawOtwarty(false)
    ustawAktywna(undefined)
  }

  function wybierz(wybrana: string) {
    zmien(wybrana)
    pole.current?.focus({ preventScroll: true })
    zamknij()
  }

  useObslugaWstecz(otwarty, zamknij, 110)
  useEffect(() => {
    if (!otwarty) return
    const pozaPolem = (zdarzenie: PointerEvent) => {
      if (!obszar.current?.contains(zdarzenie.target as Node)) zamknij()
    }
    document.addEventListener('pointerdown', pozaPolem)
    return () => document.removeEventListener('pointerdown', pozaPolem)
  }, [otwarty])
  useEffect(() => {
    if (otwarty) aktywnaOpcja.current?.scrollIntoView?.({ block: 'nearest' })
  }, [aktywna, otwarty])

  return <div className="pole pole-autouzupelniania" ref={obszar} onBlur={(zdarzenie) => {
    if (!zdarzenie.currentTarget.contains(zdarzenie.relatedTarget)) zamknij()
  }}>
    <label htmlFor={id}>{etykieta}{wymagane && ' *'}</label>
    <div className="pole-autouzupelniania__wiersz">
      <input id={id} ref={pole} type="text" role="combobox" autoComplete="off" required={wymagane} placeholder={podpowiedz}
        aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={listaWidoczna} aria-controls={listaWidoczna ? `${id}-lista` : undefined}
        aria-activedescendant={listaWidoczna && aktywnyIndeks >= 0 ? `${id}-opcja-${aktywnyIndeks}` : undefined} aria-describedby={opis ? `${id}-opis` : undefined}
        value={wartosc} onFocus={() => { ustawWszystkie(true); ustawOtwarty(true) }} onChange={(zdarzenie) => {
          zmien(zdarzenie.target.value)
          ustawWszystkie(false)
          ustawAktywna(undefined)
          ustawOtwarty(true)
        }} onKeyDown={(zdarzenie) => {
          if (zdarzenie.nativeEvent.isComposing) return
          if (zdarzenie.key === 'ArrowDown' || zdarzenie.key === 'ArrowUp') {
            zdarzenie.preventDefault()
            const kandydaci = otwarty ? wyniki : dopasujPodpowiedzi(propozycje, '')
            const indeks = otwarty ? aktywnyIndeks : -1
            const nastepny = !kandydaci.length ? -1 : zdarzenie.key === 'ArrowDown' ? (indeks + 1) % kandydaci.length : (indeks <= 0 ? kandydaci.length : indeks) - 1
            if (!otwarty) ustawWszystkie(true)
            ustawOtwarty(true)
            ustawAktywna(kandydaci[nastepny])
          } else if (zdarzenie.key === 'Enter' && otwarty) {
            zdarzenie.preventDefault()
            if (aktywnyIndeks >= 0) wybierz(wyniki[aktywnyIndeks])
            else zamknij()
          } else if (zdarzenie.key === 'Escape' && otwarty) {
            zdarzenie.preventDefault()
            zdarzenie.stopPropagation()
            zamknij()
          }
        }} />
      <button type="button" className="przycisk-ikona" aria-label={`Pokaż podpowiedzi: ${etykieta}`} aria-expanded={listaWidoczna} onClick={() => {
        if (otwarty) zamknij()
        else { ustawWszystkie(true); ustawOtwarty(true); pole.current?.focus({ preventScroll: true }) }
      }}><ChevronDown aria-hidden="true" /></button>
    </div>
    {opis && <small id={`${id}-opis`}>{opis}</small>}
    {listaWidoczna && <div id={`${id}-lista`} role="listbox" aria-label={`Podpowiedzi: ${etykieta}`} className="pole-autouzupelniania__lista">
      {wyniki.map((wynik, indeks) => <button type="button" role="option" id={`${id}-opcja-${indeks}`} key={wynik} tabIndex={-1}
        ref={aktywnyIndeks === indeks ? aktywnaOpcja : undefined} aria-selected={aktywnyIndeks === indeks} onMouseDown={(zdarzenie) => zdarzenie.preventDefault()}
        onClick={() => wybierz(wynik)}>{wynik}</button>)}
    </div>}
    {otwarty && !wyniki.length && <small role="status">Brak pasujących podpowiedzi. Możesz wpisać własną wartość.</small>}
  </div>
}
