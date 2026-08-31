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
  assert.equal(uruchomMigracje(baza), 1)
  assert.equal(uruchomMigracje(baza), 1)
  assert.equal(baza.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rekordy_synchronizacji'").get()?.name, 'rekordy_synchronizacji')
  baza.close()
})

test('otwarcie bazy uruchamia migracje', () => {
  const otwartaBaza = otworzBaze(utworzKonfiguracjeSerwera({ DATABASE_PATH: ':memory:' }))
  assert.equal(otwartaBaza.liczbaMigracji, 1)
  assert.equal(otwartaBaza.baza.prepare('SELECT COUNT(*) AS liczba FROM migracje').get()?.liczba, 1)
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
