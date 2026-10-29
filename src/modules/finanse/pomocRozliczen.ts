import { useRef, useState } from 'react'
import { z } from 'zod'
import type { Rozliczenie } from '../../domain/modeleFinansowWspolnych'
import { groszeNaKwote } from '../../services/ObliczeniaFinansowWspolnych'
import type { PolecenieZapisuFinansowego } from '../../services/ZapisFinansowWspolnych'

export const metodyPodzialu = { po_rowno: 'Po równo', kwotowo: 'Według konkretnych kwot', procentowo: 'Procentowo', udzialy: 'Według udziałów' } as const
export const nazwaOsoby = (rozliczenie: Rozliczenie, id: string) => {
  const indeks = rozliczenie.uczestnicy.findIndex((osoba) => osoba.id === id)
  const osoba = rozliczenie.uczestnicy[indeks]
  return osoba ? `${osoba.nazwa} (osoba ${indeks + 1})` : 'Nieznana osoba'
}
export const kwotaDoWyswietlenia = (kwota: number, waluta: string) => `${groszeNaKwote(kwota, waluta).replace('.', ',')} ${waluta}`
export const dataDoWyswietlenia = (data: string) => data.split('-').reverse().join('.')

/** Blokada wielokrotnego kliknięcia i te same ID przy ponowieniu tej samej treści. */
export function useZapisRozliczenia(rewizja = 0) {
  const [zajety, ustawZajety] = useState(false)
  const [blad, ustawBlad] = useState('')
  const trwa = useRef(false)
  const proba = useRef<{ tresc: string; polecenie: PolecenieZapisuFinansowego } | undefined>(undefined)
  async function wykonaj(dane: unknown, zapisz: (polecenie: PolecenieZapisuFinansowego) => Promise<unknown>, poZapisie: () => void) {
    if (trwa.current) return
    trwa.current = true
    ustawZajety(true)
    ustawBlad('')
    try {
      const tresc = JSON.stringify(dane)
      if (proba.current?.tresc !== tresc) proba.current = { tresc, polecenie: { idZapisu: crypto.randomUUID(), oczekiwanaRewizja: rewizja } }
      await zapisz(proba.current.polecenie)
      proba.current = undefined
      poZapisie()
    } catch (przyczyna) {
      ustawBlad(przyczyna instanceof z.ZodError ? przyczyna.issues[0].message : (przyczyna as Error).message)
    } finally { trwa.current = false; ustawZajety(false) }
  }
  return { zajety, blad, ustawBlad, wykonaj }
}
