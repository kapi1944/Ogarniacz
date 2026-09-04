import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Cloud, CloudOff, HardDrive } from 'lucide-react'
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
  const bladSerwera = skonfigurowana && online && stan?.stan === 'blad'
  const etykieta = !online
    ? `Praca lokalna offline${oczekujace ? ` · ${oczekujace} oczekuje` : ''}`
    : !skonfigurowana
      ? 'Dane tylko lokalne'
      : bladSerwera
        ? `Serwer niedostępny${oczekujace ? ` · ${oczekujace} oczekuje` : ''}`
        : oczekujace
          ? `${oczekujace} zmian oczekuje na sync`
          : 'Dane zsynchronizowane'
  const Ikona = !online || bladSerwera ? CloudOff : skonfigurowana ? Cloud : HardDrive

  return <span className={`stan-klienta ${!online || bladSerwera ? 'stan-klienta--ostrzezenie' : ''}`} title={etykieta} role="status">
    <Ikona aria-hidden="true" /><span>{etykieta}</span>
  </span>
}
