import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { KonfiguracjaSerwera } from './config.ts'
import { niedostepnaObslugaEcho, odczytajWiadomoscEcho, type ObslugaEchoApi } from './echo.ts'
import { BladModeluEcho, odczytajZadanieModeluEcho, utworzObslugeModeluEcho, type ObslugaModeluEcho } from './model-echo.ts'
import { czyDozwolonaTabela, obsluzKonta, pobierzKontekstDostepu, sprawdzCsrf } from './konta.ts'
import { utworzAktualizacjeRpi, type AktualizacjeRpi } from './aktualizacje-rpi.ts'
import { utworzDostawceSmartHome, type DostawcaSmartHome } from './smart-home.ts'
import { odczytajPaczkeSynchronizacji, pobierzInstallationIdZNaglowka, pobierzZmianySynchronizacji, zapewnijProfilSynchronizacji, zapiszZmianySynchronizacji } from './synchronizacja.ts'

const METODY_SYNCHRONIZACJI = 'GET, POST, PUT, OPTIONS'
const NAGLOWKI_SYNCHRONIZACJI = 'Content-Type, X-Ogarniacz-Installation-Id, X-Ogarniacz-CSRF, X-Ogarniacz-User-Id, X-Ogarniacz-Owner-Id'

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
  '.webmanifest': 'application/manifest+json; charset=utf-8',
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
export function utworzSerwer(
  konfiguracja: KonfiguracjaSerwera,
  baza: DatabaseSync,
  obslugaEcho: ObslugaEchoApi = niedostepnaObslugaEcho,
  aktualizacje?: AktualizacjeRpi,
  obslugaModeluEcho: ObslugaModeluEcho = utworzObslugeModeluEcho(konfiguracja),
  dom: DostawcaSmartHome = utworzDostawceSmartHome({ adres: konfiguracja.adresHomeAssistant, token: konfiguracja.tokenHomeAssistant, limitCzasuMs: konfiguracja.limitCzasuHomeAssistantMs }),
) {
  const aktualizacjeRpi = aktualizacje ?? (konfiguracja.aktualizacjeRpi ? utworzAktualizacjeRpi() : undefined)
  return createServer(async (zadanie: IncomingMessage, odpowiedz: ServerResponse) => {
    ustawNaglowkiBezpieczenstwa(odpowiedz)
    if (zadanie.method === 'GET' && (zadanie.url === '/health' || zadanie.url === '/api/health')) {
      odpowiedzJson(odpowiedz, 200, { status: 'ok', service: 'ogarniacz-api', database: 'connected' })
      return
    }
    if (zadanie.url === '/api/dom' || zadanie.url?.startsWith('/api/dom/')) {
      const pochodzenie = zadanie.headers.origin
      const dozwoloneCors = ustawCorsSynchronizacji(zadanie, odpowiedz, konfiguracja)
      const wlasnePochodzenie = pochodzenie === `https://${zadanie.headers.host}` || pochodzenie === `http://${zadanie.headers.host}`
      if (pochodzenie && !dozwoloneCors && !wlasnePochodzenie) {
        odpowiedzJson(odpowiedz, 403, { error: 'Niedozwolone pochodzenie żądania.' })
        return
      }
      if (zadanie.method === 'OPTIONS') {
        odpowiedz.writeHead(dozwoloneCors ? 204 : 403)
        odpowiedz.end()
        return
      }
      const kontekst = pobierzKontekstDostepu(zadanie, baza)
      if (!kontekst) {
        odpowiedzJson(odpowiedz, 401, { error: 'Wymagana aktywna sesja Ogarniacza.' })
        return
      }
      if (kontekst.rola !== 'wlasciciel' || (konfiguracja.wlascicielHomeAssistant && kontekst.wlascicielId !== konfiguracja.wlascicielHomeAssistant)) {
        odpowiedzJson(odpowiedz, 403, { error: 'Brak uprawnień do tej instalacji Home Assistant.' })
        return
      }
      const skonfigurowany = Boolean(konfiguracja.adresHomeAssistant && konfiguracja.tokenHomeAssistant && konfiguracja.wlascicielHomeAssistant)
      const kontroler = new AbortController()
      zadanie.on('aborted', () => kontroler.abort())
      odpowiedz.on('close', () => { if (!odpowiedz.writableEnded) kontroler.abort() })
      try {
        if (zadanie.method === 'GET' && zadanie.url === '/api/dom') {
          const { dostepny } = skonfigurowany ? await dom.sprawdzDostepnosc(kontroler.signal) : { dostepny: false }
          const encje = dostepny ? await Promise.all((konfiguracja.encjeHomeAssistant ?? []).map(async (id) => {
            const encja = await dom.pobierzStan(id, kontroler.signal)
            return { ...(encja ?? { id, nazwa: id, stan: 'Brak encji', dostepna: false }), akcje: encja?.dostepna && /^(light|switch)\./.test(id) && konfiguracja.sterowaneEncjeHomeAssistant?.includes(id) ? ['wlacz', 'wylacz'] : [] }
          })) : []
          odpowiedzJson(odpowiedz, 200, { skonfigurowany, dostepny, encje })
          return
        }
        const akcja = /^\/api\/dom\/([a-z0-9_]+\.[a-z0-9_]+)\/(wlacz|wylacz)$/.exec(zadanie.url ?? '')
        if (zadanie.method === 'POST' && akcja) {
          if (!sprawdzCsrf(zadanie, kontekst)) {
            odpowiedzJson(odpowiedz, 403, { error: 'Sesja wymaga odświeżenia.' })
            return
          }
          const id = akcja[1]
          if (!skonfigurowany || !/^(light|switch)\./.test(id) || !konfiguracja.encjeHomeAssistant?.includes(id) || !konfiguracja.sterowaneEncjeHomeAssistant?.includes(id)) {
            odpowiedzJson(odpowiedz, 403, { error: 'Sterowanie tą encją jest wyłączone.' })
            return
          }
          odpowiedzJson(odpowiedz, 200, await (akcja[2] === 'wlacz' ? dom.wlacz(id, kontroler.signal) : dom.wylacz(id, kontroler.signal)))
          return
        }
        odpowiedzJson(odpowiedz, 404, { error: 'Nie znaleziono akcji Domu.' })
      } catch {
        if (!odpowiedz.destroyed) odpowiedzJson(odpowiedz, 503, { error: 'Nie udało się uzyskać odpowiedzi Home Assistant. Sprawdź stan urządzenia przed ponowieniem akcji.' })
      }
      return
    }
    if (zadanie.url?.startsWith('/api/rpi-update')) {
      if (!konfiguracja.aktualizacjeRpi) {
        odpowiedzJson(odpowiedz, 404, { error: 'Aktualizacje Raspberry są wyłączone.' })
        return
      }
      const kontekst = pobierzKontekstDostepu(zadanie, baza)
      if (kontekst?.rola !== 'wlasciciel') {
        odpowiedzJson(odpowiedz, 403, { error: 'Wymagana sesja właściciela.' })
        return
      }
      const adres = new URL(zadanie.url, 'http://localhost')
      const akcja = adres.pathname.slice('/api/rpi-update'.length)
      if (zadanie.method === 'GET' && (akcja === '' || akcja === '/status')) {
        try { odpowiedzJson(odpowiedz, 200, await aktualizacjeRpi!.odczytaj()) }
        catch { odpowiedzJson(odpowiedz, 503, { error: 'Nie można odczytać stanu aktualizacji.' }) }
        return
      }
      if (zadanie.method === 'POST' && ['/check', '/start', '/rollback'].includes(akcja)) {
        const zdalny = zadanie.socket.remoteAddress
        if (zdalny !== '127.0.0.1' && zdalny !== '::1' && zdalny !== '::ffff:127.0.0.1') {
          odpowiedzJson(odpowiedz, 403, { error: 'Aktualizację można uruchomić tylko lokalnie.' })
          return
        }
        const pochodzenie = zadanie.headers.origin
        if (pochodzenie && pochodzenie !== `http://127.0.0.1:${konfiguracja.port}` && pochodzenie !== `http://localhost:${konfiguracja.port}` && !konfiguracja.dozwolonePochodzeniaCors.includes(pochodzenie)) {
          odpowiedzJson(odpowiedz, 403, { error: 'Niedozwolone pochodzenie żądania.' })
          return
        }
        if (!sprawdzCsrf(zadanie, kontekst)) {
          odpowiedzJson(odpowiedz, 403, { error: 'Sesja wymaga odświeżenia.' })
          return
        }
        try {
          const wynik = await aktualizacjeRpi!.uruchom(akcja.slice(1) as 'check' | 'start' | 'rollback')
          odpowiedzJson(odpowiedz, wynik === 'przyjeto' ? 202 : wynik === 'zajete' ? 409 : 412, wynik === 'przyjeto' ? { status: 'przyjeto' } : { error: wynik === 'zajete' ? 'Aktualizacja już trwa.' : 'Brak poprawnej pary commitów do rollbacku.' })
        } catch { odpowiedzJson(odpowiedz, 503, { error: 'Nie można uruchomić aktualizatora.' }) }
        return
      }
      odpowiedzJson(odpowiedz, 404, { error: 'Nie znaleziono zasobu aktualizacji.' })
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
      const kontekst = pobierzKontekstDostepu(zadanie, baza)
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
            .filter((zmiana) => czyDozwolonaTabela(baza, kontekst, zmiana.tabela, 'odczyt', zmiana.rekord))
          odpowiedzJson(odpowiedz, 200, { zmiany, synchronizowanoDo })
          return
        }
        if (zadanie.method === 'POST' && zadanie.url === '/api/sync/changes') {
          const paczka = await odczytajPaczkeSynchronizacji(zadanie)
          const aktualny = pobierzKontekstDostepu(zadanie, baza)
          if (!aktualny || aktualny.uzytkownikId !== kontekst.uzytkownikId || aktualny.wlascicielId !== kontekst.wlascicielId || !sprawdzCsrf(zadanie, aktualny)) {
            odpowiedzJson(odpowiedz, 401, { error: 'Sesja zmieniła się podczas odbierania danych.' })
            return
          }
          if (paczka.installationId !== installationId) throw new Error('Niezgodny installationId.')
          const pominiete = paczka.zmiany.filter((zmiana) => zmiana.tabela === 'wpisyTerapii')
            .map((zmiana) => ({ tabela: zmiana.tabela, rekordId: zmiana.rekord.id, zmianaId: zmiana.zmianaId, powod: 'tabela_lokalna' }))
          paczka.zmiany = paczka.zmiany.filter((zmiana) => zmiana.tabela !== 'wpisyTerapii')
          if (paczka.zmiany.some((zmiana) => {
            const poprzedni = baza.prepare('SELECT dane_json FROM rekordy_synchronizacji WHERE uzytkownik_id = ? AND tabela = ? AND rekord_id = ?').get(kontekst.wlascicielId, zmiana.tabela, zmiana.rekord.id)
            return !czyDozwolonaTabela(baza, kontekst, zmiana.tabela, 'edycja', zmiana.rekord)
              || Boolean(poprzedni && !czyDozwolonaTabela(baza, kontekst, zmiana.tabela, 'edycja', JSON.parse(String(poprzedni.dane_json))))
          })) {
            odpowiedzJson(odpowiedz, 403, { error: 'Grant nie zezwala na zapis tych danych.' })
            return
          }
          const zapisano = zapiszZmianySynchronizacji(baza, kontekst.wlascicielId, paczka)
          odpowiedzJson(odpowiedz, 200, { zapisano, pominiete })
          return
        }
        odpowiedzJson(odpowiedz, 404, { error: 'Nie znaleziono zasobu synchronizacji.' })
      } catch (blad) {
        const konflikt = blad instanceof Error && blad.message.startsWith('KONFLIKT_SYNC:')
        odpowiedzJson(odpowiedz, konflikt ? 409 : 400, { error: konflikt ? 'Serwer wykrył nowszą wersję rekordu. Pobierz zmiany i rozstrzygnij konflikt.' : 'Niepoprawne dane synchronizacji.' })
      }
      return
    }
    if (zadanie.url === '/api/echo/model') {
      const czyDozwolonePochodzenie = ustawCorsSynchronizacji(zadanie, odpowiedz, konfiguracja)
      if (zadanie.method === 'OPTIONS') {
        if (!czyDozwolonePochodzenie) odpowiedzJson(odpowiedz, 403, { error: 'Niedozwolone pochodzenie żądania.' })
        else {
          odpowiedz.writeHead(204)
          odpowiedz.end()
        }
        return
      }
      if (zadanie.method !== 'POST') {
        odpowiedzJson(odpowiedz, 404, { error: 'Nie znaleziono zasobu.' })
        return
      }
      if (!czyDozwolonePochodzenie) {
        odpowiedzJson(odpowiedz, 403, { error: 'Niedozwolone pochodzenie żądania.' })
        return
      }
      const kontekst = pobierzKontekstDostepu(zadanie, baza)
      if (!kontekst) {
        odpowiedzJson(odpowiedz, 401, { error: 'Wymagana aktywna sesja Ogarniacza.' })
        return
      }
      if (!sprawdzCsrf(zadanie, kontekst)) {
        odpowiedzJson(odpowiedz, 403, { error: 'Sesja wymaga odświeżenia.' })
        return
      }
      const kontroler = new AbortController()
      zadanie.on('aborted', () => kontroler.abort())
      odpowiedz.on('close', () => {
        if (!odpowiedz.writableEnded) kontroler.abort()
      })
      try {
        const zadanieModelu = await odczytajZadanieModeluEcho(zadanie)
        odpowiedzJson(odpowiedz, 200, await obslugaModeluEcho(zadanieModelu, kontroler.signal))
      } catch (blad) {
        if (odpowiedz.destroyed) return
        if (blad instanceof BladModeluEcho) odpowiedzJson(odpowiedz, blad.statusHttp, { error: blad.message })
        else odpowiedzJson(odpowiedz, 503, { error: 'Lokalny model Echo jest niedostępny.' })
      }
      return
    }
    if (zadanie.url === '/api/echo/message') {
      const czyDozwolonePochodzenie = ustawCorsSynchronizacji(zadanie, odpowiedz, konfiguracja)
      if (zadanie.method === 'OPTIONS') {
        if (!czyDozwolonePochodzenie) odpowiedzJson(odpowiedz, 403, { error: 'Niedozwolone pochodzenie żądania.' })
        else {
          odpowiedz.writeHead(204)
          odpowiedz.end()
        }
        return
      }
      if (zadanie.method !== 'POST') {
        odpowiedzJson(odpowiedz, 404, { error: 'Nie znaleziono zasobu.' })
        return
      }
      if (!czyDozwolonePochodzenie) {
        odpowiedzJson(odpowiedz, 403, { error: 'Niedozwolone pochodzenie żądania.' })
        return
      }
      const kontekst = pobierzKontekstDostepu(zadanie, baza)
      if (!kontekst) {
        odpowiedzJson(odpowiedz, 401, { error: 'Wymagana aktywna sesja Ogarniacza.' })
        return
      }
      if (!sprawdzCsrf(zadanie, kontekst)) {
        odpowiedzJson(odpowiedz, 403, { error: 'Sesja wymaga odświeżenia.' })
        return
      }
      const kontroler = new AbortController()
      zadanie.on('aborted', () => kontroler.abort())
      odpowiedz.on('close', () => {
        if (!odpowiedz.writableEnded) kontroler.abort()
      })
      try {
        const wiadomosc = await odczytajWiadomoscEcho(zadanie)
        odpowiedzJson(odpowiedz, 200, await obslugaEcho(wiadomosc, kontroler.signal))
      } catch (blad) {
        if (odpowiedz.destroyed) return
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
