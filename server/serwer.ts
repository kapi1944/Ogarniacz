import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'
import type { KonfiguracjaSerwera } from './config.ts'

function odpowiedzJson(odpowiedz: ServerResponse, status: number, dane: unknown): void {
  const tresc = JSON.stringify(dane)
  odpowiedz.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  odpowiedz.end(tresc)
}

export function utworzSerwer(_konfiguracja: KonfiguracjaSerwera, _baza: DatabaseSync) {
  return createServer((zadanie: IncomingMessage, odpowiedz: ServerResponse) => {
    if (zadanie.method === 'GET' && (zadanie.url === '/health' || zadanie.url === '/api/health')) {
      odpowiedzJson(odpowiedz, 200, { status: 'ok', service: 'ogarniacz-api', database: 'connected' })
      return
    }
    odpowiedzJson(odpowiedz, 404, { error: 'Nie znaleziono zasobu.' })
  })
}
