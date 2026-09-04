import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { registerSW } from 'virtual:pwa-register'
import { platforma } from '../platform/platforma'

const CZESTOTLIWOSC_SPRAWDZANIA_MS = 15 * 60 * 1000

export function AktualizacjaPwa() {
  const [nowaWersja, ustawNowaWersje] = useState(false)
  const [gotoweOffline, ustawGotoweOffline] = useState(false)
  const [blad, ustawBlad] = useState('')
  const aktualizujRef = useRef<((przeladuj?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    if (platforma.natywna || !('serviceWorker' in navigator)) return
    aktualizujRef.current = registerSW({
      immediate: true,
      onNeedRefresh: () => ustawNowaWersje(true),
      onOfflineReady: () => ustawGotoweOffline(true),
      onRegisterError: () => ustawBlad('Nie udało się uruchomić obsługi offline.'),
    })
    const sprawdz = () => void navigator.serviceWorker.ready.then((rejestracja) => rejestracja.update()).catch(() => undefined)
    const zegar = window.setInterval(sprawdz, CZESTOTLIWOSC_SPRAWDZANIA_MS)
    const poPowrocie = () => sprawdz()
    window.addEventListener('online', poPowrocie)
    return () => {
      window.clearInterval(zegar)
      window.removeEventListener('online', poPowrocie)
    }
  }, [])

  useEffect(() => {
    if (!gotoweOffline) return
    const zegar = window.setTimeout(() => ustawGotoweOffline(false), 4000)
    return () => window.clearTimeout(zegar)
  }, [gotoweOffline])

  if (!nowaWersja && !gotoweOffline && !blad) return null
  return <aside className="komunikat-pwa" role={nowaWersja || blad ? 'alert' : 'status'}>
    <div>
      <strong>{nowaWersja ? 'Nowa wersja Ogarniacza jest gotowa' : gotoweOffline ? 'Ogarniacz działa także offline' : 'Obsługa offline jest niedostępna'}</strong>
      <span>{nowaWersja ? 'Odśwież aplikację, aby frontend i API pozostały zgodne.' : blad || 'Dane i aplikacja zostały zapisane na tym urządzeniu.'}</span>
    </div>
    {nowaWersja && <button type="button" className="przycisk przycisk--glowny" onClick={() => void aktualizujRef.current?.(true)}><RefreshCw aria-hidden="true" />Aktualizuj teraz</button>}
  </aside>
}
