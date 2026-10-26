import { createContext as utworzKontekst, useContext as uzyjKontekstu, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { KATEGORIE_USTAWIEN, normalizujZapytanieUstawien, type KategoriaUstawienId } from './kategorieUstawien'

const KontekstKategoriiUstawien = utworzKontekst<KategoriaUstawienId | undefined>(undefined)

export function NawigacjaUstawien({ children: zawartosc }: { children: ReactNode }) {
  const lokalizacja = useLocation()
  const nawiguj = useNavigate()
  const [zapytanie, ustawZapytanie] = useState('')
  const parametry = new URLSearchParams(lokalizacja.search)
  const wybrana = parametry.get('kategoria') ?? (lokalizacja.hash === '#synchronizacja' ? 'synchronizacja' : 'wyglad')
  const aktywnaKategoria = KATEGORIE_USTAWIEN.find((kategoria) => kategoria.id === wybrana) ?? KATEGORIE_USTAWIEN[0]
  const slowa = normalizujZapytanieUstawien(zapytanie).split(/\s+/).filter(Boolean)
  const wyniki = KATEGORIE_USTAWIEN.filter((kategoria) => {
    const tekst = normalizujZapytanieUstawien([kategoria.nazwa, ...kategoria.opcje, kategoria.slowaKluczowe].join(' '))
    return slowa.every((slowo) => tekst.includes(slowo))
  })
  const adresKategorii = (kategoria: KategoriaUstawienId) => {
    const noweParametry = new URLSearchParams(lokalizacja.search)
    noweParametry.set('kategoria', kategoria)
    return { pathname: lokalizacja.pathname, search: `?${noweParametry}`, hash: '' }
  }

  return <KontekstKategoriiUstawien.Provider value={aktywnaKategoria.id}>
    <div className="ustawienia-kategorie">
      <aside className="ustawienia-kategorie__menu">
        <label className="pole"><span>Szukaj w ustawieniach</span><input type="search" value={zapytanie} onChange={(zdarzenie) => ustawZapytanie(zdarzenie.target.value)} placeholder="Nazwa opcji lub słowo kluczowe" /></label>
        {slowa.length > 0 && <div className="ustawienia-kategorie__wyniki">
          <p role="status">{wyniki.length ? `Znalezione kategorie: ${wyniki.length}` : 'Brak wyników. Spróbuj innej nazwy lub słowa kluczowego.'}</p>
          <ul aria-label="Wyniki wyszukiwania ustawień">{wyniki.map((kategoria) => <li key={kategoria.id}>
            <Link to={adresKategorii(kategoria.id)} onClick={() => ustawZapytanie('')}>
              <strong>{kategoria.nazwa}</strong>
              <small>{kategoria.opcje.filter((opcja) => slowa.some((slowo) => normalizujZapytanieUstawien(opcja).includes(slowo))).join(' · ') || kategoria.opcje.slice(0, 2).join(' · ')}</small>
            </Link>
          </li>)}</ul>
          <button type="button" className="przycisk przycisk--tekstowy" onClick={() => ustawZapytanie('')}>Wyczyść wyszukiwanie</button>
        </div>}
        <label className="pole ustawienia-kategorie__wybor"><span>Kategoria ustawień</span><select value={aktywnaKategoria.id} onChange={(zdarzenie) => { nawiguj(adresKategorii(zdarzenie.target.value as KategoriaUstawienId)); ustawZapytanie('') }}>{KATEGORIE_USTAWIEN.map((kategoria) => <option key={kategoria.id} value={kategoria.id}>{kategoria.nazwa}</option>)}</select></label>
        <nav aria-label="Kategorie ustawień">{KATEGORIE_USTAWIEN.map((kategoria) => <Link key={kategoria.id} to={adresKategorii(kategoria.id)} aria-current={kategoria.id === aktywnaKategoria.id ? 'page' : undefined} onClick={() => ustawZapytanie('')}>{kategoria.nazwa}</Link>)}</nav>
      </aside>
      <div className="ustawienia-kategorie__zawartosc" role="region" aria-labelledby="kategoria-ustawien-tytul">
        <h2 id="kategoria-ustawien-tytul">{aktywnaKategoria.nazwa}</h2>
        {zawartosc}
      </div>
    </div>
  </KontekstKategoriiUstawien.Provider>
}

export function KategoriaUstawien({ kategorie, children: zawartosc }: { kategorie: KategoriaUstawienId[]; children: ReactNode }) {
  const aktywnaKategoria = uzyjKontekstu(KontekstKategoriiUstawien)
  // Ukrycie zamiast demontażu zachowuje szkice, formularze i trwające operacje.
  return <div className="ustawienia-kategoria" hidden={aktywnaKategoria !== undefined && !kategorie.includes(aktywnaKategoria)}>{zawartosc}</div>
}
