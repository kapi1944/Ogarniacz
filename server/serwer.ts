import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'
import type { KonfiguracjaSerwera } from './config.ts'
import { niedostepnaObslugaEcho, odczytajWiadomoscEcho, type ObslugaEchoApi } from './echo.ts'

function odpowiedzJson(odpowiedz: ServerResponse, status: number, dane: unknown): void {
  const tresc = JSON.stringify(dane)
  odpowiedz.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  odpowiedz.end(tresc)
}

export function utworzSerwer(_konfiguracja: KonfiguracjaSerwera, _baza: DatabaseSync, obslugaEcho: ObslugaEchoApi = niedostepnaObslugaEcho) {
  return createServer(async (zadanie: IncomingMessage, odpowiedz: ServerResponse) => {
    if (zadanie.method === 'GET' && (zadanie.url === '/health' || zadanie.url === '/api/health')) {
      odpowiedzJson(odpowiedz, 200, { status: 'ok', service: 'ogarniacz-api', database: 'connected' })
      return
    }
    if (zadanie.method === 'POST' && zadanie.url === '/api/echo/message') {
      const kontroler = new AbortController()
      zadanie.on('aborted', () => kontroler.abort())
      try {
        const wiadomosc = await odczytajWiadomoscEcho(zadanie)
        odpowiedzJson(odpowiedz, 200, await obslugaEcho(wiadomosc, kontroler.signal))
      } catch (blad) {
        if (blad instanceof Error && blad.message === 'MODEL_ECHO_NIEDOSTEPNY') {
          odpowiedzJson(odpowiedz, 503, { status: 'niedostepny', tryb: 'ograniczony_lokalny', odpowiedz: 'Pełna rozmowa z Echo nie jest jeszcze dostępna.' })
        } else {
          odpowiedzJson(odpowiedz, 400, { error: 'Niepoprawna wiadomość Echo.' })
        }
      }
      return
    }
    odpowiedzJson(odpowiedz, 404, { error: 'Nie znaleziono zasobu.' })
  })
}
