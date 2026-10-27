import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { platforma } from '../platform/platforma'
import { nasluchujKontroliAktualizacji, pobierzStanKontroliAktualizacji } from '../services/KontrolaAktualizacjiAplikacji'
import { Modal } from '../components/Interfejs'
import { PowiadomienieAktualizacji } from './PowiadomienieAktualizacji'
import type { StanInstalacjiAktualizacji } from '../platform/typy'

const PanelAktualizacji = lazy(() => import('../modules/ustawienia/PanelAktualizacji').then((modul) => ({ default: modul.PanelAktualizacji })))

export function AktualizacjaAndroid() {
  const stan = useSyncExternalStore(nasluchujKontroliAktualizacji, pobierzStanKontroliAktualizacji, pobierzStanKontroliAktualizacji)
  const [odlozone, ustawOdlozone] = useState<number[]>([])
  const [otwarty, ustawOtwarty] = useState(false)
  const [instalacja, ustawInstalacje] = useState<StanInstalacjiAktualizacji>()
  useEffect(() => {
    if (!platforma.natywna) return
    let aktywny = true
    const zastosuj = (wynik: StanInstalacjiAktualizacji) => { if (aktywny) ustawInstalacje(wynik) }
    const odswiez = () => { void platforma.aktualizacje.pobierzStanInstalacji().then(zastosuj).catch(() => undefined) }
    odswiez()
    const nasluchiwanie = platforma.aktualizacje.nasluchujStanuInstalacji(zastosuj).catch(() => () => undefined)
    const cyklZycia = platforma.cyklZycia.nasluchuj((stanCyklu) => { if (stanCyklu === 'aktywny') odswiez() }).catch(() => () => undefined)
    return () => {
      aktywny = false
      void nasluchiwanie.then((usun) => usun()).catch(() => undefined)
      void cyklZycia.then((usun) => usun()).catch(() => undefined)
    }
  }, [])
  const wynik = stan.wynikApk
  const doWznowienia = instalacja?.maZweryfikowanyApk && (instalacja.moznaPonowicInstalacje || instalacja.maPotwierdzenieInstalacji)
  const kodPowiadomienia = doWznowienia ? instalacja.versionCodeDocelowy : wynik?.czyNowsza ? wynik.manifest.versionCode : undefined
  if (!platforma.natywna) return null
  return <>
    {kodPowiadomienia !== undefined && !otwarty && !odlozone.includes(kodPowiadomienia) && <PowiadomienieAktualizacji
      opis={doWznowienia ? 'Możesz dokończyć instalację pobranego APK bez konta i połączenia z serwerem.' : `Dostępna wersja ${wynik?.manifest.versionName}. Instalację potwierdzisz w Androidzie.`}
      odloz={() => ustawOdlozone((wersje) => [...wersje, kodPowiadomienia])}
      aktualizuj={() => { ustawOdlozone((wersje) => [...wersje, kodPowiadomienia]); ustawOtwarty(true) }}
    />}
    {otwarty && <Modal tytul="Aktualizacja Ogarniacza" zamknij={() => ustawOtwarty(false)}>
      <Suspense fallback={<p role="status">Ładowanie aktualizacji…</p>}><PanelAktualizacji /></Suspense>
    </Modal>}
  </>
}
