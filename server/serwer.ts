import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'
import type { KonfiguracjaSerwera } from './config.ts'
import { niedostepnaObslugaEcho, odczytajWiadomoscEcho, type ObslugaEchoApi } from './echo.ts'
import { czyDostepDoSynchronizacji, odczytajPaczkeSynchronizacji, pobierzInstallationIdZNaglowka, pobierzZmianySynchronizacji, zapewnijProfilSynchronizacji, zapiszZmianySynchronizacji } from './synchronizacja.ts'

function odpowiedzJson(odpowiedz: ServerResponse, status: number, dane: unknown): void {
  const tresc = JSON.stringify(dane)
  odpowiedz.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  odpowiedz.end(tresc)
}

export function utworzSerwer(konfiguracja: KonfiguracjaSerwera, baza: DatabaseSync, obslugaEcho: ObslugaEchoApi = niedostepnaObslugaEcho) {
  return createServer(async (zadanie: IncomingMessage, odpowiedz: ServerResponse) => {
    if (zadanie.method === 'GET' && (zadanie.url === '/health' || zadanie.url === '/api/health')) {
      odpowiedzJson(odpowiedz, 200, { status: 'ok', service: 'ogarniacz-api', database: 'connected' })
      return
    }
    if (zadanie.url?.startsWith('/api/sync/')) {
      if (!konfiguracja.syncUserId || !konfiguracja.syncAccessKey) {
        odpowiedzJson(odpowiedz, 503, { error: 'Synchronizacja nie jest skonfigurowana na serwerze.' })
        return
      }
      if (!czyDostepDoSynchronizacji(zadanie, konfiguracja)) {
        odpowiedzJson(odpowiedz, 401, { error: 'Brak dostępu do synchronizacji.' })
        return
      }
      const installationId = pobierzInstallationIdZNaglowka(zadanie)
      if (!installationId) {
        odpowiedzJson(odpowiedz, 400, { error: 'Brak poprawnego installationId.' })
        return
      }
      try {
        zapewnijProfilSynchronizacji(baza, konfiguracja.syncUserId, installationId)
        if (zadanie.method === 'GET' && zadanie.url.startsWith('/api/sync/changes')) {
          const od = new URL(zadanie.url, 'http://localhost').searchParams.get('od') ?? ''
          const synchronizowanoDo = new Date().toISOString()
          odpowiedzJson(odpowiedz, 200, { zmiany: pobierzZmianySynchronizacji(baza, konfiguracja.syncUserId, od), synchronizowanoDo })
          return
        }
        if (zadanie.method === 'POST' && zadanie.url === '/api/sync/changes') {
          const paczka = await odczytajPaczkeSynchronizacji(zadanie)
          if (paczka.installationId !== installationId) throw new Error('Niezgodny installationId.')
          zapiszZmianySynchronizacji(baza, konfiguracja.syncUserId, paczka)
          odpowiedzJson(odpowiedz, 200, { zapisano: paczka.zmiany.length })
          return
        }
        odpowiedzJson(odpowiedz, 404, { error: 'Nie znaleziono zasobu synchronizacji.' })
      } catch (blad) {
        const konflikt = blad instanceof Error && blad.message.startsWith('KONFLIKT_SYNC:')
        odpowiedzJson(odpowiedz, konflikt ? 409 : 400, { error: konflikt ? 'Serwer wykrył nowszą wersję rekordu. Pobierz zmiany i rozstrzygnij konflikt.' : 'Niepoprawne dane synchronizacji.' })
      }
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
