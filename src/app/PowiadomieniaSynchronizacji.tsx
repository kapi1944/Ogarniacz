import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { pobierzPowiadomieniaSynchronizacji, nasluchujPowiadomienSynchronizacji, zamknijKomunikatSynchronizacji } from '../services/PowiadomieniaSynchronizacji'
import { pobierzStanSynchronizacji } from '../services/SyncEngine'
import { czySynchronizacjaSkonfigurowana } from '../services/SynchronizacjaAplikacji'
import { komunikatyBledowSynchronizacji } from '../services/DiagnostykaSynchronizacji'

export function PowiadomieniaSynchronizacji() {
  const powiadomienia = useSyncExternalStore(nasluchujPowiadomienSynchronizacji, pobierzPowiadomieniaSynchronizacji, pobierzPowiadomieniaSynchronizacji)
  const stan = useLiveQuery(() => pobierzStanSynchronizacji(), [], undefined)
  const [pokazPostep, ustawPokazPostep] = useState(false)
  const skonfigurowana = czySynchronizacjaSkonfigurowana()
  const uwaga = !skonfigurowana ? '' : stan?.sesjaWymagaLogowania
    ? 'Zaloguj się ponownie przez panel konta, aby wznowić synchronizację.'
    : (stan?.liczbaKonfliktow ?? 0) > 0
      ? `Konflikty danych: ${stan?.liczbaKonfliktow}. Wybierz rozwiązanie w Ustawieniach.`
      : stan?.stan === 'blad' || stan?.polaczenie === 'niedostepne'
        ? komunikatyBledowSynchronizacji[stan.kodOstatniegoBledu ?? 'blad_synchronizacji']
        : ''

  useEffect(() => {
    ustawPokazPostep(false)
    if (!powiadomienia.etap || uwaga) return
    const zegar = window.setTimeout(() => ustawPokazPostep(true), 700)
    return () => window.clearTimeout(zegar)
  }, [powiadomienia.etap, uwaga])

  const komunikat = powiadomienia.komunikat
  useEffect(() => {
    if (!komunikat) return
    const zegar = window.setTimeout(() => zamknijKomunikatSynchronizacji(komunikat.id), Math.max(0, komunikat.wygasaAt - Date.now()))
    return () => window.clearTimeout(zegar)
  }, [komunikat])

  const widocznyKomunikat = komunikat && komunikat.wygasaAt > Date.now() ? komunikat : undefined
  return <>
    {uwaga && <aside className="uwaga-synchronizacji" role="status"><span>{uwaga} Dane lokalne pozostają dostępne.</span><Link to="/ustawienia#synchronizacja">Szczegóły synchronizacji</Link></aside>}
    {(widocznyKomunikat || (powiadomienia.etap && pokazPostep)) && <aside className="toast-synchronizacji" role="status" aria-live="polite">
      <span>{widocznyKomunikat?.tresc ?? (powiadomienia.etap === 'wysylanie' ? 'Wysyłanie zmian…' : 'Pobieranie zmian…')}</span>
      {widocznyKomunikat?.typ === 'ostrzezenie' && <Link to="/ustawienia#synchronizacja">Szczegóły</Link>}
      {widocznyKomunikat && <button type="button" className="przycisk przycisk--tekstowy" aria-label="Zamknij powiadomienie synchronizacji" onClick={() => zamknijKomunikatSynchronizacji(widocznyKomunikat.id)}>Zamknij</button>}
    </aside>}
  </>
}
