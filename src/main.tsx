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

await inicjalizujBaze()
await inicjalizujPlatforme()
await inicjalizujRuntimeConfig()
zastosujUstawieniaInterfejsu(
  await repozytoriumUstawien.wczytaj(),
  window.matchMedia('(prefers-color-scheme: dark)').matches,
  window.matchMedia('(prefers-reduced-motion: reduce)').matches,
)
inicjalizujWidgetSnapshotService()
createRoot(document.getElementById('root')!).render(
  <StrictMode><App /><AktualizacjaPwa /><PotwierdzenieGotowosciBundle /></StrictMode>,
)
void inicjalizujSynchronizacjeAplikacji()
void inicjalizujKontroleAktualizacjiAplikacji()
