import { useEffect, useState, type KeyboardEvent } from 'react'
import { Bot, CalendarDays, LayoutDashboard, Plus, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Modal, PustyStan } from '../components/Interfejs'
import { szukajGlobalnie, type WynikWyszukiwania } from '../services/WyszukiwanieService'
import type { DaneSzybkiegoDodawania, NazwaModulu } from '../domain/typy'

function grupaWyniku(modul: NazwaModulu) {
  if (['zadania', 'projekty', 'skrzynka'].includes(modul)) return 'praca'
  if (['wizyty', 'leki', 'skierowania'].includes(modul)) return 'zdrowie'
  if (['finanse', 'rachunki'].includes(modul)) return 'finanse'
  if (['notatki', 'pomysly', 'na_pozniej', 'cele', 'dokumenty', 'kontakty'].includes(modul)) return 'wiedza'
  return 'organizacja'
}

export function WyszukiwanieGlobalne({ zamknij, moze, otworzDodawanie }: { zamknij: () => void; moze: (modul: NazwaModulu) => boolean; otworzDodawanie: (dane: DaneSzybkiegoDodawania) => void }) {
  const [fraza, ustawFraze] = useState('')
  const [wyniki, ustawWyniki] = useState<WynikWyszukiwania[]>([])
  const [szukanie, ustawSzukanie] = useState(false)
  const [aktywnyIndeks, ustawAktywnyIndeks] = useState(-1)
  const przejdz = useNavigate()

  useEffect(() => {
    if (fraza.trim().length < 2) {
      ustawWyniki([])
      ustawSzukanie(false)
      return
    }
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

  useEffect(() => ustawAktywnyIndeks(wyniki.length > 0 ? 0 : -1), [wyniki])

  const otworzWynik = (wynik: WynikWyszukiwania) => { przejdz(wynik.url); zamknij() }
  const obsluzKlawisze = (zdarzenie: KeyboardEvent<HTMLInputElement>) => {
    if (zdarzenie.key === 'Escape') {
      zdarzenie.preventDefault()
      zamknij()
      return
    }
    if (wyniki.length === 0) return
    if (zdarzenie.key === 'ArrowDown') {
      zdarzenie.preventDefault()
      ustawAktywnyIndeks((indeks) => (indeks + 1) % wyniki.length)
    } else if (zdarzenie.key === 'ArrowUp') {
      zdarzenie.preventDefault()
      ustawAktywnyIndeks((indeks) => (indeks <= 0 ? wyniki.length - 1 : indeks - 1))
    } else if (zdarzenie.key === 'Enter' && aktywnyIndeks >= 0) {
      zdarzenie.preventDefault()
      otworzWynik(wyniki[aktywnyIndeks])
    }
  }

  return (
    <Modal tytul="Szukaj w Ogarniaczu" opis="Zadania, projekty, notatki, kontakty, dokumenty, wizyty i pomysły." zamknij={zamknij} szeroki>
      <label className="pole-wyszukiwania">
        <Search aria-hidden="true" />
        <input autoFocus role="combobox" aria-expanded={wyniki.length > 0} aria-controls="wyniki-globalne" aria-activedescendant={aktywnyIndeks >= 0 ? `wynik-globalny-${aktywnyIndeks}` : undefined} value={fraza} onKeyDown={obsluzKlawisze} onChange={(e) => ustawFraze(e.target.value)} placeholder="Wpisz co najmniej 2 znaki…" />
      </label>
      {fraza.length < 2 && <div className="paleta-polecen" aria-label="Szybkie akcje">
        <button type="button" onClick={() => { zamknij(); otworzDodawanie({}) }}><Plus aria-hidden="true" /><span><strong>Dodaj</strong><small>Szybko zapisz nową rzecz</small></span></button>
        <button type="button" onClick={() => { przejdz('/echo'); zamknij() }}><Bot aria-hidden="true" /><span><strong>Otwórz Echo</strong><small>Porozmawiaj z asystentem</small></span></button>
        <button type="button" onClick={() => { przejdz('/'); zamknij() }}><LayoutDashboard aria-hidden="true" /><span><strong>Pulpit</strong><small>Najważniejsze sygnały</small></span></button>
        <button type="button" onClick={() => { przejdz('/dzisiaj'); zamknij() }}><CalendarDays aria-hidden="true" /><span><strong>Dzisiaj</strong><small>Plan dnia krok po kroku</small></span></button>
      </div>}
      <div className="wyniki-wyszukiwania" id="wyniki-globalne" role={wyniki.length > 0 ? 'listbox' : undefined} aria-label="Wyniki wyszukiwania">
        {szukanie && <span className="tekst-pomocniczy">Szukam…</span>}
        {!szukanie && fraza.trim().length >= 2 && wyniki.length === 0 && <PustyStan tytul="Brak wyników" opis="Zmień frazę albo dodaj tę rzecz od razu." akcja={<button type="button" className="przycisk przycisk--glowny" onClick={() => { zamknij(); otworzDodawanie({ tresc: fraza }) }}><Plus aria-hidden="true" />Dodaj „{fraza.trim()}”</button>} />}
        {wyniki.map((wynik, indeks) => <button type="button" id={`wynik-globalny-${indeks}`} role="option" aria-selected={aktywnyIndeks === indeks} className={`wynik-wyszukiwania wynik-wyszukiwania--${grupaWyniku(wynik.modul)} ${aktywnyIndeks === indeks ? 'wynik-wyszukiwania--aktywny' : ''}`} key={`${wynik.modul}-${wynik.id}`} onMouseEnter={() => ustawAktywnyIndeks(indeks)} onClick={() => otworzWynik(wynik)}><span className="wynik-wyszukiwania__typ">{wynik.typ}</span><span className="wynik-wyszukiwania__tresc"><strong>{wynik.etykieta}</strong><small>{wynik.opis}</small></span><span className="wynik-wyszukiwania__wejdz" aria-hidden="true">Enter ↵</span></button>)}
      </div>
    </Modal>
  )
}
