import { useEffect, useState } from 'react'
import { Bot, CalendarDays, LayoutDashboard, Plus, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Modal, PustyStan } from '../components/Interfejs'
import { szukajGlobalnie, type WynikWyszukiwania } from '../services/WyszukiwanieService'
import type { NazwaModulu } from '../domain/typy'

export function WyszukiwanieGlobalne({ zamknij, moze, otworzDodawanie }: { zamknij: () => void; moze: (modul: NazwaModulu) => boolean; otworzDodawanie: () => void }) {
  const [fraza, ustawFraze] = useState('')
  const [wyniki, ustawWyniki] = useState<WynikWyszukiwania[]>([])
  const [szukanie, ustawSzukanie] = useState(false)
  const przejdz = useNavigate()

  useEffect(() => {
    let aktywne = true
    const opoznienie = window.setTimeout(async () => {
      ustawSzukanie(true)
      const znalezione = (await szukajGlobalnie(fraza)).filter((wynik) => moze(wynik.modul))
      if (aktywne) {
        ustawWyniki(znalezione)
        ustawSzukanie(false)
      }
    }, 180)
    return () => { aktywne = false; window.clearTimeout(opoznienie) }
  }, [fraza, moze])

  return (
    <Modal tytul="Szukaj w Ogarniaczu" opis="Zadania, projekty, notatki, kontakty, dokumenty, wizyty i pomysły." zamknij={zamknij} szeroki>
      <label className="pole-wyszukiwania">
        <Search aria-hidden="true" />
        <input autoFocus value={fraza} onChange={(e) => ustawFraze(e.target.value)} placeholder="Wpisz co najmniej 2 znaki…" />
      </label>
      {fraza.length < 2 && <div className="paleta-polecen" aria-label="Szybkie akcje">
        <button type="button" onClick={() => { zamknij(); otworzDodawanie() }}><Plus aria-hidden="true" /><span><strong>Dodaj</strong><small>Szybko zapisz nową rzecz</small></span></button>
        <button type="button" onClick={() => { przejdz('/echo'); zamknij() }}><Bot aria-hidden="true" /><span><strong>Otwórz Echo</strong><small>Porozmawiaj z asystentem</small></span></button>
        <button type="button" onClick={() => { przejdz('/'); zamknij() }}><LayoutDashboard aria-hidden="true" /><span><strong>Pulpit</strong><small>Najważniejsze sygnały</small></span></button>
        <button type="button" onClick={() => { przejdz('/dzisiaj'); zamknij() }}><CalendarDays aria-hidden="true" /><span><strong>Dzisiaj</strong><small>Plan dnia krok po kroku</small></span></button>
      </div>}
      <div className="wyniki-wyszukiwania">
        {szukanie && <span className="tekst-pomocniczy">Szukam…</span>}
        {!szukanie && fraza.length >= 2 && wyniki.length === 0 && <PustyStan tytul="Brak wyników" opis="Spróbuj innej frazy." />}
        {wyniki.map((wynik) => <button type="button" key={`${wynik.modul}-${wynik.id}`} onClick={() => { przejdz(wynik.url); zamknij() }}><strong>{wynik.etykieta}</strong><span>{wynik.opis}</span></button>)}
      </div>
    </Modal>
  )
}
