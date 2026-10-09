import { lazy, Suspense, useState, useSyncExternalStore } from 'react'
import { platforma } from '../platform/platforma'
import { nasluchujKontroliAktualizacji, pobierzStanKontroliAktualizacji } from '../services/KontrolaAktualizacjiAplikacji'
import { Modal } from '../components/Interfejs'
import { PowiadomienieAktualizacji } from './PowiadomienieAktualizacji'

const PanelAktualizacji = lazy(() => import('../modules/ustawienia/PanelAktualizacji').then((modul) => ({ default: modul.PanelAktualizacji })))

export function AktualizacjaAndroid() {
  const stan = useSyncExternalStore(nasluchujKontroliAktualizacji, pobierzStanKontroliAktualizacji, pobierzStanKontroliAktualizacji)
  const [odlozone, ustawOdlozone] = useState<number[]>([])
  const [otwarty, ustawOtwarty] = useState(false)
  const wynik = stan.wynikApk
  if (!platforma.natywna) return null
  return <>
    {wynik?.czyNowsza && !otwarty && !odlozone.includes(wynik.manifest.versionCode) && <PowiadomienieAktualizacji
      opis={`Dostępna wersja ${wynik.manifest.versionName}. Instalację potwierdzisz w Androidzie.`}
      odloz={() => ustawOdlozone((wersje) => [...wersje, wynik.manifest.versionCode])}
      aktualizuj={() => { ustawOdlozone((wersje) => [...wersje, wynik.manifest.versionCode]); ustawOtwarty(true) }}
    />}
    {otwarty && <Modal tytul="Aktualizacja Ogarniacza" zamknij={() => ustawOtwarty(false)}>
      <Suspense fallback={<p role="status">Ładowanie aktualizacji…</p>}><PanelAktualizacji /></Suspense>
    </Modal>}
  </>
}
