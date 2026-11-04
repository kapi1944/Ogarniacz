import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from 'lucide-react'
import { Komunikat, NaglowekWidoku } from '../../components/Interfejs'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { dzisiajIso } from '../../domain/fabryki'
import { domyslnyKokpit, domyslnyUklad, odczytajKokpit, widokiKokpitu, type ProfilKokpitu } from '../../domain/kokpit'
import { RendererUkladu } from './RendererUkladu'
import './kokpit.css'

function profilEkranu(): ProfilKokpitu {
  const { innerWidth: szerokosc, innerHeight: wysokosc } = window
  if (szerokosc < 600 && szerokosc < wysokosc) return 'pion'
  if (wysokosc < 550 && szerokosc > wysokosc) return 'poziom'
  return szerokosc < 1050 ? 'tablet' : 'komputer'
}

export function WidokPanelu() {
  const { zapisaneUstawienia, zapiszUstawienia, gotowyDostep, moze } = useAplikacja()
  const konfiguracja = odczytajKokpit(zapisaneUstawienia.kokpit) ?? domyslnyKokpit
  const [profil, ustawProfil] = useState(profilEkranu)
  const [wybranyWidok, ustawWidok] = useState<keyof typeof widokiKokpitu>()
  const [numer, ustawNumer] = useState(0)
  const [data, ustawDate] = useState(dzisiajIso)
  const [pelnyEkran, ustawPelnyEkran] = useState(false)
  const [blad, ustawBlad] = useState('')
  const panel = useRef<HTMLDivElement>(null)
  const widok = wybranyWidok ?? (konfiguracja.start === 'ostatni' ? konfiguracja.ostatni : konfiguracja.start)
  const uklad = konfiguracja.profile[profil] ?? domyslnyUklad(profil)
  const aktywny = Math.min(numer, uklad.plansze.length - 1)
  const plansza = uklad.plansze[aktywny]
  const wysokosc = { auto: undefined, procent: `${uklad.wysokoscProcent}dvh`, pelna: '100dvh', piksele: `${uklad.wysokoscPx}px` }[uklad.wysokosc]

  useEffect(() => {
    const odswiezDate = () => ustawDate(dzisiajIso())
    const zegar = window.setInterval(odswiezDate, 1000)
    const odswiez = () => ustawPelnyEkran(document.fullscreenElement === panel.current)
    const rozmiar = () => ustawProfil(profilEkranu())
    document.addEventListener('fullscreenchange', odswiez)
    document.addEventListener('visibilitychange', odswiezDate)
    window.addEventListener('resize', rozmiar)
    return () => {
      window.clearInterval(zegar)
      document.removeEventListener('fullscreenchange', odswiez)
      document.removeEventListener('visibilitychange', odswiezDate)
      window.removeEventListener('resize', rozmiar)
    }
  }, [])

  const zmienPelnyEkran = async () => {
    ustawBlad('')
    try {
      if (document.fullscreenElement === panel.current) await document.exitFullscreen()
      else if (panel.current?.requestFullscreen) await panel.current.requestFullscreen()
      else ustawBlad('Ta przeglądarka nie obsługuje pełnego ekranu. Kokpit nadal działa w oknie.')
    } catch { ustawBlad('Nie udało się zmienić pełnego ekranu. Kokpit nadal działa w oknie.') }
  }

  const zmienWidok = (nastepny: keyof typeof widokiKokpitu) => {
    ustawWidok(nastepny)
    if (konfiguracja.start === 'ostatni' && gotowyDostep && moze('ustawienia', 'edycja')) {
      void zapiszUstawienia({ kokpit: { ...konfiguracja, ostatni: nastepny } }).catch(() => ustawBlad('Nie udało się zapisać ostatniego widoku.'))
    }
  }

  return <div className={`kokpit ${widok === 'plansze' ? 'kokpit--plansze' : ''}`} ref={panel}>
    <header className="kokpit__gora">
      {!pelnyEkran && <NaglowekWidoku tytul="Ekran kokpitu" opis="Ekran informacyjny i centrum sterowania." />}
      <div className="kokpit__sterowanie">
        <button className="przycisk-ikona" type="button" aria-label={widokiKokpitu[widok === 'plansze' ? 'ciagly' : 'plansze']}
          onClick={() => zmienWidok(widok === 'plansze' ? 'ciagly' : 'plansze')}>{widok === 'plansze' ? '↕' : '▦'}</button>
        <button className="przycisk-ikona" type="button" onClick={() => void zmienPelnyEkran()} aria-label={pelnyEkran ? 'Wyłącz pełny ekran' : 'Pełny ekran'}>
          {pelnyEkran ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
        </button>
        <Link className="przycisk-ikona" to="/" aria-label="Wyjdź z kokpitu"><X aria-hidden="true" /></Link>
      </div>
    </header>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    {widok === 'plansze' ? <>
      <div className="kokpit__plansza">
        <button className="przycisk-ikona" type="button" aria-label="Poprzednia plansza" onClick={() => ustawNumer((aktywny - 1 + uklad.plansze.length) % uklad.plansze.length)}><ChevronLeft /></button>
        <RendererUkladu plansza={plansza} data={data} tryb="publiczny" etykieta={plansza.nazwa} />
        <button className="przycisk-ikona" type="button" aria-label="Następna plansza" onClick={() => ustawNumer((aktywny + 1) % uklad.plansze.length)}><ChevronRight /></button>
      </div>
      <nav className="kokpit__pasek" aria-label="Plansze kokpitu">
        {uklad.plansze.map(({ id, nazwa, ikona }, indeks) => <button key={id} type="button" className="przycisk" aria-current={aktywny === indeks ? 'true' : undefined} onClick={() => ustawNumer(indeks)}>{ikona} {nazwa}</button>)}
      </nav>
    </> : <div className="kokpit__ciagly">
      {uklad.sekcje.map((sekcja, indeks) => <RendererUkladu key={sekcja.id} plansza={sekcja} data={data} tryb="publiczny"
        etykieta={sekcja.nazwa} ciagly wysokosc={indeks === 0 ? wysokosc : undefined} />)}
    </div>}
  </div>
}
