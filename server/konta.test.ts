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

test('sync odrzuca GET, POST i Bearer bez normalnej sesji', async () => {
  await zSerwerem(async (adres) => {
    const url = `${adres}/api/sync/changes`
    const naglowkiInstalacji = { 'x-ogarniacz-installation-id': 'instalacja-testowa' }
    assert.equal((await fetch(`${url}?od=${encodeURIComponent(TERAZ)}`, { headers: naglowkiInstalacji })).status, 401)
    assert.equal((await fetch(url, {
      method: 'POST',
      headers: { ...naglowkiInstalacji, 'content-type': 'application/json' },
      body: JSON.stringify({ od: TERAZ, installationId: 'instalacja-testowa', zmiany: [] }),
    })).status, 401)
    assert.equal((await fetch(`${url}?od=${encodeURIComponent(TERAZ)}`, {
      headers: { ...naglowkiInstalacji, Authorization: 'Bearer cokolwiek' },
    })).status, 401)
  })
})

test('bootstrap przyjmuje hasło od 8 znaków i pozostaje jednorazowy', async () => {
  await zSerwerem(async (adres, baza) => {
    const statusPrzed = await fetch(`${adres}/api/auth/bootstrap/status`)
    assert.equal(statusPrzed.status, 200)
    assert.deepEqual(await statusPrzed.json(), { dostepny: true })

    const zaKrotkieHaslo = await fetch(`${adres}/api/auth/bootstrap`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.test', haslo: '1234567', token: 'token-bootstrapu-testowy' }),
    })
    assert.equal(zaKrotkieHaslo.status, 400)
    assert.deepEqual(await zaKrotkieHaslo.json(), { error: 'Hasło musi mieć od 8 do 200 znaków.' })

    const pierwszyBootstrap = await fetch(`${adres}/api/auth/bootstrap`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.test', haslo: '12345678', token: 'token-bootstrapu-testowy' }),
    })
    assert.equal(pierwszyBootstrap.status, 201)
    assert.equal((await pierwszyBootstrap.json() as { rolaSystemowa: string }).rolaSystemowa, 'administrator')

    const drugiBootstrap = await fetch(`${adres}/api/auth/bootstrap`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'drugi@example.test', haslo: '87654321', token: 'token-bootstrapu-testowy' }),
    })
    assert.equal(drugiBootstrap.status, 409)
    assert.equal(Number(baza.prepare("SELECT COUNT(*) AS liczba FROM czlonkostwa WHERE rola = 'wlasciciel'").get()?.liczba), 1)

    const statusPo = await fetch(`${adres}/api/auth/bootstrap/status`)
    assert.deepEqual(await statusPo.json(), { dostepny: false })
  }, { DATABASE_PATH: ':memory:', OWNER_BOOTSTRAP_TOKEN: 'token-bootstrapu-testowy' })
})

test('bootstrap przy istniejącej tożsamości bez członkostwa nie wybiera administratora', async () => {
  await zSerwerem(async (adres, baza) => {
    baza.prepare('INSERT INTO uzytkownicy (id, email, haslo_hash, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, ?, ?)')
      .run('dawna-tozsamosc', 'dawna@example.test', 'stary-hash', TERAZ, TERAZ)
    const odpowiedz = await fetch(`${adres}/api/auth/bootstrap`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.test', haslo: '12345678', token: 'token-bootstrapu-testowy' }),
    })
    assert.equal(odpowiedz.status, 201)
    assert.equal((await odpowiedz.json() as { rolaSystemowa: string }).rolaSystemowa, 'uzytkownik')
    assert.equal(baza.prepare("SELECT COUNT(*) AS liczba FROM uzytkownicy WHERE rola_systemowa = 'administrator'").get()?.liczba, 0)
    assert.equal(baza.prepare("SELECT haslo_hash FROM uzytkownicy WHERE id = 'dawna-tozsamosc'").get()?.haslo_hash, 'stary-hash')
  }, { DATABASE_PATH: ':memory:', OWNER_BOOTSTRAP_TOKEN: 'token-bootstrapu-testowy' })
})

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

test('Administrator będący Właścicielem A nie czyta ani nie zmienia danych Właściciela B', async () => {
  await zSerwerem(async (adres, baza) => {
    dodajUzytkownika(baza, 'wlasciciel-a', 'a@example.test')
    dodajUzytkownika(baza, 'wlasciciel-b', 'b@example.test')
    baza.prepare("UPDATE uzytkownicy SET rola_systemowa = 'administrator' WHERE id = 'wlasciciel-a'").run()
    dodajSesje(baza, 'token-a', 'csrf-a', 'wlasciciel-a')
    dodajRekord(baza, 'wlasciciel-a', 'zadanie-a', 'Dane A')
    dodajRekord(baza, 'wlasciciel-b', 'zadanie-b', 'Dane B')
    for (const tabela of ['notatki', 'dokumenty', 'wpisyTerapii']) {
      const rekord = { id: `prywatny-${tabela}`, tresc: 'Prywatne dane B', medyczne: {}, createdAt: TERAZ, updatedAt: TERAZ }
      baza.prepare(`INSERT INTO rekordy_synchronizacji
        (uzytkownik_id, tabela, rekord_id, dane_json, created_at, updated_at, server_updated_at)
        VALUES ('wlasciciel-b', ?, ?, ?, ?, ?, ?)`).run(tabela, rekord.id, JSON.stringify(rekord), TERAZ, TERAZ, TERAZ)
    }
    const daneBPrzed = baza.prepare("SELECT * FROM rekordy_synchronizacji WHERE uzytkownik_id = 'wlasciciel-b'").all()

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
    const zapisBezCsrf = await fetch(`${adres}/api/sync/changes`, {
      method: 'POST', headers: naglowki('token-a'),
      body: JSON.stringify({ od: TERAZ, installationId: 'instalacja-testowa', zmiany: [] }),
    })
    assert.equal(zapisBezCsrf.status, 403)
    assert.deepEqual(await zapisBezCsrf.json(), { error: 'Sesja wymaga odświeżenia.' })
    const rekordB = baza.prepare('SELECT dane_json FROM rekordy_synchronizacji WHERE uzytkownik_id = ? AND rekord_id = ?').get('wlasciciel-b', 'zadanie-b')
    assert.equal(JSON.parse(String(rekordB?.dane_json)).tytul, 'Dane B')
    assert.deepEqual(baza.prepare("SELECT * FROM rekordy_synchronizacji WHERE uzytkownik_id = 'wlasciciel-b'").all(), daneBPrzed)
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

test('Administrator będący Edytorem z ogólnym grantem nie uzyskuje dokumentacji ani dawnych sesji', async () => {
  await zSerwerem(async (adres, baza) => {
    dodajUzytkownika(baza, 'wlasciciel', 'owner@example.test')
    baza.prepare('INSERT INTO uzytkownicy (id, email, haslo_hash, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, ?, ?)').run('edytor', 'editor@example.test', 'hash-testowy', TERAZ, TERAZ)
    baza.prepare("UPDATE uzytkownicy SET rola_systemowa = 'administrator' WHERE id = 'edytor'").run()
    dodajSesje(baza, 'token-edytora', 'csrf-edytora', 'edytor', 'wlasciciel', 'edytor')
    const dodajGrant = (id: string, modul: string, sekcja: string) => baza.prepare(`INSERT INTO granty_dostepu
      (id, wlasciciel_id, edytor_id, modul, sekcja, odczyt, edycja, status, utworzono_at, zaktualizowano_at)
      VALUES (?, 'wlasciciel', 'edytor', ?, ?, 1, 1, 'aktywne', ?, ?)`).run(id, modul, sekcja, TERAZ, TERAZ)
    dodajGrant('zdrowie', 'zdrowie', '')
    dodajGrant('dokumenty', 'dokumenty', '')
    const rekord = { id: 'medyczny', nazwa: 'Prywatny plik', medyczne: {}, createdAt: TERAZ, updatedAt: TERAZ }
    const zapisz = baza.prepare(`INSERT INTO rekordy_synchronizacji
      (uzytkownik_id, tabela, rekord_id, dane_json, created_at, updated_at, version, ostatnia_instalacja_id, server_updated_at)
      VALUES ('wlasciciel', ?, ?, ?, ?, ?, 1, 'instalacja-serwera', ?)`)
    zapisz.run('dokumenty', rekord.id, JSON.stringify(rekord), TERAZ, TERAZ, TERAZ)
    zapisz.run('wpisyTerapii', 'stara-sesja', JSON.stringify({ ...rekord, id: 'stara-sesja', tresc: 'Prywatna sesja' }), TERAZ, TERAZ, TERAZ)
    const url = `${adres}/api/sync/changes`
    const odczytaj = async () => (await (await fetch(`${url}?od=1970-01-01T00%3A00%3A00.000Z`, { headers: naglowki('token-edytora') })).json() as { zmiany: { rekord: { id: string } }[] }).zmiany
    assert.deepEqual(await odczytaj(), [])
    const { medyczne: _medyczne, ...bezOchrony } = rekord
    const paczka = { od: TERAZ, installationId: 'instalacja-testowa', zmiany: [{ tabela: 'dokumenty', rekord: { ...bezOchrony, updatedAt: '2026-09-09T13:00:00.000Z' }, installationId: 'instalacja-testowa' }] }
    assert.equal((await fetch(url, { method: 'POST', headers: naglowki('token-edytora', 'csrf-edytora'), body: JSON.stringify(paczka) })).status, 403)
    dodajGrant('dokumentacja', 'zdrowie', 'dokumentacja')
    assert.deepEqual((await odczytaj()).map((zmiana) => zmiana.rekord.id), ['medyczny'])
    dodajGrant('psychoterapia', 'zdrowie', 'psychoterapia')
    assert.deepEqual((await odczytaj()).map((zmiana) => zmiana.rekord.id).sort(), ['medyczny', 'stara-sesja'])
    baza.prepare("UPDATE granty_dostepu SET status = 'cofniete' WHERE sekcja != ''").run()
    assert.deepEqual(await odczytaj(), [])
    assert.equal(baza.prepare('SELECT COUNT(*) AS liczba FROM rekordy_synchronizacji').get()?.liczba, 2)
  })
})

test('starszy klient wysyła notatki razem ze zwykłym rekordem; tylko zwykły rekord jest zapisany, historia pozostaje', async () => {
  await zSerwerem(async (adres, baza) => {
    dodajUzytkownika(baza, 'wlasciciel', 'owner@example.test')
    dodajSesje(baza, 'token-wlasciciela', 'csrf-wlasciciela', 'wlasciciel')
    const historyczny = { id: 'dawna', createdAt: TERAZ, updatedAt: TERAZ, tresc: 'Dawna prywatna notatka' }
    baza.prepare(`INSERT INTO rekordy_synchronizacji
      (uzytkownik_id, tabela, rekord_id, dane_json, created_at, updated_at, version, ostatnia_instalacja_id, server_updated_at)
      VALUES ('wlasciciel', 'wpisyTerapii', 'dawna', ?, ?, ?, 1, 'instalacja-serwera', ?)`)
      .run(JSON.stringify(historyczny), TERAZ, TERAZ, TERAZ)
    const historiaPrzed = baza.prepare("SELECT * FROM rekordy_synchronizacji WHERE tabela = 'wpisyTerapii'").all()
    const installationId = 'instalacja-testowa'
    const zmiany = [
      { zmianaId: 'stara-notatka-1', tabela: 'wpisyTerapii', rekord: { ...historyczny, tresc: 'Zmiana starego APK' }, installationId },
      { zmianaId: 'stara-notatka-2', tabela: 'wpisyTerapii', rekord: { ...historyczny, id: 'nowa' }, installationId },
      { zmianaId: 'zwykle-zadanie-1', tabela: 'zadania', rekord: { id: 'zadanie', createdAt: TERAZ, updatedAt: TERAZ, tytul: 'Zwykłe zadanie' }, installationId },
    ]
    const wyslij = () => fetch(`${adres}/api/sync/changes`, { method: 'POST', headers: naglowki('token-wlasciciela', 'csrf-wlasciciela'), body: JSON.stringify({ od: '1970-01-01T00:00:00.000Z', installationId, zmiany }) })
    const odpowiedz = await wyslij()
    assert.equal(odpowiedz.status, 200)
    const wynik = await odpowiedz.json() as { zapisano: number; pominiete: { rekordId: string; powod: string }[] }
    assert.equal(wynik.zapisano, 1)
    assert.deepEqual(wynik.pominiete.map((zmiana) => zmiana.rekordId), ['dawna', 'nowa'])
    assert.ok(wynik.pominiete.every((zmiana) => zmiana.powod === 'tabela_lokalna'))
    assert.deepEqual(baza.prepare("SELECT * FROM rekordy_synchronizacji WHERE tabela = 'wpisyTerapii'").all(), historiaPrzed)
    assert.equal((await (await wyslij()).json() as { zapisano: number }).zapisano, 0)
    assert.equal(baza.prepare("SELECT COUNT(*) AS liczba FROM przetworzone_zmiany_synchronizacji WHERE zmiana_id LIKE 'stara-notatka-%'").get()?.liczba, 0)
  })
})

test('klasyfikacja dokumentu wymaga grantów sekcji, przetrwa próbę usunięcia i cofnięcie grantu', async () => {
  await zSerwerem(async (adres, baza) => {
    dodajUzytkownika(baza, 'wlasciciel', 'owner@example.test')
    dodajSesje(baza, 'token-wlasciciela', 'csrf-wlasciciela', 'wlasciciel')
    baza.prepare('INSERT INTO uzytkownicy (id, email, haslo_hash, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, ?, ?)').run('edytor', 'editor@example.test', 'hash-testowy', TERAZ, TERAZ)
    dodajSesje(baza, 'token-edytora', 'csrf-edytora', 'edytor', 'wlasciciel', 'edytor')
    const grant = (id: string, modul: string, sekcja: string) => baza.prepare(`INSERT INTO granty_dostepu
      (id, wlasciciel_id, edytor_id, modul, sekcja, odczyt, edycja, status, utworzono_at, zaktualizowano_at)
      VALUES (?, 'wlasciciel', 'edytor', ?, ?, 1, 1, 'aktywne', ?, ?)`).run(id, modul, sekcja, TERAZ, TERAZ)
    grant('dokumenty', 'dokumenty', '')
    const installationId = 'instalacja-testowa'
    const rekord = { id: 'plik', nazwa: 'Zwykły dokument', powiazania: [], createdAt: TERAZ, updatedAt: TERAZ }
    const wyslij = (rekord: Record<string, unknown>, token = 'token-wlasciciela', csrf = 'csrf-wlasciciela') => fetch(`${adres}/api/sync/changes`, { method: 'POST', headers: naglowki(token, csrf), body: JSON.stringify({ od: TERAZ, installationId, zmiany: [{ tabela: 'dokumenty', rekord, installationId }] }) })
    const odczytaj = async () => (await (await fetch(`${adres}/api/sync/changes?od=1970-01-01T00%3A00%3A00.000Z`, { headers: naglowki('token-edytora') })).json() as { zmiany: { rekord: { id: string } }[] }).zmiany
    assert.equal((await wyslij(rekord)).status, 200)
    assert.equal((await odczytaj()).length, 1)
    assert.equal((await wyslij({ ...rekord, sekcjePrywatnosci: ['dokumentacja', 'psychoterapia'] })).status, 200)
    assert.deepEqual(await odczytaj(), [])
    grant('dokumentacja', 'zdrowie', 'dokumentacja')
    assert.deepEqual(await odczytaj(), [])
    grant('psychoterapia', 'zdrowie', 'psychoterapia')
    assert.equal((await odczytaj()).length, 1)
    assert.equal((await wyslij({ ...rekord, sekcjePrywatnosci: [] }, 'token-edytora', 'csrf-edytora')).status, 200)
    assert.deepEqual(JSON.parse(String(baza.prepare("SELECT dane_json FROM rekordy_synchronizacji WHERE rekord_id = 'plik'").get()?.dane_json)).sekcjePrywatnosci, ['dokumentacja', 'psychoterapia'])
    baza.prepare("UPDATE granty_dostepu SET status = 'cofniete' WHERE id = 'psychoterapia'").run()
    assert.deepEqual(await odczytaj(), [])
    assert.equal((await wyslij(rekord, 'token-edytora', 'csrf-edytora')).status, 403)
    assert.equal(baza.prepare('SELECT COUNT(*) AS liczba FROM rekordy_synchronizacji').get()?.liczba, 1)
    const podwojny = await fetch(`${adres}/api/sync/changes`, { method: 'POST', headers: naglowki('token-wlasciciela', 'csrf-wlasciciela'), body: JSON.stringify({ od: TERAZ, installationId, zmiany: [
      { tabela: 'dokumenty', rekord: { ...rekord, id: 'nowy-plik', sekcjePrywatnosci: ['dokumentacja', 'psychoterapia'] }, installationId },
      { tabela: 'dokumenty', rekord: { ...rekord, id: 'nowy-plik' }, installationId },
    ] }) })
    assert.equal(podwojny.status, 200)
    assert.deepEqual(JSON.parse(String(baza.prepare("SELECT dane_json FROM rekordy_synchronizacji WHERE rekord_id = 'nowy-plik'").get()?.dane_json)).sekcjePrywatnosci, ['dokumentacja', 'psychoterapia'])
    assert.deepEqual(await odczytaj(), [])
  })
})

test('klasyfikacja dokumentu wyniku chroni istniejącą treść również przy konflikcie zapisu', async () => {
  await zSerwerem(async (adres, baza) => {
    dodajUzytkownika(baza, 'wlasciciel', 'owner@example.test')
    dodajSesje(baza, 'token-wlasciciela', 'csrf-wlasciciela', 'wlasciciel')
    baza.prepare('INSERT INTO uzytkownicy (id, email, haslo_hash, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, ?, ?)').run('edytor', 'editor@example.test', 'hash-testowy', TERAZ, TERAZ)
    dodajSesje(baza, 'token-edytora', 'csrf-edytora', 'edytor', 'wlasciciel', 'edytor')
    const grant = (id: string, modul: string, sekcja: string) => baza.prepare(`INSERT INTO granty_dostepu
      (id, wlasciciel_id, edytor_id, modul, sekcja, odczyt, edycja, status, utworzono_at, zaktualizowano_at)
      VALUES (?, 'wlasciciel', 'edytor', ?, ?, 1, 1, 'aktywne', ?, ?)`).run(id, modul, sekcja, TERAZ, TERAZ)
    grant('dokumenty', 'dokumenty', '')
    const zdalny = { id: 'plik-wyniku', createdAt: TERAZ, updatedAt: TERAZ, nazwa: 'Treść istniejąca na serwerze' }
    baza.prepare(`INSERT INTO rekordy_synchronizacji
      (uzytkownik_id, tabela, rekord_id, dane_json, created_at, updated_at, version, ostatnia_instalacja_id, server_updated_at)
      VALUES ('wlasciciel', 'dokumenty', ?, ?, ?, ?, 1, 'inna-instalacja', ?)`)
      .run(zdalny.id, JSON.stringify(zdalny), TERAZ, TERAZ, TERAZ)
    const odpowiedz = await fetch(`${adres}/api/sync/changes`, { method: 'POST', headers: naglowki('token-wlasciciela', 'csrf-wlasciciela'), body: JSON.stringify({
      od: '1970-01-01T00:00:00.000Z', installationId: 'instalacja-testowa', zmiany: [{ tabela: 'dokumenty', installationId: 'instalacja-testowa', rekord: { ...zdalny, nazwa: 'Nieaktualna treść klienta', sekcjePrywatnosci: ['dokumentacja'] } }],
    }) })
    assert.equal(odpowiedz.status, 409)
    const zapisany = JSON.parse(String(baza.prepare("SELECT dane_json FROM rekordy_synchronizacji WHERE rekord_id = 'plik-wyniku'").get()?.dane_json))
    assert.deepEqual(zapisany, { ...zdalny, sekcjePrywatnosci: ['dokumentacja'] })
    const odczytaj = async () => (await (await fetch(`${adres}/api/sync/changes?od=1970-01-01T00%3A00%3A00.000Z`, { headers: naglowki('token-edytora') })).json() as { zmiany: unknown[] }).zmiany
    assert.deepEqual(await odczytaj(), [])
    grant('dokumentacja', 'zdrowie', 'dokumentacja')
    assert.equal((await odczytaj()).length, 1)
    baza.prepare("UPDATE granty_dostepu SET status = 'cofniete' WHERE id = 'dokumentacja'").run()
    assert.deepEqual(await odczytaj(), [])
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
