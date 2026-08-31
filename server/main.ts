import { utworzKonfiguracjeSerwera } from './config.ts'
import { otworzBaze } from './baza.ts'
import { utworzSerwer } from './serwer.ts'

const konfiguracja = utworzKonfiguracjeSerwera()
const otwartaBaza = otworzBaze(konfiguracja)
const serwer = utworzSerwer(konfiguracja, otwartaBaza.baza)

serwer.listen(konfiguracja.port, konfiguracja.host, () => {
  console.log(`Ogarniacz API nasłuchuje na ${konfiguracja.host}:${konfiguracja.port}`)
})

function zamknij(): void {
  serwer.close(() => otwartaBaza.baza.close())
}

process.on('SIGINT', zamknij)
process.on('SIGTERM', zamknij)
