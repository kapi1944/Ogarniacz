import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { inicjalizujBaze } from './data/BazaOgarniacza'
import { repozytoriumUstawien } from './data/RepozytoriumUstawien'
import { zastosujUstawieniaInterfejsu } from './domain/ustawienia'
import { inicjalizujPlatforme } from './platform/platforma'
import { PotwierdzenieGotowosciBundle } from './app/PotwierdzenieGotowosciBundle'
import { inicjalizujWidgetSnapshotService } from './services/WidgetSnapshotService'
import { inicjalizujSynchronizacjeAplikacji } from './services/SynchronizacjaAplikacji'
import { inicjalizujKontroleAktualizacjiAplikacji } from './services/KontrolaAktualizacjiAplikacji'
import { inicjalizujRuntimeConfig } from './services/RuntimeConfigService'
import { AktualizacjaPwa } from './app/AktualizacjaPwa'
import './styles/glowny.css'
import { GranicaBledu, KomunikatBleduAsynchronicznego } from './components/GranicaBledu'

const korzen = createRoot(document.getElementById('root')!)
try {
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
    <StrictMode><KomunikatBleduAsynchronicznego /><GranicaBledu><App /><AktualizacjaPwa /><PotwierdzenieGotowosciBundle /></GranicaBledu></StrictMode>,
  )
  void inicjalizujSynchronizacjeAplikacji()
  void inicjalizujKontroleAktualizacjiAplikacji()
} catch {
  korzen.render(<section className="karta" role="alert"><h1>Nie udało się uruchomić aplikacji</h1><p>Nie czyść danych aplikacji. Spróbuj ją odświeżyć.</p><button className="przycisk" onClick={() => window.location.reload()}>Spróbuj ponownie</button></section>)
}
