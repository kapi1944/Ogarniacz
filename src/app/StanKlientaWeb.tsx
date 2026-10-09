import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Cloud, CloudOff, HardDrive } from 'lucide-react'
import { Link } from 'react-router-dom'
import { czySynchronizacjaSkonfigurowana } from '../services/SynchronizacjaAplikacji'
import { pobierzStanSynchronizacji } from '../services/SyncEngine'

export function StanKlientaWeb() {
  const [online, ustawOnline] = useState(() => navigator.onLine)
  const stan = useLiveQuery(() => pobierzStanSynchronizacji(), [], undefined)
  const skonfigurowana = czySynchronizacjaSkonfigurowana()

  useEffect(() => {
    const polaczono = () => ustawOnline(true)
    const rozlaczono = () => ustawOnline(false)
    window.addEventListener('online', polaczono)
    window.addEventListener('offline', rozlaczono)
    return () => {
      window.removeEventListener('online', polaczono)
      window.removeEventListener('offline', rozlaczono)
    }
  }, [])

  const oczekujace = stan?.liczbaOczekujacych ?? 0
  const wymagaUwagi = skonfigurowana && (stan?.sesjaWymagaLogowania || (stan?.liczbaKonfliktow ?? 0) > 0 || stan?.stan === 'blad' || stan?.polaczenie === 'niedostepne')
  const etykieta = !online
    ? `Praca lokalna offline${oczekujace ? ` · ${oczekujace} oczekuje` : ''}`
    : !skonfigurowana
      ? 'Dane tylko lokalne'
      : stan?.stan === 'synchronizacja'
        ? 'Trwa synchronizacja'
      : wymagaUwagi
        ? `Wymaga uwagi${oczekujace ? ` · ${oczekujace} oczekuje` : ''}`
        : oczekujace
          ? `${oczekujace} zmian oczekuje na sync`
          : stan?.ostatniSync ? 'Zsynchronizowano' : 'Oczekuje na pierwszą synchronizację'
  const Ikona = !online || wymagaUwagi ? CloudOff : skonfigurowana ? Cloud : HardDrive

  return <Link to="/ustawienia#synchronizacja" className={`stan-klienta ${!online || wymagaUwagi ? 'stan-klienta--ostrzezenie' : ''}`} title="Szczegóły synchronizacji" aria-label={`${etykieta}. Szczegóły synchronizacji`}>
    <Ikona aria-hidden="true" /><span role="status">{etykieta}</span>
  </Link>
}
