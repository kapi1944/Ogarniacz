import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { utworzKonfiguracjeSerwera } from './config.ts'
import { uruchomMigracje } from './migracje.ts'
import { utworzSerwer } from './serwer.ts'

const TERAZ = '2026-09-09T12:00:00.000Z'
const WYGASA = '2099-01-01T00:00:00.000Z'

function hash(wartosc: string): string {
  return createHash('sha256').update(wartosc).digest('hex')
}

function dodajUzytkownika(baza: DatabaseSync, id: string, email: string): void {
  baza.prepare('INSERT INTO uzytkownicy (id, email, haslo_hash, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, email, 'hash-testowy', TERAZ, TERAZ)
  baza.prepare("INSERT INTO czlonkostwa (wlasciciel_id, uzytkownik_id, rola, status, utworzono_at, zaktualizowano_at) VALUES (?, ?, 'wlasciciel', 'aktywne', ?, ?)")
    .run(id, id, TERAZ, TERAZ)
}

function dodajSesje(baza: DatabaseSync, token: string, csrf: string, uzytkownikId: string, wlascicielId = uzytkownikId, rola: 'wlasciciel' | 'edytor' = 'wlasciciel'): void {
  if (rola === 'edytor') {
    baza.prepare("INSERT INTO czlonkostwa (wlasciciel_id, uzytkownik_id, rola, status, utworzono_at, zaktualizowano_at) VALUES (?, ?, 'edytor', 'aktywne', ?, ?)")
      .run(wlascicielId, uzytkownikId, TERAZ, TERAZ)
  }
  baza.prepare('INSERT INTO sesje (token_hash, uzytkownik_id, aktywny_wlasciciel_id, csrf_hash, wygasa_at, ostatnia_aktywnosc_at, utworzono_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(hash(token), uzytkownikId, wlascicielId, hash(csrf), WYGASA, TERAZ, TERAZ)
}

function dodajRekord(baza: DatabaseSync, wlascicielId: string, id: string, tytul: string): void {
  const rekord = { id, tytul, createdAt: TERAZ, updatedAt: TERAZ }
  baza.prepare(`INSERT INTO rekordy_synchronizacji
    (uzytkownik_id, tabela, rekord_id, dane_json, created_at, updated_at, version, ostatnia_instalacja_id, server_updated_at)
    VALUES (?, 'zadania', ?, ?, ?, ?, 1, 'instalacja-serwera', ?)`)
    .run(wlascicielId, id, JSON.stringify(rekord), TERAZ, TERAZ, TERAZ)
}

async function zSerwerem(
  wykonaj: (adres: string, baza: DatabaseSync) => Promise<void>,
  env: NodeJS.ProcessEnv = { DATABASE_PATH: ':memory:' },
): Promise<void> {
  const baza = new DatabaseSync(':memory:')
  uruchomMigracje(baza)
  const serwer = utworzSerwer(utworzKonfiguracjeSerwera(env), baza)
  await new Promise<void>((rozwiaz) => serwer.listen(0, '127.0.0.1', () => rozwiaz()))
  const adres = serwer.address()
  assert.ok(adres && typeof adres === 'object')
  try {
    await wykonaj(`http://127.0.0.1:${adres.port}`, baza)
  } finally {
    await new Promise<void>((rozwiaz, odrzuc) => serwer.close((blad) => blad ? odrzuc(blad) : rozwiaz()))
    baza.close()
  }
}

function naglowki(token: string, csrf?: string): Record<string, string> {
  return {
    cookie: `ogarniacz_sesja=${token}`,
    'x-ogarniacz-installation-id': 'instalacja-testowa',
    'content-type': 'application/json',
    ...(csrf ? { 'x-ogarniacz-csrf': csrf } : {}),
  }
}

function tokenZCookie(odpowiedz: Response): string {
  const cookie = odpowiedz.headers.get('set-cookie') ?? ''
  const token = /ogarniacz_sesja=([^;]+)/.exec(cookie)?.[1]
  assert.ok(token)
  return decodeURIComponent(token)
}

test('bootstrap, logowanie, zaproszenie i jednorazowy kod odzyskiwania tworzą bezpieczne sesje', async () => {
  await zSerwerem(async (adres) => {
    const bootstrap = await fetch(`${adres}/api/auth/bootstrap`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.test', haslo: 'Bardzo-dlugie-haslo-1', token: 'token-bootstrapu-testowy' }),
    })
    assert.equal(bootstrap.status, 201)
    assert.match(bootstrap.headers.get('set-cookie') ?? '', /HttpOnly; Secure; SameSite=None/)
    const daneWlasciciela = await bootstrap.json() as { csrf: string; kodyOdzyskiwania: string[]; rola: string }
    assert.equal(daneWlasciciela.rola, 'wlasciciel')
    assert.equal(daneWlasciciela.kodyOdzyskiwania.length, 8)
    const tokenWlasciciela = tokenZCookie(bootstrap)

    const zaproszenie = await fetch(`${adres}/api/account/invitations`, {
      method: 'POST', headers: naglowki(tokenWlasciciela, daneWlasciciela.csrf),
      body: JSON.stringify({ email: 'editor@example.test' }),
    })
    assert.equal(zaproszenie.status, 201)
    const tokenZaproszenia = (await zaproszenie.json() as { token: string }).token
    const przyjecie = await fetch(`${adres}/api/auth/invitations/accept`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenZaproszenia, haslo: 'Haslo-edytora-dlugie-2' }),
    })
    assert.equal(przyjecie.status, 200)
    assert.equal((await przyjecie.json() as { rola: string }).rola, 'edytor')

    const odzyskanie = await fetch(`${adres}/api/auth/recover`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.test', kod: daneWlasciciela.kodyOdzyskiwania[0], noweHaslo: 'Nowe-bardzo-dlugie-haslo-3' }),
    })
    assert.equal(odzyskanie.status, 200)
    assert.equal((await fetch(`${adres}/api/auth/session`, { headers: naglowki(tokenWlasciciela) })).status, 401)
    assert.equal((await fetch(`${adres}/api/auth/recover`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.test', kod: daneWlasciciela.kodyOdzyskiwania[0], noweHaslo: 'Jeszcze-inne-dlugie-haslo-4' }),
    })).status, 401)

    const logowanie = await fetch(`${adres}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.test', haslo: 'Nowe-bardzo-dlugie-haslo-3' }),
    })
    assert.equal(logowanie.status, 200)
    assert.match(logowanie.headers.get('set-cookie') ?? '', /HttpOnly; Secure; SameSite=None/)

    let status = 0
    for (let numer = 0; numer < 11; numer += 1) {
      status = (await fetch(`${adres}/api/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.test', haslo: 'Nieprawidlowe-haslo-9' }),
      })).status
    }
    assert.equal(status, 429)
  }, { DATABASE_PATH: ':memory:', OWNER_BOOTSTRAP_TOKEN: 'token-bootstrapu-testowy' })
})

test('Właściciel A nie czyta ani nie zmienia danych Właściciela B', async () => {
  await zSerwerem(async (adres, baza) => {
    dodajUzytkownika(baza, 'wlasciciel-a', 'a@example.test')
    dodajUzytkownika(baza, 'wlasciciel-b', 'b@example.test')
    dodajSesje(baza, 'token-a', 'csrf-a', 'wlasciciel-a')
    dodajRekord(baza, 'wlasciciel-a', 'zadanie-a', 'Dane A')
    dodajRekord(baza, 'wlasciciel-b', 'zadanie-b', 'Dane B')

    const pobranie = await fetch(`${adres}/api/sync/changes?od=1970-01-01T00%3A00%3A00.000Z`, { headers: naglowki('token-a') })
    assert.equal(pobranie.status, 200)
    const dane = await pobranie.json() as { zmiany: { rekord: { id: string } }[] }
    assert.deepEqual(dane.zmiany.map((zmiana) => zmiana.rekord.id), ['zadanie-a'])

    const obcyId = { id: 'zadanie-b', tytul: 'Próba A', createdAt: TERAZ, updatedAt: '2026-09-09T13:00:00.000Z' }
    const zapis = await fetch(`${adres}/api/sync/changes`, {
      method: 'POST', headers: naglowki('token-a', 'csrf-a'),
      body: JSON.stringify({ od: TERAZ, installationId: 'instalacja-testowa', zmiany: [{ zmianaId: 'zmiana-wlasciciela-a', bazowyUpdatedAt: TERAZ, tabela: 'zadania', rekord: obcyId, installationId: 'instalacja-testowa' }] }),
    })
    assert.equal(zapis.status, 200)
    const rekordB = baza.prepare('SELECT dane_json FROM rekordy_synchronizacji WHERE uzytkownik_id = ? AND rekord_id = ?').get('wlasciciel-b', 'zadanie-b')
    assert.equal(JSON.parse(String(rekordB?.dane_json)).tytul, 'Dane B')
  })
})

test('Edytor nie przekracza grantu, a cofnięty grant natychmiast blokuje synchronizację', async () => {
  await zSerwerem(async (adres, baza) => {
    dodajUzytkownika(baza, 'wlasciciel', 'owner@example.test')
    baza.prepare('INSERT INTO uzytkownicy (id, email, haslo_hash, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, ?, ?)')
      .run('edytor', 'editor@example.test', 'hash-testowy', TERAZ, TERAZ)
    dodajSesje(baza, 'token-edytora', 'csrf-edytora', 'edytor', 'wlasciciel', 'edytor')
    dodajRekord(baza, 'wlasciciel', 'zadanie', 'Dane Właściciela')
    baza.prepare(`INSERT INTO granty_dostepu
      (id, wlasciciel_id, edytor_id, modul, sekcja, odczyt, edycja, status, utworzono_at, zaktualizowano_at)
      VALUES ('grant', 'wlasciciel', 'edytor', 'zadania', 'sekcja-testowa', 1, 0, 'aktywne', ?, ?)`).run(TERAZ, TERAZ)

    const url = `${adres}/api/sync/changes`
    const grantSekcji = await fetch(`${url}?od=1970-01-01T00%3A00%3A00.000Z`, { headers: naglowki('token-edytora') })
    assert.deepEqual((await grantSekcji.json() as { zmiany: unknown[] }).zmiany, [])
    baza.prepare("UPDATE granty_dostepu SET sekcja = '' WHERE id = ?").run('grant')
    const grantModulu = await fetch(`${url}?od=1970-01-01T00%3A00%3A00.000Z`, { headers: naglowki('token-edytora') })
    assert.deepEqual((await grantModulu.json() as { zmiany: { rekord: { id: string } }[] }).zmiany.map((zmiana) => zmiana.rekord.id), ['zadanie'])
    const rekord = { id: 'zadanie', tytul: 'Zmiana Edytora', createdAt: TERAZ, updatedAt: '2026-09-09T13:00:00.000Z' }
    const paczka = { od: TERAZ, installationId: 'instalacja-testowa', zmiany: [{ zmianaId: 'zmiana-edytora-1', bazowyUpdatedAt: TERAZ, tabela: 'zadania', rekord, installationId: 'instalacja-testowa' }] }
    assert.equal((await fetch(url, { method: 'POST', headers: naglowki('token-edytora', 'csrf-edytora'), body: JSON.stringify(paczka) })).status, 403)

    baza.prepare('UPDATE granty_dostepu SET edycja = 1 WHERE id = ?').run('grant')
    assert.equal((await fetch(url, { method: 'POST', headers: naglowki('token-edytora', 'csrf-edytora'), body: JSON.stringify(paczka) })).status, 200)
    baza.prepare("UPDATE granty_dostepu SET status = 'cofniete' WHERE id = ?").run('grant')
    const poCofnieciu = await fetch(`${url}?od=1970-01-01T00%3A00%3A00.000Z`, { headers: naglowki('token-edytora') })
    assert.deepEqual((await poCofnieciu.json() as { zmiany: unknown[] }).zmiany, [])
    assert.equal((await fetch(url, { method: 'POST', headers: naglowki('token-edytora', 'csrf-edytora'), body: JSON.stringify({ ...paczka, zmiany: [{ ...paczka.zmiany[0], zmianaId: 'zmiana-edytora-2' }] }) })).status, 403)
  })
})

test('cofnięcie Edytora unieważnia jego sesję', async () => {
  await zSerwerem(async (adres, baza) => {
    dodajUzytkownika(baza, 'wlasciciel', 'owner@example.test')
    baza.prepare('INSERT INTO uzytkownicy (id, email, haslo_hash, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, ?, ?)')
      .run('edytor', 'editor@example.test', 'hash-testowy', TERAZ, TERAZ)
    dodajSesje(baza, 'token-wlasciciela', 'csrf-wlasciciela', 'wlasciciel')
    dodajSesje(baza, 'token-edytora', 'csrf-edytora', 'edytor', 'wlasciciel', 'edytor')

    const cofniecie = await fetch(`${adres}/api/account/editors/revoke`, {
      method: 'POST', headers: naglowki('token-wlasciciela', 'csrf-wlasciciela'), body: JSON.stringify({ editorId: 'edytor' }),
    })
    assert.equal(cofniecie.status, 200)
    assert.equal((await fetch(`${adres}/api/sync/changes?od=1970-01-01T00%3A00%3A00.000Z`, { headers: naglowki('token-edytora') })).status, 401)
  })
})
