import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, CheckSquare, Home, Maximize, MessageCircle, Minimize, X } from 'lucide-react'
import { Karta, Komunikat, NaglowekWidoku } from '../../components/Interfejs'
import { SekcjaDom } from './SekcjaDom'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { dzisiajIso } from '../../domain/fabryki'
import { pobierzKonfiguracjeSynchronizacji } from '../../services/KonfiguracjaSynchronizacji'

const odmowPrywatnychDanych = () => false

function SkrotZadan({ data }: { data: string }) {
  const { dane: zadania } = useRepozytorium('zadania', odmowPrywatnychDanych)
  const zwykle = zadania.filter((zadanie) => !zadanie.sesjaTerapiiId && !zadanie.powiazania.some((relacja) => ['zdrowie', 'leki', 'wizyty', 'skierowania', 'dokumenty'].includes(relacja.typ)))
  const otwarte = zwykle.filter((zadanie) => zadanie.status !== 'wykonane')
  return <>
    <p><strong>{otwarte.filter((zadanie) => zadanie.termin?.slice(0, 10) === data).length}</strong> zadań na dziś</p>
    <p className="tekst-pomocniczy">Zaległe: {otwarte.filter((zadanie) => zadanie.termin && zadanie.termin.slice(0, 10) < data).length}</p>
    <Link className="przycisk przycisk--drugorzedny" to="/zadania"><CheckSquare aria-hidden="true" />Otwórz zadania</Link>
  </>
}

function SkrotPlanu({ data }: { data: string }) {
  const { dane: bloki } = useRepozytorium('blokiCzasu')
  const zwykle = bloki.filter((blok) => ['praca', 'przerwa', 'wolne'].includes(blok.typ) && !blok.powiazanie
    && ['zaakceptowany', 'wykonany'].includes(blok.status) && blok.poczatek.slice(0, 10) <= data && blok.koniec.slice(0, 10) >= data)
  return <>
    <p><strong>{zwykle.length}</strong> bloków pracy, przerw i czasu wolnego na dziś</p>
    <p className="tekst-pomocniczy">Szczegóły planu są dostępne w planerze.</p>
    <Link className="przycisk przycisk--drugorzedny" to="/planer"><CalendarDays aria-hidden="true" />Otwórz planer</Link>
  </>
}

function StanPolaczenia() {
  const { dane } = useRepozytorium('stanSynchronizacji')
  const stan = dane.find((element) => element.id === 'glowny')
  const konfiguracja = pobierzKonfiguracjeSynchronizacji()
  const [polaczenieSieciowe, ustawPolaczenieSieciowe] = useState(navigator.onLine)
  useEffect(() => {
    const odswiez = () => ustawPolaczenieSieciowe(navigator.onLine)
    window.addEventListener('online', odswiez)
    window.addEventListener('offline', odswiez)
    return () => { window.removeEventListener('online', odswiez); window.removeEventListener('offline', odswiez) }
  }, [])
  const serwer = konfiguracja.blad ? 'Błąd konfiguracji' : !konfiguracja.adresApi ? 'Nie skonfigurowano' : !polaczenieSieciowe || stan?.polaczenie === 'offline' ? 'Offline'
    : stan?.polaczenie === 'dostepne' ? 'Dostępny przy ostatnim sprawdzeniu' : stan?.polaczenie === 'niedostepne' ? 'Niedostępny przy ostatnim sprawdzeniu' : 'Nie sprawdzono'
  const etykiety = { zsynchronizowano: 'Zsynchronizowano', synchronizacja: 'W toku', oczekuje: 'Oczekuje', offline: 'Offline', konflikt: 'Wymaga uwagi', blad: 'Wymaga uwagi' }
  return <div role="status">
    <p>Serwer: <strong>{serwer}</strong></p>
    <p>Synchronizacja: <strong>{!konfiguracja.adresApi ? 'Dane lokalne' : !polaczenieSieciowe ? 'Offline' : stan?.sesjaWymagaLogowania ? 'Wymaga zalogowania' : stan ? etykiety[stan.stan] : 'Brak informacji'}</strong></p>
    <p className="tekst-pomocniczy">Stan z istniejącej synchronizacji.</p>
  </div>
}

export function WidokPanelu() {
  const { moze, gotowyDostep } = useAplikacja()
  const [teraz, ustawTeraz] = useState(() => new Date())
  const [pelnyEkran, ustawPelnyEkran] = useState(false)
  const [blad, ustawBlad] = useState('')
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const zegar = window.setInterval(() => ustawTeraz(new Date()), 1000)
    const odswiez = () => ustawPelnyEkran(document.fullscreenElement === panel.current)
    document.addEventListener('fullscreenchange', odswiez)
    return () => { window.clearInterval(zegar); document.removeEventListener('fullscreenchange', odswiez) }
  }, [])
  const zmienPelnyEkran = async () => {
    ustawBlad('')
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (panel.current?.requestFullscreen) await panel.current.requestFullscreen()
      else ustawBlad('Ta przeglądarka nie obsługuje pełnego ekranu. Panel nadal działa w oknie.')
    } catch { ustawBlad('Nie udało się zmienić pełnego ekranu. Panel nadal działa w oknie.') }
  }
  const data = dzisiajIso(teraz)
  return <div className="widok panel-domowy" ref={panel}>
    <NaglowekWidoku tytul="Panel domowy" opis="Widok do wspólnego ekranu — bez szczegółów zdrowia i kont." akcje={<>
      <button className="przycisk przycisk--drugorzedny" type="button" onClick={() => void zmienPelnyEkran()}>{pelnyEkran ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}{pelnyEkran ? 'Wyłącz pełny ekran' : 'Pełny ekran'}</button>
      <Link className="przycisk przycisk--drugorzedny" to="/" onClick={() => { if (document.fullscreenElement === panel.current) void document.exitFullscreen().catch(() => undefined) }}><X aria-hidden="true" />Wyjdź z panelu</Link>
    </>} />
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <Karta klasa="karta--akcent">
      <time className="panel-domowy__godzina" dateTime={teraz.toISOString()}>{teraz.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</time>
      <p>{teraz.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </Karta>
    <div className="siatka-kart-modulow">
      <Karta><h2>Plan dnia</h2>{gotowyDostep && moze('planer') ? <SkrotPlanu data={data} /> : <p>Plan dnia wymaga dostępu do planera.</p>}</Karta>
      <Karta><h2>Zadania</h2>{gotowyDostep && moze('zadania') ? <SkrotZadan data={data} /> : <p>Zadania wymagają uprawnienia do odczytu.</p>}</Karta>
      <Karta><h2>Echo</h2><p>Przejdź do istniejącej rozmowy z Echo.</p>{gotowyDostep && moze('echo') ? <Link className="przycisk przycisk--glowny" to="/echo"><MessageCircle aria-hidden="true" />Otwórz Echo</Link> : <p>Echo jest niedostępne dla tego użytkownika.</p>}</Karta>
      <Karta><h2>Połączenie</h2><StanPolaczenia /></Karta>
      <Karta><h2><Home aria-hidden="true" /> Dom</h2>{gotowyDostep && <SekcjaDom />}</Karta>
    </div>
  </div>
}
