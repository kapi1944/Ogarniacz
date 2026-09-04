import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { inicjalizujBaze } from './data/BazaOgarniacza'
import { repozytoriumUstawien } from './data/RepozytoriumUstawien'
import { zastosujUstawieniaInterfejsu } from './domain/ustawienia'
import { inicjalizujPlatforme } from './platform/platforma'
import { inicjalizujWidgetSnapshotService } from './services/WidgetSnapshotService'
import { inicjalizujSynchronizacjeAplikacji } from './services/SynchronizacjaAplikacji'
import { AktualizacjaPwa } from './app/AktualizacjaPwa'
import './styles/glowny.css'

await inicjalizujBaze()
await inicjalizujPlatforme()
zastosujUstawieniaInterfejsu(
  await repozytoriumUstawien.wczytaj(),
  window.matchMedia('(prefers-color-scheme: dark)').matches,
  window.matchMedia('(prefers-reduced-motion: reduce)').matches,
)
inicjalizujWidgetSnapshotService()
createRoot(document.getElementById('root')!).render(<StrictMode><App /><AktualizacjaPwa /></StrictMode>)
void inicjalizujSynchronizacjeAplikacji()
