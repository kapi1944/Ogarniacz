import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { inicjalizujBaze } from './data/BazaOgarniacza'
import { repozytoriumUstawien } from './data/RepozytoriumUstawien'
import { zastosujUstawieniaInterfejsu } from './domain/ustawienia'
import { inicjalizujPlatforme } from './platform/platforma'
import { inicjalizujWidgetSnapshotService } from './services/WidgetSnapshotService'
import { inicjalizujSynchronizacjeAplikacji } from './services/SynchronizacjaAplikacji'
import { inicjalizujKontroleAktualizacjiAplikacji } from './services/KontrolaAktualizacjiAplikacji'
import { inicjalizujRuntimeConfig } from './services/RuntimeConfigService'
import { AktualizacjaPwa } from './app/AktualizacjaPwa'
import { AktualizacjaAndroid } from './app/AktualizacjaAndroid'
import './styles/glowny.css'
import { GranicaBledu, KomunikatBleduAsynchronicznego } from './components/GranicaBledu'
import { przygotujProfilStartowy, nasluchujZmianyProfilu, ZDARZENIE_ZAMKNIECIA_PROFILU } from './services/KontekstProfilu'
import { EkranMigracjiProfilu } from './app/EkranMigracjiProfilu'
import { DostawcaKonta } from './app/DostawcaKonta'
import { EkranResetowaniaHasla, pobierzTokenResetuZAdresu } from './app/OdzyskiwanieHasla'

const korzen = createRoot(document.getElementById('root')!)
const tokenResetowaniaHasla = pobierzTokenResetuZAdresu()
window.addEventListener(ZDARZENIE_ZAMKNIECIA_PROFILU, () => korzen.render(<main className="ekran-konta"><p role="status">Zmiana konta. Widok danych został zamknięty.</p></main>))
nasluchujZmianyProfilu()
try {
  await inicjalizujRuntimeConfig()
  if (tokenResetowaniaHasla !== undefined) {
    korzen.render(<EkranResetowaniaHasla token={tokenResetowaniaHasla} />)
  } else {
  const kontekst = await przygotujProfilStartowy()
  if (kontekst.migracja) {
    korzen.render(<EkranMigracjiProfilu profil={kontekst.migracja} />)
  } else if (kontekst.zmianaHasla) {
    korzen.render(<DostawcaKonta><p>Sprawdzam zmianę hasła…</p></DostawcaKonta>)
  } else {
  await inicjalizujBaze()
  await inicjalizujPlatforme()
  await inicjalizujRuntimeConfig()
  zastosujUstawieniaInterfejsu(
    await repozytoriumUstawien.wczytaj(),
    window.matchMedia('(prefers-color-scheme: dark)').matches,
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  inicjalizujWidgetSnapshotService()
  korzen.render(
    <StrictMode><KomunikatBleduAsynchronicznego /><GranicaBledu><App /><AktualizacjaPwa /><AktualizacjaAndroid /></GranicaBledu></StrictMode>,
  )
  void inicjalizujSynchronizacjeAplikacji()
  void inicjalizujKontroleAktualizacjiAplikacji()
  }
  }
} catch {
  korzen.render(<section className="karta" role="alert"><h1>Nie udało się uruchomić aplikacji</h1><p>Nie czyść danych aplikacji. Spróbuj ją odświeżyć.</p><button className="przycisk" onClick={() => window.location.reload()}>Spróbuj ponownie</button></section>)
}
