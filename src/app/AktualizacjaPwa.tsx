import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { platforma } from '../platform/platforma'
import { PowiadomienieAktualizacji } from './PowiadomienieAktualizacji'

const CZESTOTLIWOSC_SPRAWDZANIA_MS = 15 * 60 * 1000

export function AktualizacjaPwa() {
  const [nowaWersja, ustawNowaWersje] = useState(false)
  const [gotoweOffline, ustawGotoweOffline] = useState(false)
  const [blad, ustawBlad] = useState('')
  const aktualizujRef = useRef<((przeladuj?: boolean) => Promise<void>) | null>(null)
  const odlozoneRef = useRef(new Set<ServiceWorker>())
  const oczekujacyRef = useRef<ServiceWorker | null>(null)

  useEffect(() => {
    if (platforma.natywna || !('serviceWorker' in navigator)) return
    aktualizujRef.current ??= registerSW({
      immediate: true,
      onNeedRefresh: () => {
        void navigator.serviceWorker.getRegistration().then((rejestracja) => {
          const oczekujacy = rejestracja?.waiting
          if (!oczekujacy || odlozoneRef.current.has(oczekujacy)) return
          oczekujacyRef.current = oczekujacy
          ustawNowaWersje(true)
        }).catch(() => ustawBlad('Nie udało się odczytać dostępnej aktualizacji.'))
      },
      onOfflineReady: () => ustawGotoweOffline(true),
      onRegisterError: () => ustawBlad('Nie udało się uruchomić obsługi offline.'),
    })
    const sprawdz = () => void navigator.serviceWorker.ready.then((rejestracja) => rejestracja.update()).catch(() => undefined)
    sprawdz()
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
  if (nowaWersja) return <PowiadomienieAktualizacji opis={blad || 'Aktualizacja odświeży okno aplikacji.'}
    odloz={() => { if (oczekujacyRef.current) odlozoneRef.current.add(oczekujacyRef.current); ustawNowaWersje(false); ustawGotoweOffline(false) }}
    aktualizuj={() => { void aktualizujRef.current?.(true).catch(() => ustawBlad('Nie udało się zastosować aktualizacji. Spróbuj ponownie.')) }}
  />
  return <aside className="komunikat-pwa" role={blad ? 'alert' : 'status'}>
    <div>
      <strong>{blad ? 'Obsługa offline jest niedostępna' : 'Ogarniacz działa także offline'}</strong>
      <span>{blad || 'Aplikacja została zapisana na tym urządzeniu. Funkcje sieciowe wymagają połączenia.'}</span>
    </div>
  </aside>
}
