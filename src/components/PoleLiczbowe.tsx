import { useId, useState } from 'react'
import { bladLiczby, czyJednostkaWEtykiecie, type OgraniczeniaPolaLiczbowego } from '../domain/liczby'
import './PoleLiczbowe.css'

interface Wlasciwosci extends OgraniczeniaPolaLiczbowego {
  etykieta: string
  wartosc: string
  zmien: (wartosc: string) => void
  wymagane?: boolean
  podpowiedz?: string
}

export function PoleLiczbowe({ etykieta, wartosc, zmien, wymagane, podpowiedz, jednostka, min, max, krok }: Wlasciwosci) {
  const id = useId()
  const [szkic, ustawSzkic] = useState({ zrodlo: wartosc, tekst: wartosc })
  const [sprawdzone, ustawSprawdzone] = useState(false)
  const [odrzucono, ustawOdrzucono] = useState(false)
  const tekst = szkic.zrodlo === wartosc ? szkic.tekst : wartosc
  const blad = odrzucono ? 'Dozwolone są cyfry, znak minus oraz przecinek lub kropka. Wpisz poprawną wartość.'
    : !tekst ? (wymagane ? 'Wpisz liczbę.' : '') : bladLiczby(tekst, { min, max, krok })
  const jednostkaWEtykiecie = jednostka && czyJednostkaWEtykiecie(etykieta, jednostka)
  const widocznaJednostka = jednostka && !jednostkaWEtykiecie

  return <div className="pole pole-liczbowe">
    <label htmlFor={id}>{etykieta}{wymagane && ' *'}</label>
    <div className="pole-liczbowe__wiersz">
      <input id={id} type="text" inputMode={min === undefined || Number(min) < 0 ? 'text' : krok !== undefined && Number.isInteger(krok) && Number.isInteger(Number(min)) ? 'numeric' : 'decimal'} value={tekst} required={wymagane} placeholder={podpowiedz}
        ref={(element) => element?.setCustomValidity(blad)} aria-invalid={(sprawdzone || odrzucono) && Boolean(blad)} aria-describedby={`${widocznaJednostka ? `${id}-jednostka ` : ''}${(sprawdzone || odrzucono) && blad ? `${id}-blad` : ''}`.trim() || undefined}
        onChange={(zdarzenie) => {
          const nowyTekst = zdarzenie.target.value
          if (!/^-?\d*(?:[.,]\d*)?$/.test(nowyTekst)) { ustawOdrzucono(true); return }
          ustawOdrzucono(false)
          const nowaWartosc = nowyTekst.replace(',', '.')
          ustawSzkic({ zrodlo: nowaWartosc, tekst: nowyTekst })
          zmien(nowaWartosc)
        }} onBlur={() => ustawSprawdzone(true)} onInvalid={() => ustawSprawdzone(true)} />
      {widocznaJednostka && <span id={`${id}-jednostka`}>{jednostka}</span>}
      {!wymagane && <button type="button" className="przycisk-ikona" aria-label={`Wyczyść liczbę: ${etykieta}`} onClick={() => { ustawOdrzucono(false); ustawSzkic({ zrodlo: '', tekst: '' }); zmien('') }}>×</button>}
    </div>
    {(sprawdzone || odrzucono) && blad && <small id={`${id}-blad`} role="alert">{blad}</small>}
  </div>
}
