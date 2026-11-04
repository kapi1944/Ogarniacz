import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from 'lucide-react'
import { Komunikat, NaglowekWidoku } from '../../components/Interfejs'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { dzisiajIso } from '../../domain/fabryki'
import { domyslnyKokpit, domyslnyUklad, odczytajKokpit, widokiKokpitu } from '../../domain/kokpit'
import { useKonto } from '../../app/DostawcaKonta'
import { useObslugaWstecz } from '../../platform/obslugaWstecz'
import { RendererUkladu } from './RendererUkladu'
import { EdytorKokpitu } from './EdytorKokpitu'
import { natywnyAndroid, useNawigacjaKokpitu, usePaskiAndroida, useProfilKokpitu } from './obslugaKokpitu'
import './kokpit.css'

export function WidokPanelu() {
  const { zapisaneUstawienia, zapiszUstawienia, gotowyDostep, moze } = useAplikacja()
  const { konto } = useKonto()
  const zapisana = odczytajKokpit(zapisaneUstawienia.kokpit)
  const konfiguracja = zapisana ?? domyslnyKokpit
  const mozeEdytowac = gotowyDostep && moze('ustawienia', 'edycja') && (zapisana || zapisaneUstawienia.kokpit === undefined)
  const [edytuje, ustawEdytuje] = useState(false)
  const edycja = edytuje && mozeEdytowac
  const { profil, wybor, ustawWybor } = useProfilKokpitu(konto?.uzytkownikId ?? 'lokalny')
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
  const zmienPlansze = (kierunek: number) => ustawNumer((numer) => (Math.min(numer, uklad.plansze.length - 1) + kierunek + uklad.plansze.length) % uklad.plansze.length)
  const nawigacja = useNawigacjaKokpitu({ konfiguracja, edycja: Boolean(edycja), plansze: widok === 'plansze', zmienPlansze })
  usePaskiAndroida(pelnyEkran && konfiguracja.immersja, ustawBlad)
  useObslugaWstecz(pelnyEkran && !edycja, () => void zmienPelnyEkran(), 20)
  const wysokosc = { auto: undefined, procent: `${uklad.wysokoscProcent}dvh`, pelna: '100dvh', piksele: `${uklad.wysokoscPx}px` }[uklad.wysokosc]

  useEffect(() => {
    const odswiezDate = () => ustawDate(dzisiajIso())
    const zegar = window.setInterval(odswiezDate, 1000)
    const odswiez = () => ustawPelnyEkran(document.fullscreenElement === panel.current)
    document.addEventListener('fullscreenchange', odswiez)
    document.addEventListener('visibilitychange', odswiezDate)
    return () => {
      window.clearInterval(zegar)
      document.removeEventListener('fullscreenchange', odswiez)
      document.removeEventListener('visibilitychange', odswiezDate)
    }
  }, [])

  const zmienPelnyEkran = async () => {
    ustawBlad('')
    if (natywnyAndroid) { ustawPelnyEkran((pelny) => !pelny); return }
    try {
      if (document.fullscreenElement === panel.current) await document.exitFullscreen()
      else if (panel.current?.requestFullscreen) await panel.current.requestFullscreen()
      else ustawBlad('Ta przeglądarka nie obsługuje pełnego ekranu. Kokpit nadal działa w oknie.')
    } catch { ustawBlad('Nie udało się zmienić pełnego ekranu. Kokpit nadal działa w oknie.') }
  }

  const zmienWidok = (nastepny: keyof typeof widokiKokpitu) => {
    ustawWidok(nastepny)
    if (konfiguracja.start === 'ostatni' && mozeEdytowac) {
      void zapiszUstawienia({ kokpit: { ...konfiguracja, ostatni: nastepny } }).catch(() => ustawBlad('Nie udało się zapisać ostatniego widoku.'))
    }
  }

  return <div className={`kokpit ${widok === 'plansze' && !edycja ? 'kokpit--plansze' : ''}`} ref={panel}
    data-pelny-ekran={pelnyEkran} onPointerDown={nawigacja.ruch} onPointerMove={nawigacja.ruch} onFocus={nawigacja.ruch}
    onKeyDown={(zdarzenie) => {
      nawigacja.ruch()
      if (natywnyAndroid && zdarzenie.key === 'Escape' && pelnyEkran && !edycja) void zmienPelnyEkran()
      if (!edycja && widok === 'plansze' && zdarzenie.target === zdarzenie.currentTarget && ['ArrowLeft', 'ArrowRight'].includes(zdarzenie.key)) {
        zdarzenie.preventDefault()
        zmienPlansze(zdarzenie.key === 'ArrowLeft' ? -1 : 1)
      }
    }} tabIndex={0}>
    <header className="kokpit__gora">
      {!pelnyEkran && <NaglowekWidoku tytul="Ekran kokpitu" opis="Ekran informacyjny i centrum sterowania." />}
      <div className="kokpit__sterowanie">
        {!edycja && <button className="przycisk-ikona" type="button" aria-label={widokiKokpitu[widok === 'plansze' ? 'ciagly' : 'plansze']}
          onClick={() => zmienWidok(widok === 'plansze' ? 'ciagly' : 'plansze')}>{widok === 'plansze' ? '↕' : '▦'}</button>}
        {mozeEdytowac && !edycja && <button className="przycisk-ikona" type="button" aria-label="Edytuj kokpit" onClick={() => ustawEdytuje(true)}>⚙</button>}
        <button className="przycisk-ikona" type="button" onClick={() => void zmienPelnyEkran()} aria-label={pelnyEkran ? 'Wyłącz pełny ekran' : 'Pełny ekran'}>
          {pelnyEkran ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
        </button>
        {!edycja && <Link className="przycisk-ikona" to="/" aria-label="Wyjdź z kokpitu"><X aria-hidden="true" /></Link>}
      </div>
    </header>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    {edycja ? <EdytorKokpitu konfiguracja={konfiguracja} profil={profil} widok={widok} numer={aktywny}
      wyborProfilu={wybor} ustawWyborProfilu={ustawWybor}
      zapisz={async (kokpit) => { await zapiszUstawienia({ kokpit: { ...kokpit, wlasciciel: konto?.wlascicielId } }); ustawWidok(undefined) }} zamknij={() => ustawEdytuje(false)} />
      : widok === 'plansze' ? <>
      <div className="kokpit__plansza">
        <button className="przycisk-ikona" type="button" aria-label="Poprzednia plansza" onClick={() => zmienPlansze(-1)}><ChevronLeft /></button>
        <RendererUkladu plansza={plansza} data={data} tryb="publiczny" etykieta={plansza.nazwa} zdarzenia={nawigacja.zdarzenia} />
        <button className="przycisk-ikona" type="button" aria-label="Następna plansza" onClick={() => zmienPlansze(1)}><ChevronRight /></button>
      </div>
      {konfiguracja.pasek !== 'ukryty' && <nav className="kokpit__pasek" data-ukryty={nawigacja.ukryty} aria-label="Plansze kokpitu">
        {uklad.plansze.map(({ id, nazwa, ikona }, indeks) => <button key={id} type="button" className="przycisk" aria-label={nazwa} aria-current={aktywny === indeks ? 'true' : undefined} onClick={() => ustawNumer(indeks)}>
          {konfiguracja.stylPaska === 'numery' ? indeks + 1 : <span aria-hidden="true">{ikona}</span>} {konfiguracja.stylPaska === 'nazwy' && nazwa}
        </button>)}
      </nav>}
    </> : <div className="kokpit__ciagly">
      {uklad.sekcje.map((sekcja, indeks) => <RendererUkladu key={sekcja.id} plansza={sekcja} data={data} tryb="publiczny"
        etykieta={sekcja.nazwa} ciagly wysokosc={indeks === 0 ? wysokosc : undefined} />)}
    </div>}
  </div>
}
