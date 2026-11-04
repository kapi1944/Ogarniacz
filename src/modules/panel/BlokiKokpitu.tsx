import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, CheckSquare, MessageCircle } from 'lucide-react'
import { SekcjaDom } from './SekcjaDom'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { pobierzKonfiguracjeSynchronizacji } from '../../services/KonfiguracjaSynchronizacji'
import type { BlokKokpitu, TrybKokpitu } from '../../domain/kokpit'
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


function Czas({ data }: { data?: boolean }) {
  const [teraz, ustawTeraz] = useState(() => new Date())
  useEffect(() => {
    const odswiez = () => ustawTeraz(new Date())
    const zegar = window.setInterval(odswiez, 1000)
    document.addEventListener('visibilitychange', odswiez)
    return () => { clearInterval(zegar); document.removeEventListener('visibilitychange', odswiez) }
  }, [])
  return <time className={data ? 'kokpit__data' : 'kokpit__godzina'} dateTime={teraz.toISOString()}>
    {data ? teraz.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : teraz.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
  </time>
}

export function TrescBloku({ blok, data, tryb }: { blok: BlokKokpitu; data: string; tryb: TrybKokpitu }) {
  switch (blok.typ) {
    case 'zegar': return <Czas />
    case 'data': return <Czas data />
    case 'plan': return <SkrotPlanu data={data} />
    case 'zadania': return <SkrotZadan data={data} />
    case 'polaczenie': return <StanPolaczenia />
    case 'echo': return <Link className="przycisk przycisk--glowny" to="/echo"><MessageCircle aria-hidden="true" />Otwórz Echo</Link>
    case 'dom': return tryb === 'prywatny' ? <SekcjaDom /> : <p>Zaloguj się online jako właściciel, aby sprawdzić Home Assistant.</p>
    case 'pogoda': return <p>Brak skonfigurowanego źródła pogody.</p>
    default: return <p>Ten blok jest niedostępny w tej wersji.</p>
  }
}
