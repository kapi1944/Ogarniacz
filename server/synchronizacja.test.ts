import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { utworzKonfiguracjeSerwera } from './config.ts'
import { uruchomMigracje } from './migracje.ts'
import { utworzSerwer } from './serwer.ts'
import { BladZmianySynchronizacji, zapiszZmianySynchronizacji } from './synchronizacja.ts'
import { TABELE_SYNCHRONIZOWANE } from './wspolne/tabeleSynchronizacji.ts'

const TERAZ = '2026-11-25T12:00:00.000Z'
const WYGASA = '2099-01-01T00:00:00.000Z'
const POCZATEK = '1970-01-01T00:00:00.000Z'
const hash = (wartosc: string) => createHash('sha256').update(wartosc).digest('hex')

function przygotujBaze(): DatabaseSync {
  const baza = new DatabaseSync(':memory:')
  uruchomMigracje(baza)
  baza.prepare('INSERT INTO uzytkownicy (id, email, haslo_hash, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, ?, ?)')
    .run('wlasciciel', 'owner@example.test', 'hash-testowy', TERAZ, TERAZ)
  baza.prepare("INSERT INTO czlonkostwa (wlasciciel_id, uzytkownik_id, rola, status, utworzono_at, zaktualizowano_at) VALUES (?, ?, 'wlasciciel', 'aktywne', ?, ?)")
    .run('wlasciciel', 'wlasciciel', TERAZ, TERAZ)
  baza.prepare('INSERT INTO sesje (token_hash, uzytkownik_id, aktywny_wlasciciel_id, csrf_hash, wygasa_at, ostatnia_aktywnosc_at, utworzono_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(hash('token-wlasciciela'), 'wlasciciel', 'wlasciciel', hash('csrf-wlasciciela'), WYGASA, TERAZ, TERAZ)
  return baza
}

const naglowki = {
  cookie: 'ogarniacz_sesja=token-wlasciciela',
  'x-ogarniacz-installation-id': 'instalacja-a',
  'x-ogarniacz-csrf': 'csrf-wlasciciela',
  'content-type': 'application/json',
}

function rekord(id: string, dodatkowe: Record<string, unknown> = {}) {
  return { id, createdAt: '2026-10-29T08:00:00.000Z', updatedAt: '2026-10-29T09:00:00.000Z', ...dodatkowe }
}

async function zSerwerem(baza: DatabaseSync, dzialanie: (url: string) => Promise<void>): Promise<void> {
  const serwer = utworzSerwer(utworzKonfiguracjeSerwera({ PORT: '8788', DATABASE_PATH: ':memory:' }), baza)
  await new Promise<void>((rozwiaz) => serwer.listen(0, '127.0.0.1', () => rozwiaz()))
  try {
    const adres = serwer.address()
    assert.ok(adres && typeof adres === 'object')
    await dzialanie(`http://127.0.0.1:${adres.port}/api/sync/changes`)
  } finally {
    await new Promise<void>((rozwiaz, odrzuc) => serwer.close((blad) => blad ? odrzuc(blad) : rozwiaz()))
  }
}

async function przechwycLogi(dzialanie: () => Promise<void>): Promise<string[]> {
  const logi: string[] = []
  const pierwotny = console.error
  console.error = (...argumenty: unknown[]) => { logi.push(argumenty.map(String).join(' ')) }
  try { await dzialanie() } finally { console.error = pierwotny }
  return logi
}

test('serwer przyjmuje tabele rejestru: definicje własnych pól i widoki', async () => {
  const baza = przygotujBaze()
  try {
    assert.ok(TABELE_SYNCHRONIZOWANE.includes('definicjeWlasnychPolRejestru'))
    assert.ok(TABELE_SYNCHRONIZOWANE.includes('widokiRejestru'))
    await zSerwerem(baza, async (url) => {
      const pole = rekord('custom:pole-1', { rejestrId: 'zadania', etykieta: 'Koszt', typ: 'liczba', aktywne: true, revision: 1 })
      const widok = rekord('widok:zadania:domyslny', { rejestrId: 'zadania', nazwa: 'Domyślny', widocznePolaIds: ['custom:pole-1'] })
      const zadanie = rekord('zadanie-1', { tytul: 'Zwykłe zadanie' })
      const odpowiedz = await fetch(url, {
        method: 'POST',
        headers: naglowki,
        body: JSON.stringify({ od: POCZATEK, installationId: 'instalacja-a', zmiany: [
          { zmianaId: 'zmiana-pole-1', tabela: 'definicjeWlasnychPolRejestru', rekord: pole, installationId: 'instalacja-a' },
          { zmianaId: 'zmiana-widok-1', tabela: 'widokiRejestru', rekord: widok, installationId: 'instalacja-a' },
          { zmianaId: 'zmiana-zadanie-1', tabela: 'zadania', rekord: zadanie, installationId: 'instalacja-a' },
        ] }),
      })
      assert.equal(odpowiedz.status, 200)
      assert.deepEqual(await odpowiedz.json(), { zapisano: 3, pominiete: [] })

      const pobranie = await fetch(`${url}?od=${encodeURIComponent(POCZATEK)}`, { headers: { ...naglowki, 'x-ogarniacz-installation-id': 'instalacja-b' } })
      const dane = await pobranie.json() as { zmiany: { tabela: string; rekord: { id: string } }[] }
      assert.deepEqual(dane.zmiany.map((zmiana) => zmiana.tabela).sort(), ['definicjeWlasnychPolRejestru', 'widokiRejestru', 'zadania'])
    })
  } finally { baza.close() }
})

test('nieobsługiwana tabela zwraca 400 z kodem zmiana_odrzucona, tabelą i ID rekordu, bez treści w logu', async () => {
  const baza = przygotujBaze()
  try {
    const logi = await przechwycLogi(() => zSerwerem(baza, async (url) => {
      const odpowiedz = await fetch(url, {
        method: 'POST',
        headers: naglowki,
        body: JSON.stringify({ od: POCZATEK, installationId: 'instalacja-a', zmiany: [
          { zmianaId: 'zmiana-zadanie-2', tabela: 'zadania', rekord: rekord('zadanie-2', { tytul: 'Poprawne' }), installationId: 'instalacja-a' },
          { zmianaId: 'zmiana-nieznana', tabela: 'tabelaPrzyszlosci', rekord: rekord('rekord-x', { tajne: 'PRYWATNA-TRESC' }), installationId: 'instalacja-a' },
        ] }),
      })
      assert.equal(odpowiedz.status, 400)
      assert.deepEqual(await odpowiedz.json(), {
        error: 'Nieobsługiwana tabela synchronizacji.',
        kod: 'zmiana_odrzucona',
        tabela: 'tabelaPrzyszlosci',
        rekordId: 'rekord-x',
        powod: 'nieobslugiwana_tabela',
      })
    }))
    assert.equal(logi.length, 1)
    assert.match(logi[0], /zmiana_odrzucona tabela=tabelaPrzyszlosci rekordId=rekord-x powod=nieobslugiwana_tabela/)
    assert.doesNotMatch(logi.join('\n'), /PRYWATNA-TRESC|Poprawne/)
    // Etap 1: paczka nadal jest odrzucana w całości, więc nic nie zostało zapisane.
    assert.equal(baza.prepare('SELECT COUNT(*) AS liczba FROM rekordy_synchronizacji').get()?.liczba, 0)
  } finally { baza.close() }
})

test('niepoprawny rekord w obsługiwanej tabeli ma osobny powód i nie ujawnia treści', async () => {
  const baza = przygotujBaze()
  try {
    const logi = await przechwycLogi(() => zSerwerem(baza, async (url) => {
      const odpowiedz = await fetch(url, {
        method: 'POST',
        headers: naglowki,
        body: JSON.stringify({ od: POCZATEK, installationId: 'instalacja-a', zmiany: [
          { tabela: 'widokiRejestru', rekord: { id: 'widok-zly', createdAt: 'nie-data', updatedAt: TERAZ, nazwa: 'PRYWATNA-NAZWA' }, installationId: 'instalacja-a' },
        ] }),
      })
      assert.equal(odpowiedz.status, 400)
      assert.deepEqual(await odpowiedz.json(), {
        error: 'Niepoprawna zmiana synchronizacji.', kod: 'zmiana_odrzucona', tabela: 'widokiRejestru', rekordId: 'widok-zly', powod: 'niepoprawna_zmiana',
      })
    }))
    assert.doesNotMatch(logi.join('\n'), /PRYWATNA-NAZWA/)
  } finally { baza.close() }
})

test('niepoprawny JSON zwraca ogólny 400 i loguje wyłącznie typ błędu', async () => {
  const baza = przygotujBaze()
  try {
    const logi = await przechwycLogi(() => zSerwerem(baza, async (url) => {
      const odpowiedz = await fetch(url, { method: 'POST', headers: naglowki, body: '{"zmiany":["PRYWATNY-FRAGMENT' })
      assert.equal(odpowiedz.status, 400)
      assert.deepEqual(await odpowiedz.json(), { error: 'Niepoprawne dane synchronizacji.' })
    }))
    assert.equal(logi.length, 1)
    assert.match(logi[0], /\[sync\] 400 POST \/api\/sync\/changes blad=SyntaxError/)
    assert.doesNotMatch(logi[0], /PRYWATNY-FRAGMENT/)
  } finally { baza.close() }
})

test('BladZmianySynchronizacji ogranicza identyfikatory do bezpiecznych znaków', () => {
  const baza = przygotujBaze()
  try {
    assert.throws(
      () => zapiszZmianySynchronizacji(baza, 'wlasciciel', {
        od: POCZATEK,
        installationId: 'instalacja-a',
        zmiany: [{ tabela: 'zła tabela\n<script>', rekord: rekord('id z spacją'), installationId: 'instalacja-a' }],
      }),
      (blad: unknown) => blad instanceof BladZmianySynchronizacji
        && blad.powod === 'nieobslugiwana_tabela'
        && blad.tabela === 'zła_tabela__script_'
        && blad.rekordId === 'id_z_spacją',
    )
  } finally { baza.close() }
})

test('klient z obslugujeOdrzucone: poprawne zmiany są zapisane, zła trafia do listy odrzucone', async () => {
  const baza = przygotujBaze()
  try {
    const logi = await przechwycLogi(() => zSerwerem(baza, async (url) => {
      const odpowiedz = await fetch(url, {
        method: 'POST',
        headers: naglowki,
        body: JSON.stringify({ od: POCZATEK, installationId: 'instalacja-a', obslugujeOdrzucone: true, zmiany: [
          { zmianaId: 'zmiana-dobra-1', tabela: 'notatki', rekord: rekord('notatka-1', { tytul: 'Ważna notatka' }), installationId: 'instalacja-a' },
          { zmianaId: 'zmiana-zla-1', tabela: 'tabelaPrzyszlosci', rekord: rekord('rekord-x', { tajne: 'PRYWATNA-TRESC' }), installationId: 'instalacja-a' },
          { zmianaId: 'zmiana-dobra-2', tabela: 'zadania', rekord: rekord('zadanie-3', { tytul: 'Zadanie' }), installationId: 'instalacja-a' },
        ] }),
      })
      assert.equal(odpowiedz.status, 200)
      assert.deepEqual(await odpowiedz.json(), {
        zapisano: 2,
        pominiete: [],
        odrzucone: [{ tabela: 'tabelaPrzyszlosci', rekordId: 'rekord-x', zmianaId: 'zmiana-zla-1', powod: 'nieobslugiwana_tabela' }],
      })
    }))
    const zapisane = baza.prepare('SELECT tabela, rekord_id FROM rekordy_synchronizacji ORDER BY rekord_id').all().map((wiersz) => `${wiersz.tabela}:${wiersz.rekord_id}`)
    assert.deepEqual(zapisane, ['notatki:notatka-1', 'zadania:zadanie-3'])
    assert.equal(logi.length, 1)
    assert.doesNotMatch(logi.join('\n'), /PRYWATNA-TRESC/)
  } finally { baza.close() }
})

test('finanse wspólne pozostają wszystko albo nic także w trybie częściowym', async () => {
  const baza = przygotujBaze()
  try {
    await przechwycLogi(() => zSerwerem(baza, async (url) => {
      const odpowiedz = await fetch(url, {
        method: 'POST',
        headers: naglowki,
        body: JSON.stringify({ od: POCZATEK, installationId: 'instalacja-a', obslugujeOdrzucone: true, zmiany: [
          { zmianaId: 'zmiana-dobra-3', tabela: 'notatki', rekord: rekord('notatka-2'), installationId: 'instalacja-a' },
          { zmianaId: 'zmiana-kasa-zla', tabela: 'wspolneKasy', rekord: { id: 'kasa-1', createdAt: 'zla-data', updatedAt: TERAZ }, installationId: 'instalacja-a' },
        ] }),
      })
      assert.equal(odpowiedz.status, 400)
      assert.equal((await odpowiedz.json() as { kod?: string }).kod, 'zmiana_odrzucona')
    }))
    assert.equal(baza.prepare('SELECT COUNT(*) AS liczba FROM rekordy_synchronizacji').get()?.liczba, 0)
  } finally { baza.close() }
})

test('Edytor synchronizuje konfigurację rejestru tylko w modułach objętych grantem', async () => {
  const baza = przygotujBaze()
  try {
    baza.prepare('INSERT INTO uzytkownicy (id, email, haslo_hash, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, ?, ?)')
      .run('edytor', 'editor@example.test', 'hash-testowy', TERAZ, TERAZ)
    baza.prepare("INSERT INTO czlonkostwa (wlasciciel_id, uzytkownik_id, rola, status, utworzono_at, zaktualizowano_at) VALUES ('wlasciciel', 'edytor', 'edytor', 'aktywne', ?, ?)").run(TERAZ, TERAZ)
    baza.prepare('INSERT INTO sesje (token_hash, uzytkownik_id, aktywny_wlasciciel_id, csrf_hash, wygasa_at, ostatnia_aktywnosc_at, utworzono_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(hash('token-edytora'), 'edytor', 'wlasciciel', hash('csrf-edytora'), WYGASA, TERAZ, TERAZ)
    baza.prepare("INSERT INTO granty_dostepu (id, wlasciciel_id, edytor_id, modul, sekcja, odczyt, edycja, status, utworzono_at, zaktualizowano_at) VALUES ('g', 'wlasciciel', 'edytor', 'zadania', '', 1, 1, 'aktywne', ?, ?)").run(TERAZ, TERAZ)
    const naglowkiEdytora = { ...naglowki, cookie: 'ogarniacz_sesja=token-edytora', 'x-ogarniacz-csrf': 'csrf-edytora', 'x-ogarniacz-installation-id': 'instalacja-e' }
    const wyslij = (url: string, rejestrId: string, id: string) => fetch(url, {
      method: 'POST',
      headers: naglowkiEdytora,
      body: JSON.stringify({ od: POCZATEK, installationId: 'instalacja-e', zmiany: [
        { zmianaId: `zmiana-${id}`, tabela: 'widokiRejestru', rekord: rekord(id, { rejestrId, nazwa: 'Widok', widocznePolaIds: [] }), installationId: 'instalacja-e' },
      ] }),
    })
    await zSerwerem(baza, async (url) => {
      assert.equal((await wyslij(url, 'zadania', 'widok-zadan')).status, 200)
      assert.equal((await wyslij(url, 'subskrypcje', 'widok-subskrypcji')).status, 403)
      baza.prepare("INSERT INTO rekordy_synchronizacji (uzytkownik_id, tabela, rekord_id, dane_json, created_at, updated_at, version, ostatnia_instalacja_id, server_updated_at) VALUES ('wlasciciel', 'widokiRejestru', 'widok-finansow', ?, ?, ?, 1, 'instalacja-a', ?)")
        .run(JSON.stringify(rekord('widok-finansow', { rejestrId: 'subskrypcje' })), TERAZ, TERAZ, TERAZ)
      const pobranie = await fetch(`${url}?od=${encodeURIComponent(POCZATEK)}`, { headers: naglowkiEdytora })
      const dane = await pobranie.json() as { zmiany: { rekord: { id: string } }[] }
      assert.deepEqual(dane.zmiany.map((zmiana) => zmiana.rekord.id), ['widok-zadan'])
    })
  } finally { baza.close() }
})
