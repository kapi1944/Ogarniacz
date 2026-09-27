import { utworzKonfiguracjeSerwera } from './config.ts'
import { otworzBaze } from './baza.ts'
import { utworzSerwer } from './serwer.ts'

const konfiguracja = utworzKonfiguracjeSerwera()
const otwartaBaza = otworzBaze(konfiguracja)
const serwer = utworzSerwer(konfiguracja, otwartaBaza.baza)

serwer.on('clientError', (blad, gniazdo) => {
  console.error(`Odrzucono niepoprawne żądanie HTTP: ${blad.message}`)
  if (gniazdo.writable) gniazdo.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
})
serwer.on('error', (blad) => console.error(`Błąd serwera Ogarniacza: ${blad.message}`))

serwer.listen(konfiguracja.port, konfiguracja.host, () => {
  console.log(`Ogarniacz API nasłuchuje na ${konfiguracja.host}:${konfiguracja.port}`)
})

let zamykanie = false
function zamknij(): void {
  if (zamykanie) return
  zamykanie = true
  const limitZamykania = setTimeout(() => {
    console.error('Przekroczono limit zamykania serwera.')
    serwer.closeAllConnections()
    process.exit(1)
  }, 10_000)
  serwer.close(() => {
    clearTimeout(limitZamykania)
    try {
      otwartaBaza.baza.close()
    } catch (blad) {
      console.error('Nie udało się zamknąć bazy:', blad)
      process.exitCode = 1
    }
    process.exit()
  })
  serwer.closeAllConnections()
}

process.on('SIGINT', zamknij)
process.on('SIGTERM', zamknij)
