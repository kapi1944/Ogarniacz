import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  AlarmClock, Archive, Bell, BookOpen, CalendarClock, CalendarDays, CheckSquare, ChevronLeft,
  ChevronRight, CircleDollarSign, Clock3, ContactRound, FileClock, Files, HeartPulse, Inbox,
  Car, Ellipsis, LayoutDashboard, Lightbulb, ListChecks, MessageCircle, Moon, NotebookPen, PackageCheck,
  Pill, Plus, Search, Settings, ShoppingCart, Sparkles, Sun, Target, WalletCards, X,
} from 'lucide-react'
import type { NazwaModulu } from '../domain/typy'
import { useObslugaWstecz } from '../platform/obslugaWstecz'
import { useAplikacja } from './KontekstAplikacji'

interface PozycjaMenu {
  etykieta: string
  adres: string
  modul?: NazwaModulu
  ikona: typeof LayoutDashboard
}

const grupy: { etykieta: string; pozycje: PozycjaMenu[] }[] = [
  { etykieta: 'Główne', pozycje: [
    { etykieta: 'Pulpit', adres: '/', ikona: LayoutDashboard },
    { etykieta: 'Skrzynka', adres: '/skrzynka', modul: 'skrzynka', ikona: Inbox },
  ] },
  { etykieta: 'Praca i czas', pozycje: [
    { etykieta: 'Zadania', adres: '/zadania', modul: 'zadania', ikona: CheckSquare },
    { etykieta: 'Projekty', adres: '/projekty', modul: 'projekty', ikona: PackageCheck },
    { etykieta: 'Planer dnia', adres: '/planer', modul: 'planer', ikona: CalendarClock },
    { etykieta: 'Grafik pracy', adres: '/grafik', modul: 'grafik', ikona: Clock3 },
  ] },
  { etykieta: 'Zdrowie', pozycje: [
    { etykieta: 'Leki', adres: '/leki', modul: 'leki', ikona: Pill },
    { etykieta: 'Wizyty', adres: '/wizyty', modul: 'wizyty', ikona: HeartPulse },
    { etykieta: 'Nawyki', adres: '/nawyki', modul: 'nawyki', ikona: ListChecks },
  ] },
  { etykieta: 'Organizacja', pozycje: [
    { etykieta: 'Przypomnienia', adres: '/przypomnienia', modul: 'przypomnienia', ikona: Bell },
    { etykieta: 'Zakupy', adres: '/zakupy', modul: 'zakupy', ikona: ShoppingCart },
    { etykieta: 'Rachunki', adres: '/rachunki', modul: 'rachunki', ikona: WalletCards },
    { etykieta: 'Na mieście', adres: '/miasto', modul: 'miasto', ikona: CalendarDays },
  ] },
  { etykieta: 'Wiedza i życie', pozycje: [
    { etykieta: 'Cele', adres: '/cele', modul: 'cele', ikona: Target },
    { etykieta: 'Notatki', adres: '/notatki', modul: 'notatki', ikona: NotebookPen },
    { etykieta: 'Pomysły', adres: '/pomysly', modul: 'pomysly', ikona: Lightbulb },
    { etykieta: 'Na później', adres: '/na-pozniej', modul: 'na_pozniej', ikona: Archive },
    { etykieta: 'Kontakty', adres: '/kontakty', modul: 'kontakty', ikona: ContactRound },
    { etykieta: 'Dokumenty', adres: '/dokumenty', modul: 'dokumenty', ikona: Files },
    { etykieta: 'Terminy ważności', adres: '/terminy', modul: 'terminy', ikona: FileClock },
  ] },
  { etykieta: 'Pozostałe', pozycje: [
    { etykieta: 'Wydatki i budżet', adres: '/finanse', modul: 'finanse', ikona: CircleDollarSign },
    { etykieta: 'Samochód', adres: '/samochod', modul: 'samochod', ikona: Car },
    { etykieta: 'Echo', adres: '/echo', modul: 'echo', ikona: MessageCircle },
    { etykieta: 'Ustawienia', adres: '/ustawienia', modul: 'ustawienia', ikona: Settings },
  ] },
]

const wszystkiePozycje = grupy.flatMap((grupa) => grupa.pozycje)
const glowneAdresyMobilne = new Set(['/', '/zadania', '/planer'])

export function DolnaNawigacjaMobilna({
  otworzSzybkieDodawanie,
  moze,
}: {
  otworzSzybkieDodawanie: () => void
  moze: (modul: NazwaModulu, operacja?: 'odczyt' | 'edycja', sekcja?: string) => boolean
}) {
  const [wiecejOtwarte, ustawWiecejOtwarte] = useState(false)
  const { pathname } = useLocation()
  const wiecejAktywne = !glowneAdresyMobilne.has(pathname)

  useEffect(() => ustawWiecejOtwarte(false), [pathname])
  useEffect(() => {
    document.body.classList.toggle('mobilny-drawer-otwarty', wiecejOtwarte)
    return () => document.body.classList.remove('mobilny-drawer-otwarty')
  }, [wiecejOtwarte])
  useObslugaWstecz(wiecejOtwarte, () => ustawWiecejOtwarte(false), 80)

  return <>
    {wiecejOtwarte && <>
      <button type="button" className="mobilny-drawer-tlo" aria-label="Zamknij więcej modułów" onClick={() => ustawWiecejOtwarte(false)} />
      <section className="mobilny-drawer" role="dialog" aria-modal="true" aria-labelledby="mobilny-drawer-tytul">
        <div className="mobilny-drawer__uchwyt" aria-hidden="true" />
        <header className="mobilny-drawer__naglowek">
          <div><strong id="mobilny-drawer-tytul">Więcej modułów</strong><small>Wszystkie dostępne obszary Ogarniacza</small></div>
          <button type="button" className="przycisk-ikona" onClick={() => ustawWiecejOtwarte(false)} aria-label="Zamknij"><X aria-hidden="true" /></button>
        </header>
        <nav className="mobilny-drawer__nawigacja" aria-label="Pozostałe moduły">
          {grupy.map((grupa) => {
            const widoczne = grupa.pozycje.filter((pozycja) =>
              !glowneAdresyMobilne.has(pozycja.adres) && (!pozycja.modul || moze(pozycja.modul)),
            )
            if (widoczne.length === 0) return null
            return <div className="mobilny-drawer__grupa" key={grupa.etykieta}>
              <span>{grupa.etykieta}</span>
              <div>{widoczne.map((pozycja) => {
                const Ikona = pozycja.ikona
                return <NavLink to={pozycja.adres} key={pozycja.adres}><Ikona aria-hidden="true" /><strong>{pozycja.etykieta}</strong></NavLink>
              })}</div>
            </div>
          })}
        </nav>
      </section>
    </>}
    <nav className="dolna-nawigacja" aria-label="Dolna nawigacja">
      <NavLink end to="/" className="dolna-nawigacja__element"><LayoutDashboard aria-hidden="true" /><span>Pulpit</span></NavLink>
      <NavLink to="/zadania" className="dolna-nawigacja__element"><CheckSquare aria-hidden="true" /><span>Zadania</span></NavLink>
      <button type="button" className="dolna-nawigacja__dodaj" onClick={otworzSzybkieDodawanie} aria-label="Szybko dodaj"><span><Plus aria-hidden="true" /></span><small>Dodaj</small></button>
      <NavLink to="/planer" className="dolna-nawigacja__element"><CalendarClock aria-hidden="true" /><span>Planer</span></NavLink>
      <button type="button" className={`dolna-nawigacja__element ${wiecejAktywne || wiecejOtwarte ? 'active' : ''}`} onClick={() => ustawWiecejOtwarte(true)} aria-haspopup="dialog" aria-expanded={wiecejOtwarte}><Ellipsis aria-hidden="true" /><span>Więcej</span></button>
    </nav>
  </>
}

export function UkladAplikacji({ children }: { children: ReactNode }) {
  const { otworzSzybkieDodawanie, otworzWyszukiwanie, ustawienia, zapiszUstawienia, moze } = useAplikacja()
  const [zwiniete, ustawZwiniete] = useState(ustawienia.nawigacja.menuDomyslnieZwiniete)
  const { pathname } = useLocation()
  const nazwaWidoku = wszystkiePozycje.find((pozycja) => pozycja.adres === pathname)?.etykieta ?? 'Ogarniacz'

  useEffect(() => ustawZwiniete(ustawienia.nawigacja.menuDomyslnieZwiniete), [ustawienia.nawigacja.menuDomyslnieZwiniete])
  useEffect(() => {
    const klawisze = (zdarzenie: KeyboardEvent) => {
      if ((zdarzenie.ctrlKey || zdarzenie.metaKey) && zdarzenie.key.toLowerCase() === 'k') {
        zdarzenie.preventDefault(); otworzWyszukiwanie()
      }
      if ((zdarzenie.ctrlKey || zdarzenie.metaKey) && zdarzenie.key === 'Enter') {
        zdarzenie.preventDefault(); otworzSzybkieDodawanie()
      }
    }
    window.addEventListener('keydown', klawisze)
    return () => window.removeEventListener('keydown', klawisze)
  }, [otworzSzybkieDodawanie, otworzWyszukiwanie])

  const zmienZwiniecie = () => {
    const nowe = !zwiniete
    ustawZwiniete(nowe)
    void zapiszUstawienia({ nawigacja: { ...ustawienia.nawigacja, menuDomyslnieZwiniete: nowe } })
  }

  const sidebar = (
    <aside className={`sidebar ${zwiniete ? 'sidebar--zwiniety' : ''}`}>
      <div className="sidebar__marka">
        <span className="sidebar__logo"><CheckSquare aria-hidden="true" /></span>
        {!zwiniete && <div><strong>Ogarniacz</strong><small>centrum dowodzenia</small></div>}
      </div>
      <nav className="sidebar__nawigacja" aria-label="Główna nawigacja">
        {grupy.map((grupa) => {
          const widoczne = grupa.pozycje.filter((pozycja) => !pozycja.modul || moze(pozycja.modul))
          if (widoczne.length === 0) return null
          return (
            <div className="grupa-menu" key={grupa.etykieta}>
              {!zwiniete && <span className="grupa-menu__etykieta">{grupa.etykieta}</span>}
              {widoczne.map((pozycja) => {
                const Ikona = pozycja.ikona
                return <NavLink end={pozycja.adres === '/'} to={pozycja.adres} key={pozycja.adres} title={zwiniete ? pozycja.etykieta : undefined}><Ikona aria-hidden="true" />{!zwiniete && <span>{pozycja.etykieta}</span>}</NavLink>
              })}
            </div>
          )
        })}
      </nav>
      <button type="button" className="sidebar__zwijanie" onClick={zmienZwiniecie} title={zwiniete ? 'Rozwiń menu' : 'Zwiń menu'}>
        {zwiniete ? <ChevronRight aria-hidden="true" /> : <><ChevronLeft aria-hidden="true" /><span>Zwiń menu</span></>}
      </button>
    </aside>
  )

  return (
    <div className={`aplikacja ${zwiniete ? 'aplikacja--menu-zwiniete' : ''}`}>
      {sidebar}
      <div className="obszar-glowny">
        {ustawienia.trybUzytkownika === 'edytor' && <div className="pasek-edytora"><span><Sparkles aria-hidden="true" />Lokalny podgląd jako Edytor — to nie jest zdalne, bezpieczne współdzielenie.</span><button type="button" onClick={() => zapiszUstawienia({ trybUzytkownika: 'wlasciciel', aktywnyEdytorId: undefined })}>Wróć do Właściciela</button></div>}
        <header className="pasek-gorny">
          <strong>{nazwaWidoku}</strong>
          <div className="pasek-gorny__akcje">
            <button type="button" className="przycisk-szukaj" onClick={otworzWyszukiwanie}><Search aria-hidden="true" /><span>Szukaj</span><kbd>Ctrl K</kbd></button>
            <button type="button" className="przycisk-ikona" onClick={() => zapiszUstawienia({ wyglad: { ...ustawienia.wyglad, motyw: ustawienia.wyglad.motyw === 'ciemny' ? 'jasny' : 'ciemny' } })} title="Przełącz motyw">{ustawienia.wyglad.motyw === 'ciemny' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}</button>
            {moze('przypomnienia') && <NavLink to="/przypomnienia" className="przycisk-ikona" title="Centrum przypomnień"><AlarmClock aria-hidden="true" /></NavLink>}
            <button type="button" className="przycisk-plus" onClick={otworzSzybkieDodawanie} title="Szybkie dodawanie (Ctrl+Enter)"><Plus aria-hidden="true" /><span>Dodaj</span></button>
          </div>
        </header>
        <main className="zawartosc">{children}</main>
      </div>
      <DolnaNawigacjaMobilna otworzSzybkieDodawanie={otworzSzybkieDodawanie} moze={moze} />
    </div>
  )
}

export function StraznikModulu({ modul, children }: { modul: NazwaModulu; children: ReactNode }) {
  const { moze } = useAplikacja()
  if (!moze(modul)) return <div className="brak-dostepu"><BookOpen aria-hidden="true" /><h1>Brak dostępu</h1><p>Edytor nie ma aktywnego uprawnienia do tego modułu.</p></div>
  if (!moze(modul, 'edycja')) return <div className="tryb-tylko-odczyt"><div className="komunikat komunikat--informacja">Tryb tylko do odczytu — Edytor nie ma uprawnienia do zapisu w tym module.</div><div className="obszar-tylko-odczyt">{children}</div></div>
  return children
}
