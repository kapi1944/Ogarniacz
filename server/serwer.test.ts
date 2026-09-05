import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { otworzBaze } from './baza.ts'
import { utworzKonfiguracjeSerwera } from './config.ts'
import { uruchomMigracje } from './migracje.ts'
import { utworzSerwer } from './serwer.ts'

test('konfiguracja odrzuca niepoprawny port', () => {
  assert.throws(() => utworzKonfiguracjeSerwera({ PORT: '70000' }), /PORT/)
})

test('migracje tworzą schemat centralnej bazy idempotentnie', () => {
  const baza = new DatabaseSync(':memory:')
  assert.equal(uruchomMigracje(baza), 3)
  assert.equal(uruchomMigracje(baza), 3)
  assert.equal(baza.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rekordy_synchronizacji'").get()?.name, 'rekordy_synchronizacji')
  baza.close()
})

test('otwarcie bazy uruchamia migracje', () => {
  const otwartaBaza = otworzBaze(utworzKonfiguracjeSerwera({ DATABASE_PATH: ':memory:' }))
  assert.equal(otwartaBaza.liczbaMigracji, 3)
  assert.equal(otwartaBaza.baza.prepare('SELECT COUNT(*) AS liczba FROM migracje').get()?.liczba, 3)
  otwartaBaza.baza.close()
})

test('healthcheck nie ujawnia konfiguracji ani sekretów', async () => {
  const baza = new DatabaseSync(':memory:')
  const serwer = utworzSerwer(utworzKonfiguracjeSerwera({ PORT: '8788', DATABASE_PATH: '/tajna/sciezka.sqlite' }), baza)
  await new Promise<void>((rozwiaz) => serwer.listen(0, '127.0.0.1', () => rozwiaz()))
  const adres = serwer.address()
  assert.ok(adres && typeof adres === 'object')
  const odpowiedz = await fetch(`http://127.0.0.1:${adres.port}/health`)
  const dane = await odpowiedz.json() as Record<string, unknown>
  assert.equal(odpowiedz.status, 200)
  assert.deepEqual(dane, { status: 'ok', service: 'ogarniacz-api', database: 'connected' })
  await new Promise<void>((rozwiaz, odrzuc) => serwer.close((blad) => blad ? odrzuc(blad) : rozwiaz()))
  baza.close()
})

test('endpoint Echo realizuje kontrakt bez dostępu klienta do modelu', async () => {
  const baza = new DatabaseSync(':memory:')
  const serwer = utworzSerwer(utworzKonfiguracjeSerwera({ PORT: '8788', DATABASE_PATH: ':memory:' }), baza, async (wiadomosc) => ({
    rozmowaId: wiadomosc.rozmowaId ?? 'nowa-rozmowa',
    tryb: 'pelny_agent',
    odpowiedz: `Przyjęto przez ${wiadomosc.zrodlo}.`,
  }))
  await new Promise<void>((rozwiaz) => serwer.listen(0, '127.0.0.1', () => rozwiaz()))
  const adres = serwer.address()
  assert.ok(adres && typeof adres === 'object')
  const odpowiedz = await fetch(`http://127.0.0.1:${adres.port}/api/echo/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wiadomosc: 'Co mam jutro?', zrodlo: 'stt' }) })
  assert.equal(odpowiedz.status, 200)
  assert.deepEqual(await odpowiedz.json(), { rozmowaId: 'nowa-rozmowa', tryb: 'pelny_agent', odpowiedz: 'Przyjęto przez stt.' })
  await new Promise<void>((rozwiaz, odrzuc) => serwer.close((blad) => blad ? odrzuc(blad) : rozwiaz()))
  baza.close()
})

test('endpoint Echo bez providera zwraca kontrolowany tryb ograniczony', async () => {
  const baza = new DatabaseSync(':memory:')
  const serwer = utworzSerwer(utworzKonfiguracjeSerwera({ PORT: '8788', DATABASE_PATH: ':memory:' }), baza)
  await new Promise<void>((rozwiaz) => serwer.listen(0, '127.0.0.1', () => rozwiaz()))
  const adres = serwer.address()
  assert.ok(adres && typeof adres === 'object')
  const odpowiedz = await fetch(`http://127.0.0.1:${adres.port}/api/echo/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wiadomosc: 'Cześć' }) })
  assert.equal(odpowiedz.status, 503)
  assert.deepEqual(await odpowiedz.json(), { status: 'niedostepny', tryb: 'ograniczony_lokalny', odpowiedz: 'Pełna rozmowa z Echo nie jest jeszcze dostępna.' })
  await new Promise<void>((rozwiaz, odrzuc) => serwer.close((blad) => blad ? odrzuc(blad) : rozwiaz()))
  baza.close()
})

test('sync przenosi rekord z instalacji A do instalacji B', async () => {
  const baza = new DatabaseSync(':memory:')
  uruchomMigracje(baza)
  const konfiguracja = utworzKonfiguracjeSerwera({
    PORT: '8788',
    DATABASE_PATH: ':memory:',
    SYNC_USER_ID: 'wlasciciel',
    SYNC_ACCESS_KEY: 'sekretny-klucz-testowy',
  })
  const serwer = utworzSerwer(konfiguracja, baza)
  await new Promise<void>((rozwiaz) => serwer.listen(0, '127.0.0.1', () => rozwiaz()))
  const adres = serwer.address()
  assert.ok(adres && typeof adres === 'object')
  const url = `http://127.0.0.1:${adres.port}/api/sync/changes`
  const rekord = { id: 'zadanie-a', createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z', tytul: 'Z urządzenia A' }
  const naglowkiA = { authorization: 'Bearer sekretny-klucz-testowy', 'x-ogarniacz-installation-id': 'instalacja-a', 'content-type': 'application/json' }
  const paczka = { od: '1970-01-01T00:00:00.000Z', installationId: 'instalacja-a', zmiany: [{ zmianaId: 'zmiana-idempotentna-a', tabela: 'zadania', rekord, installationId: 'instalacja-a' }] }
  const wyslanie = await fetch(url, { method: 'POST', headers: naglowkiA, body: JSON.stringify(paczka) })
  assert.equal(wyslanie.status, 200)
  const ponowienie = await fetch(url, { method: 'POST', headers: naglowkiA, body: JSON.stringify(paczka) })
  assert.equal(ponowienie.status, 200)
  assert.equal(baza.prepare('SELECT version FROM rekordy_synchronizacji WHERE rekord_id = ?').get('zadanie-a')?.version, 1)
  assert.equal(baza.prepare('SELECT COUNT(*) AS liczba FROM przetworzone_zmiany_synchronizacji').get()?.liczba, 1)

  const pobranie = await fetch(`${url}?od=1970-01-01T00%3A00%3A00.000Z`, { headers: { authorization: 'Bearer sekretny-klucz-testowy', 'x-ogarniacz-installation-id': 'instalacja-b' } })
  assert.equal(pobranie.status, 200)
  const pobraneDane = await pobranie.json() as { zmiany: unknown[]; synchronizowanoDo: string }
  assert.deepEqual(pobraneDane.zmiany, [{ tabela: 'zadania', rekord, installationId: 'instalacja-a' }])
  assert.ok(!Number.isNaN(Date.parse(pobraneDane.synchronizowanoDo)))
  assert.equal(baza.prepare('SELECT COUNT(*) AS liczba FROM instalacje').get()?.liczba, 2)
  await new Promise<void>((rozwiaz, odrzuc) => serwer.close((blad) => blad ? odrzuc(blad) : rozwiaz()))
  baza.close()
})

test('sync obsługuje preflight CORS wyłącznie dla aplikacji Capacitor', async () => {
  const baza = new DatabaseSync(':memory:')
  const serwer = utworzSerwer(utworzKonfiguracjeSerwera({ DATABASE_PATH: ':memory:' }), baza)
  await new Promise<void>((rozwiaz) => serwer.listen(0, '127.0.0.1', () => rozwiaz()))
  const adres = serwer.address()
  assert.ok(adres && typeof adres === 'object')
  const url = `http://127.0.0.1:${adres.port}/api/sync/changes`
  const preflight = await fetch(url, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://localhost',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,content-type,x-ogarniacz-installation-id',
    },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://localhost')
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS')
  assert.equal(preflight.headers.get('access-control-allow-headers'), 'Authorization, Content-Type, X-Ogarniacz-Installation-Id')

  const obcePochodzenie = await fetch(url, { method: 'OPTIONS', headers: { origin: 'https://obca-strona.example' } })
  assert.equal(obcePochodzenie.status, 403)
  assert.equal(obcePochodzenie.headers.get('access-control-allow-origin'), null)
  await new Promise<void>((rozwiaz, odrzuc) => serwer.close((blad) => blad ? odrzuc(blad) : rozwiaz()))
  baza.close()
})

test('sync odrzuca ciche nadpisanie nowszej wersji z innej instalacji', async () => {
  const baza = new DatabaseSync(':memory:')
  uruchomMigracje(baza)
  const konfiguracja = utworzKonfiguracjeSerwera({ DATABASE_PATH: ':memory:', SYNC_USER_ID: 'wlasciciel', SYNC_ACCESS_KEY: 'sekretny-klucz-testowy' })
  const serwer = utworzSerwer(konfiguracja, baza)
  await new Promise<void>((rozwiaz) => serwer.listen(0, '127.0.0.1', () => rozwiaz()))
  const adres = serwer.address()
  assert.ok(adres && typeof adres === 'object')
  const url = `http://127.0.0.1:${adres.port}/api/sync/changes`
  const wyslij = (instalacja: string, tytul: string, updatedAt: string) => fetch(url, {
    method: 'POST',
    headers: { authorization: 'Bearer sekretny-klucz-testowy', 'x-ogarniacz-installation-id': instalacja, 'content-type': 'application/json' },
    body: JSON.stringify({
      od: '1970-01-01T00:00:00.000Z',
      installationId: instalacja,
      zmiany: [{ tabela: 'zadania', installationId: instalacja, rekord: { id: 'wspolne', createdAt: '2026-09-01T08:00:00.000Z', updatedAt, tytul } }],
    }),
  })

  assert.equal((await wyslij('instalacja-a', 'Wersja A', '2026-09-01T09:00:00.000Z')).status, 200)
  assert.equal((await wyslij('instalacja-b', 'Wersja B', '2026-09-01T10:00:00.000Z')).status, 409)
  assert.equal(JSON.parse(String(baza.prepare('SELECT dane_json FROM rekordy_synchronizacji').get()?.dane_json)).tytul, 'Wersja A')
  await new Promise<void>((rozwiaz, odrzuc) => serwer.close((blad) => blad ? odrzuc(blad) : rozwiaz()))
  baza.close()
})
