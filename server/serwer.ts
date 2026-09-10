import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { KonfiguracjaSerwera } from './config.ts'
import { niedostepnaObslugaEcho, odczytajWiadomoscEcho, type ObslugaEchoApi } from './echo.ts'
import { czyDozwolonaTabela, obsluzKonta, pobierzKontekstSynchronizacji, sprawdzCsrf } from './konta.ts'
import { odczytajPaczkeSynchronizacji, pobierzInstallationIdZNaglowka, pobierzZmianySynchronizacji, zapewnijProfilSynchronizacji, zapiszZmianySynchronizacji } from './synchronizacja.ts'

const METODY_SYNCHRONIZACJI = 'GET, POST, OPTIONS'
const NAGLOWKI_SYNCHRONIZACJI = 'Authorization, Content-Type, X-Ogarniacz-Installation-Id, X-Ogarniacz-CSRF'

function ustawNaglowkiBezpieczenstwa(odpowiedz: ServerResponse): void {
  odpowiedz.setHeader('strict-transport-security', 'max-age=31536000')
  odpowiedz.setHeader('x-content-type-options', 'nosniff')
  odpowiedz.setHeader('x-frame-options', 'DENY')
  odpowiedz.setHeader('referrer-policy', 'same-origin')
}

function ustawCorsSynchronizacji(zadanie: IncomingMessage, odpowiedz: ServerResponse, konfiguracja: KonfiguracjaSerwera): boolean {
  const pochodzenie = zadanie.headers.origin
  if (!pochodzenie || !konfiguracja.dozwolonePochodzeniaCors.includes(pochodzenie)) return false
  odpowiedz.setHeader('access-control-allow-origin', pochodzenie)
  odpowiedz.setHeader('access-control-allow-methods', METODY_SYNCHRONIZACJI)
  odpowiedz.setHeader('access-control-allow-headers', NAGLOWKI_SYNCHRONIZACJI)
  odpowiedz.setHeader('access-control-allow-credentials', 'true')
  odpowiedz.setHeader('vary', 'Origin')
  return true
}

function odpowiedzJson(odpowiedz: ServerResponse, status: number, dane: unknown): void {
  const tresc = JSON.stringify(dane)
  odpowiedz.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  odpowiedz.end(tresc)
}

const typyZawartosci: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function czySciezkaWewnatrzKatalogu(sciezka: string, katalog: string): boolean {
  return sciezka === katalog || sciezka.startsWith(`${katalog}${sep}`)
}

async function odpowiedzZasobemStatycznym(zadanie: IncomingMessage, odpowiedz: ServerResponse, konfiguracja: KonfiguracjaSerwera): Promise<void> {
  const adres = new URL(zadanie.url ?? '/', 'http://localhost')
  let sciezkaZadania: string
  try {
    sciezkaZadania = decodeURIComponent(adres.pathname)
  } catch {
    odpowiedzJson(odpowiedz, 400, { error: 'Niepoprawny adres zasobu.' })
    return
  }
  const katalog = resolve(konfiguracja.sciezkaZasobowStatycznych)
  const kandydat = resolve(katalog, `.${sciezkaZadania}`)
  const istniejePlik = czySciezkaWewnatrzKatalogu(kandydat, katalog)
    && await stat(kandydat).then((informacje) => informacje.isFile()).catch(() => false)
  const sciezkaPliku = istniejePlik ? kandydat : resolve(katalog, 'index.html')
  if (!czySciezkaWewnatrzKatalogu(sciezkaPliku, katalog)) {
    odpowiedzJson(odpowiedz, 404, { error: 'Nie znaleziono zasobu.' })
    return
  }
  try {
    const dane = await readFile(sciezkaPliku)
    odpowiedz.writeHead(200, {
      'content-type': typyZawartosci[extname(sciezkaPliku)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    })
    odpowiedz.end(zadanie.method === 'HEAD' ? undefined : dane)
  } catch {
    odpowiedzJson(odpowiedz, 503, { error: 'Build aplikacji nie jest dostępny na serwerze.' })
  }
}
export function utworzSerwer(konfiguracja: KonfiguracjaSerwera, baza: DatabaseSync, obslugaEcho: ObslugaEchoApi = niedostepnaObslugaEcho) {
  return createServer(async (zadanie: IncomingMessage, odpowiedz: ServerResponse) => {
    ustawNaglowkiBezpieczenstwa(odpowiedz)
    if (zadanie.method === 'GET' && (zadanie.url === '/health' || zadanie.url === '/api/health')) {
      odpowiedzJson(odpowiedz, 200, { status: 'ok', service: 'ogarniacz-api', database: 'connected' })
      return
    }
    if (zadanie.url?.startsWith('/api/auth/') || zadanie.url?.startsWith('/api/account')) {
      const czyDozwolonePochodzenie = ustawCorsSynchronizacji(zadanie, odpowiedz, konfiguracja)
      if (zadanie.method === 'OPTIONS') {
        if (!czyDozwolonePochodzenie) odpowiedzJson(odpowiedz, 403, { error: 'Niedozwolone pochodzenie żądania.' })
        else {
          odpowiedz.writeHead(204)
          odpowiedz.end()
        }
        return
      }
      if (await obsluzKonta(zadanie, odpowiedz, baza, konfiguracja)) return
    }
    if (zadanie.url?.startsWith('/api/sync/')) {
      const czyDozwolonePochodzenie = ustawCorsSynchronizacji(zadanie, odpowiedz, konfiguracja)
      if (zadanie.method === 'OPTIONS') {
        if (!czyDozwolonePochodzenie) {
          odpowiedzJson(odpowiedz, 403, { error: 'Niedozwolone pochodzenie żądania.' })
          return
        }
        odpowiedz.writeHead(204)
        odpowiedz.end()
        return
      }
      const kontekst = pobierzKontekstSynchronizacji(zadanie, baza, konfiguracja)
      if (!kontekst) {
        odpowiedzJson(odpowiedz, 401, { error: 'Brak dostępu do synchronizacji.' })
        return
      }
      if (zadanie.method === 'POST' && kontekst.csrfHash && !sprawdzCsrf(zadanie, kontekst)) {
        odpowiedzJson(odpowiedz, 403, { error: 'Sesja wymaga odświeżenia.' })
        return
      }
      const installationId = pobierzInstallationIdZNaglowka(zadanie)
      if (!installationId) {
        odpowiedzJson(odpowiedz, 400, { error: 'Brak poprawnego installationId.' })
        return
      }
      try {
        zapewnijProfilSynchronizacji(baza, kontekst.uzytkownikId, installationId)
        if (zadanie.method === 'GET' && zadanie.url.startsWith('/api/sync/changes')) {
          const od = new URL(zadanie.url, 'http://localhost').searchParams.get('od') ?? ''
          const synchronizowanoDo = new Date().toISOString()
          const zmiany = pobierzZmianySynchronizacji(baza, kontekst.wlascicielId, od)
            .filter((zmiana) => czyDozwolonaTabela(baza, kontekst, zmiana.tabela, 'odczyt'))
          odpowiedzJson(odpowiedz, 200, { zmiany, synchronizowanoDo })
          return
        }
        if (zadanie.method === 'POST' && zadanie.url === '/api/sync/changes') {
          const paczka = await odczytajPaczkeSynchronizacji(zadanie)
          if (paczka.installationId !== installationId) throw new Error('Niezgodny installationId.')
          if (paczka.zmiany.some((zmiana) => !czyDozwolonaTabela(baza, kontekst, zmiana.tabela, 'edycja'))) {
            odpowiedzJson(odpowiedz, 403, { error: 'Grant nie zezwala na zapis tych danych.' })
            return
          }
          zapiszZmianySynchronizacji(baza, kontekst.wlascicielId, paczka)
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
    if (zadanie.url?.startsWith('/api/')) {
      odpowiedzJson(odpowiedz, 404, { error: 'Nie znaleziono zasobu.' })
      return
    }
    if (zadanie.method === 'GET' || zadanie.method === 'HEAD') {
      await odpowiedzZasobemStatycznym(zadanie, odpowiedz, konfiguracja)
      return
    }
    odpowiedzJson(odpowiedz, 404, { error: 'Nie znaleziono zasobu.' })
  })
}
