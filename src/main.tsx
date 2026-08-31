import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { inicjalizujBaze } from './data/BazaOgarniacza'
import { inicjalizujPlatforme } from './platform/platforma'
import { inicjalizujWidgetSnapshotService } from './services/WidgetSnapshotService'
import './styles/glowny.css'

await inicjalizujPlatforme()
await inicjalizujBaze()
inicjalizujWidgetSnapshotService()

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
