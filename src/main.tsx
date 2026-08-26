import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { inicjalizujBaze } from './data/BazaOgarniacza'
import './styles/glowny.css'

await inicjalizujBaze()

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
