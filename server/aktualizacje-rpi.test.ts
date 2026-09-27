import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { utworzKonfiguracjeSerwera } from './config.ts'
import { uruchomMigracje } from './migracje.ts'
import { utworzSerwer } from './serwer.ts'

test('API aktualizacji wymaga jawnego włączenia, sesji właściciela i CSRF', async () => {
  const baza = new DatabaseSync(':memory:')
  uruchomMigracje(baza)
  const teraz = '2026-09-01T00:00:00.000Z'
  const hash = (wartosc: string) => createHash('sha256').update(wartosc).digest('hex')
  for (const id of ['wlasciciel', 'edytor']) {
    baza.prepare('INSERT INTO uzytkownicy (id, email, haslo_hash, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, ?, ?)').run(id, `${id}@example.test`, 'hash', teraz, teraz)
  }
  baza.prepare("INSERT INTO czlonkostwa (wlasciciel_id, uzytkownik_id, rola, status, utworzono_at, zaktualizowano_at) VALUES ('wlasciciel', 'wlasciciel', 'wlasciciel', 'aktywne', ?, ?)").run(teraz, teraz)
  baza.prepare("INSERT INTO czlonkostwa (wlasciciel_id, uzytkownik_id, rola, status, utworzono_at, zaktualizowano_at) VALUES ('wlasciciel', 'edytor', 'edytor', 'aktywne', ?, ?)").run(teraz, teraz)
  for (const id of ['wlasciciel', 'edytor']) {
    baza.prepare('INSERT INTO sesje (token_hash, uzytkownik_id, aktywny_wlasciciel_id, csrf_hash, wygasa_at, ostatnia_aktywnosc_at, utworzono_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(hash(id), id, 'wlasciciel', hash('csrf'), '2099-01-01T00:00:00.000Z', teraz, teraz)
  }
  const akcje: string[] = []
  const aktualizacje = {
    odczytaj: async () => ({ wersja: '1.0.13', commit: 'a'.repeat(40), originMain: null, dostepnosc: 'nieznana' as const, stan: 'idle', komunikat: '', moznaPrzywrocic: false }),
    uruchom: async (akcja: 'check' | 'start' | 'rollback') => { akcje.push(akcja); return true },
  }
  const uruchomSerwer = async (wlaczone: boolean) => {
    const serwer = utworzSerwer(utworzKonfiguracjeSerwera({ RPI_UPDATE_ENABLED: wlaczone ? '1' : '0', CORS_ALLOWED_ORIGINS: 'https://ogarniacz.tailnet.ts.net' }), baza, undefined, aktualizacje)
    await new Promise<void>((rozwiaz) => serwer.listen(0, '127.0.0.1', rozwiaz))
    const adres = serwer.address()
    assert.ok(adres && typeof adres === 'object')
    return { serwer, url: `http://127.0.0.1:${adres.port}/api/rpi-update` }
  }
  const wylaczony = await uruchomSerwer(false)
  assert.equal((await fetch(`${wylaczony.url}/status`)).status, 404)
  await new Promise<void>((rozwiaz) => wylaczony.serwer.close(() => rozwiaz()))
  const wlaczony = await uruchomSerwer(true)
  try {
    assert.equal((await fetch(`${wlaczony.url}/status`)).status, 403)
    assert.equal((await fetch(`${wlaczony.url}/status`, { headers: { cookie: 'ogarniacz_sesja=edytor' } })).status, 403)
    assert.equal((await fetch(`${wlaczony.url}/status`, { headers: { cookie: 'ogarniacz_sesja=wlasciciel' } })).status, 200)
    const post = (naglowki: Record<string, string>) => fetch(`${wlaczony.url}/start`, { method: 'POST', headers: naglowki })
    assert.equal((await post({ cookie: 'ogarniacz_sesja=wlasciciel' })).status, 403)
    assert.equal((await post({ cookie: 'ogarniacz_sesja=wlasciciel', 'x-ogarniacz-csrf': 'csrf', origin: 'https://obca.example' })).status, 403)
    assert.equal((await post({ cookie: 'ogarniacz_sesja=edytor', 'x-ogarniacz-csrf': 'csrf' })).status, 403)
    assert.equal((await post({ cookie: 'ogarniacz_sesja=wlasciciel', 'x-ogarniacz-csrf': 'csrf', origin: 'https://ogarniacz.tailnet.ts.net' })).status, 202)
    assert.equal((await post({ cookie: 'ogarniacz_sesja=wlasciciel', 'x-ogarniacz-csrf': 'csrf' })).status, 202)
    assert.deepEqual(akcje, ['start', 'start'])
  } finally {
    await new Promise<void>((rozwiaz) => wlaczony.serwer.close(() => rozwiaz()))
    baza.close()
  }
})
