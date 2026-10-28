import { useId, useState } from 'react'
import { WALUTY, kwotaDoModelu, normalizujKwote } from '../domain/kwoty'
import './PoleKwoty.css'

interface Wlasciwosci {
  etykieta: string
  wartosc: string
  zmien: (wartosc: string) => void
  waluta?: string
  zmienWalute?: (waluta: string) => void
  wymagane?: boolean
  min?: number | string
  max?: number | string
  krok?: number
  modelLiczbowy?: boolean
}

export function PoleKwoty({ etykieta, wartosc, zmien, waluta = 'PLN', zmienWalute, wymagane, min, max, krok, modelLiczbowy }: Wlasciwosci) {
  const id = useId()
  const [sprawdzone, ustawSprawdzone] = useState(false)
  const [szkic, ustawSzkic] = useState({ zrodlo: wartosc, tekst: wartosc })
  const tekst = szkic.zrodlo === wartosc ? szkic.tekst : wartosc
  function wpisz(nowyTekst: string) {
    let nowaWartosc = nowyTekst
    try { if (nowyTekst) nowaWartosc = normalizujKwote(nowyTekst, waluta) } catch { /* Niepełny zapis pozostaje widoczny i nie przechodzi walidacji. */ }
    ustawSzkic({ zrodlo: nowaWartosc, tekst: nowyTekst })
    zmien(nowaWartosc)
  }
  let blad = ''
  try {
    if (!tekst) blad = wymagane ? 'Wpisz kwotę.' : ''
    else {
      const kwota = normalizujKwote(tekst, waluta)
      if (modelLiczbowy) kwotaDoModelu(tekst, waluta)
      const grosze = BigInt(kwota.replace('.', ''))
      if (min !== undefined && grosze < BigInt(normalizujKwote(String(min)).replace('.', ''))) blad = `Kwota nie może być mniejsza niż ${min}.`
      if (max !== undefined && grosze > BigInt(normalizujKwote(String(max)).replace('.', ''))) blad = `Kwota nie może być większa niż ${max}.`
      if (krok && krok > 0) {
        const krokGroszy = BigInt(normalizujKwote(String(krok)).replace('.', ''))
        const poczatek = min === undefined ? 0n : BigInt(normalizujKwote(String(min)).replace('.', ''))
        if (krokGroszy > 0n && (grosze - poczatek) % krokGroszy !== 0n) blad = 'Wpisz kwotę zgodną z dozwolonym krokiem.'
      }
    }
  } catch (przyczyna) { blad = (przyczyna as Error).message }

  return <div className="pole pole-kwoty">
    <label htmlFor={id}>{etykieta}{wymagane && ' *'}</label>
    <div className="pole-kwoty__wiersz">
      <input id={id} type="text" inputMode="decimal" value={tekst} required={wymagane} placeholder="0,00"
        ref={(element) => element?.setCustomValidity(blad)} aria-invalid={sprawdzone && Boolean(blad)} aria-describedby={sprawdzone && blad ? `${id}-blad` : undefined}
        onChange={(zdarzenie) => wpisz(zdarzenie.target.value)} onBlur={() => ustawSprawdzone(true)} onInvalid={() => ustawSprawdzone(true)} />
      {zmienWalute ? <select aria-label={`Waluta: ${etykieta}`} value={waluta} onChange={(zdarzenie) => zmienWalute(zdarzenie.target.value)}>
        {!WALUTY.some((pozycja) => pozycja.kod === waluta) && <option value={waluta}>{waluta}</option>}
        {WALUTY.map((pozycja) => <option key={pozycja.kod} value={pozycja.kod}>{pozycja.kod} — {pozycja.nazwa}</option>)}
      </select> : <span>{waluta}</span>}
      {!wymagane && <button type="button" className="przycisk-ikona" aria-label={`Wyczyść kwotę: ${etykieta}`} onClick={() => wpisz('')}>×</button>}
    </div>
    {sprawdzone && blad && <small id={`${id}-blad`} role="alert">{blad}</small>}
  </div>
}
