import { strict as assert } from 'node:assert'
import { createHash, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { uruchomMigracje } from './migracje.ts'
import { utworzKonfiguracjeSerwera } from './config.ts'
import { utworzSerwer } from './serwer.ts'
import { daneBiznesowe, kanonicznyZapis, type MapaTabel, type TabelaFinansowa } from './wspolne/ZapisFinansowy.ts'
import { TABELE_FINANSOW_WSPOLNYCH } from './wspolne/SynchronizacjaFinansow.ts'

const POCZATEK = '1970-01-01T00:00:00.000Z'
const TERAZ = '2026-10-29T12:00:00.000Z'
const kasa = { id: 'k', createdAt: TERAZ, updatedAt: TERAZ, nazwa: 'Kasa syntetyczna', opis: '', ikona: '', kolor: '', waluta: 'PLN', saldoPoczatkoweGrosze: 0, status: 'aktywna' as const }
const operacja = { id: 'o', createdAt: TERAZ, updatedAt: TERAZ, kasaId: 'k', typ: 'wplyw' as const, kwotaGrosze: 1000, waluta: 'PLN', dataOperacji: '2026-10-29', kategoria: '', zrodlo: '', opis: 'Test' }
const grupa = { id: 'r', createdAt: TERAZ, updatedAt: TERAZ, nazwa: 'Rozliczenie', opis: '', waluta: 'PLN', uczestnicy: [{ id: 'a', nazwa: 'Ala' }, { id: 'b', nazwa: 'Bartek' }], domyslnyPodzial: 'po_rowno' as const, etap: 'aktywne' as const, dataRozpoczecia: '2026-10-29' }
const wydatek = { id: 'w', createdAt: TERAZ, updatedAt: TERAZ, rozliczenieId: 'r', nazwa: 'Zakup', opis: '', waluta: 'PLN', dataOperacji: '2026-10-29', kwotaGrosze: 10000, finansujacy: [{ uczestnikId: 'a', kwotaGrosze: 10000 }], metodaPodzialu: 'po_rowno' as const, parametryPodzialu: { metoda: 'po_rowno' as const, uczestnicyIds: ['a', 'b'] }, podzialKosztu: [{ uczestnikId: 'a', kwotaGrosze: 5000 }, { uczestnikId: 'b', kwotaGrosze: 5000 }] }
const zwrot = { id: 'z', createdAt: TERAZ, updatedAt: TERAZ, rozliczenieId: 'r', odUczestnikaId: 'b', doUczestnikaId: 'a', kwotaGrosze: 1000, waluta: 'PLN', dataOperacji: '2026-10-29', opis: 'Przelew' }

function wersja<K extends TabelaFinansowa>(tabela: K, rekord: MapaTabel[K], przed?: MapaTabel[K]): MapaTabel[K] {
  const oczekiwanaRewizja = przed?.rewizja ?? 0
  const updatedAt = przed ? new Date(Date.parse(przed.updatedAt) + 1).toISOString() : rekord.updatedAt
  const stan = (dane: MapaTabel[K]) => ({ ...daneBiznesowe(tabela, dane), ...(dane.usunietoAt ? { usunietoAt: dane.usunietoAt } : {}) })
  const operacja = przed ? rekord.usunietoAt ? 'usuniecie' : przed.usunietoAt ? 'przywrocenie' : 'aktualizacja' : 'utworzenie'
  return { ...rekord, updatedAt, rewizja: oczekiwanaRewizja + 1, historiaWersji: [...przed?.historiaWersji ?? [], { rewizja: oczekiwanaRewizja + 1, oczekiwanaRewizja, idZapisu: randomUUID(), operacja, znacznikCzasu: updatedAt, podpisPolecenia: kanonicznyZapis({ operacja, oczekiwanaRewizja }), ...(przed ? { przed: stan(przed) } : {}), po: stan(rekord) }] }
}
function zmiana<K extends TabelaFinansowa>(tabela: K, rekord: MapaTabel[K], instalacja = 'instalacja-A', bazowyUpdatedAt?: string) {
  return { zmianaId: randomUUID(), tabela, rekord, installationId: instalacja, ...(bazowyUpdatedAt ? { bazowyUpdatedAt } : {}) }
}
type Zmiana = ReturnType<typeof zmiana>
async function zSerwerem(wykonaj: (baza: DatabaseSync, zapytaj: (konto: string, zmiany?: Zmiana[], instalacja?: string, query?: string) => Promise<Response>) => Promise<void>) {
  const baza = new DatabaseSync(':memory:')
  uruchomMigracje(baza)
  const hash = (wartosc: string) => createHash('sha256').update(wartosc).digest('hex')
  for (const [id, wlasciciel, rola] of [['A', 'A', 'wlasciciel'], ['B', 'B', 'wlasciciel'], ['E', 'A', 'edytor']]) {
    baza.prepare('INSERT INTO uzytkownicy (id, email, haslo_hash, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, ?, ?)').run(id, `${id}@example.test`, 'syntetyczny', TERAZ, TERAZ)
    baza.prepare("INSERT INTO czlonkostwa (wlasciciel_id, uzytkownik_id, rola, status, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, 'aktywne', ?, ?)").run(wlasciciel, id, rola, TERAZ, TERAZ)
    baza.prepare('INSERT INTO sesje (token_hash, uzytkownik_id, aktywny_wlasciciel_id, csrf_hash, wygasa_at, ostatnia_aktywnosc_at, utworzono_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(hash(id), id, wlasciciel, hash('csrf-' + id), '2099-01-01T00:00:00.000Z', TERAZ, TERAZ)
  }
  baza.prepare("INSERT INTO granty_dostepu (id, wlasciciel_id, edytor_id, modul, sekcja, odczyt, edycja, status, utworzono_at, zaktualizowano_at) VALUES ('grant', 'A', 'E', 'finanse', '', 1, 1, 'aktywne', ?, ?)").run(TERAZ, TERAZ)
  const serwer = utworzSerwer(utworzKonfiguracjeSerwera({}), baza)
  await new Promise<void>((gotowe) => serwer.listen(0, '127.0.0.1', gotowe))
  const adres = serwer.address()
  assert.ok(adres && typeof adres === 'object')
  const zapytaj = (konto: string, zmiany?: Zmiana[], instalacja = 'instalacja-A', query = '&finanseWspolne=1') => fetch(`http://127.0.0.1:${adres.port}/api/sync/changes${zmiany ? '' : '?od=' + POCZATEK + query}`, {
    method: zmiany ? 'POST' : 'GET', headers: { cookie: `ogarniacz_sesja=${konto}`, 'x-ogarniacz-csrf': 'csrf-' + konto, 'x-ogarniacz-installation-id': instalacja, 'content-type': 'application/json' },
    ...(zmiany ? { body: JSON.stringify({ od: POCZATEK, installationId: instalacja, zmiany }) } : {}),
  })
  try { await wykonaj(baza, zapytaj) }
  finally { await new Promise<void>((gotowe, odrzuc) => serwer.close((blad) => blad ? odrzuc(blad) : gotowe())); baza.close() }
}

test('F7.4 HTTP: pięć tabel, dziecko przed rodzicem, dwa urządzenia, izolacja właścicieli i starszy klient', async () => zSerwerem(async (_, zapytaj) => {
  const paczka = [zmiana('operacjeKas', wersja('operacjeKas', operacja)), zmiana('wydatkiGrupowe', wersja('wydatkiGrupowe', wydatek)), zmiana('zwrotyRozliczen', wersja('zwrotyRozliczen', zwrot)), zmiana('rozliczenia', wersja('rozliczenia', grupa)), zmiana('wspolneKasy', wersja('wspolneKasy', kasa))]
  assert.equal((await zapytaj('A', paczka)).status, 200)
  const dane = await (await zapytaj('A', undefined, 'instalacja-druga')).json()
  assert.equal(dane.zmiany.length, 5)
  assert.equal(dane.liczbaRekordowFinansowych, 5)
  assert.deepEqual(dane.obslugiwaneTabeleFinansowe, TABELE_FINANSOW_WSPOLNYCH)
  assert.deepEqual(dane.zmiany.find((zmiana: Zmiana) => zmiana.tabela === 'operacjeKas').rekord, paczka[0].rekord)
  assert.equal((await (await zapytaj('B', undefined, 'instalacja-B')).json()).zmiany.length, 0)
  assert.equal((await (await zapytaj('A', undefined, 'stary-klient', '')).json()).zmiany.length, 0)
  assert.equal((await zapytaj('B', [zmiana('wspolneKasy', wersja('wspolneKasy', { ...kasa, nazwa: 'Inny właściciel' }), 'instalacja-B')], 'instalacja-B')).status, 200)
  assert.equal((await (await zapytaj('A')).json()).zmiany.find((zmiana: Zmiana) => zmiana.tabela === 'wspolneKasy').rekord.nazwa, kasa.nazwa)
}))

test('F7.4 HTTP: Edytor z pełnym grantem finanse nie odczytuje i nie zapisuje żadnej z tabel', async () => zSerwerem(async (_, zapytaj) => {
  assert.equal((await zapytaj('A', [zmiana('wspolneKasy', wersja('wspolneKasy', kasa))])).status, 200)
  assert.equal((await (await zapytaj('E', undefined, 'instalacja-E')).json()).zmiany.length, 0)
  for (const [tabela, rekord] of [['wspolneKasy', kasa], ['operacjeKas', operacja], ['rozliczenia', grupa], ['wydatkiGrupowe', wydatek], ['zwrotyRozliczen', zwrot]] as const) {
    assert.equal((await zapytaj('E', [zmiana(tabela, rekord, 'instalacja-E')], 'instalacja-E')).status, 403)
  }
}))

test('F7.4 HTTP: ponowienie utraconej odpowiedzi jest idempotentne; dwa różne ID zwrotów pozostają osobne', async () => zSerwerem(async (_, zapytaj) => {
  const paczka = [zmiana('rozliczenia', wersja('rozliczenia', grupa)), zmiana('wydatkiGrupowe', wersja('wydatkiGrupowe', wydatek))]
  assert.equal((await (await zapytaj('A', paczka)).json()).zapisano, 2)
  assert.equal((await (await zapytaj('A', paczka)).json()).zapisano, 0)
  assert.equal((await zapytaj('A', [zmiana('zwrotyRozliczen', wersja('zwrotyRozliczen', zwrot))])).status, 200)
  assert.equal((await zapytaj('A', [zmiana('zwrotyRozliczen', wersja('zwrotyRozliczen', { ...zwrot, id: 'z-drugi' }), 'instalacja-druga')], 'instalacja-druga')).status, 200)
  assert.equal((await (await zapytaj('A')).json()).zmiany.filter((zmiana: Zmiana) => zmiana.tabela === 'zwrotyRozliczen').length, 2)
}))

test('F7.4 HTTP: konflikt nie zależy od zegara, kolejności ani installationId i nie nadpisuje historii', async () => zSerwerem(async (_, zapytaj) => {
  const pierwsza = wersja('wspolneKasy', kasa)
  const druga = wersja('wspolneKasy', { ...pierwsza, nazwa: 'Druga' }, pierwsza)
  assert.equal((await zapytaj('A', [zmiana('wspolneKasy', pierwsza)])).status, 200)
  assert.equal((await zapytaj('A', [zmiana('wspolneKasy', druga, 'instalacja-A', pierwsza.updatedAt)])).status, 200)
  const rownolegla = wersja('wspolneKasy', { ...pierwsza, nazwa: 'Równoległa' }, pierwsza)
  assert.equal((await zapytaj('A', [zmiana('wspolneKasy', rownolegla, 'instalacja-druga', pierwsza.updatedAt)], 'instalacja-druga')).status, 409)
  assert.equal((await zapytaj('A', [zmiana('wspolneKasy', rownolegla, 'instalacja-A', pierwsza.updatedAt)])).status, 409)
  assert.equal((await zapytaj('A', [zmiana('wspolneKasy', rownolegla)])).status, 409)
  const zniszczonaHistoria = wersja('wspolneKasy', { ...kasa, nazwa: 'Podmiana', updatedAt: '2026-10-29T13:00:00.000Z' })
  assert.equal((await zapytaj('A', [zmiana('wspolneKasy', zniszczonaHistoria, 'instalacja-A', druga.updatedAt)])).status, 400)
  assert.equal((await (await zapytaj('A')).json()).zmiany[0].rekord.nazwa, 'Druga')
}))

test('F7.4 HTTP: pierwsza wysyłka przenosi pominięte edycje, usunięcie i przywrócenie', async () => zSerwerem(async (_, zapytaj) => {
  const pierwsza = wersja('operacjeKas', operacja)
  const druga = wersja('operacjeKas', { ...pierwsza, kwotaGrosze: 2000 }, pierwsza)
  const usunieta = wersja('operacjeKas', { ...druga, usunietoAt: '2026-10-29T12:00:00.001Z' }, druga)
  assert.equal((await zapytaj('A', [zmiana('operacjeKas', usunieta), zmiana('wspolneKasy', wersja('wspolneKasy', kasa))])).status, 200)
  const przywrocona = wersja('operacjeKas', { ...usunieta, usunietoAt: undefined }, usunieta)
  assert.equal((await zapytaj('A', [zmiana('operacjeKas', przywrocona, 'instalacja-druga', usunieta.updatedAt)], 'instalacja-druga')).status, 200)
  const pobrane = (await (await zapytaj('A')).json()).zmiany.find((zmiana: Zmiana) => zmiana.tabela === 'operacjeKas').rekord
  assert.equal(pobrane.historiaWersji.length, 4)
  assert.equal(pobrane.usunietoAt, undefined)
}))

test('F7.4 HTTP: rozstrzygnięcie zachowuje odrzuconą gałąź i odrzuca mieszanie wariantów', async () => zSerwerem(async (_, zapytaj) => {
  const pierwsza = wersja('operacjeKas', operacja)
  const zdalny = wersja('operacjeKas', { ...pierwsza, kwotaGrosze: 2000 }, pierwsza)
  const lokalny = wersja('operacjeKas', { ...pierwsza, kwotaGrosze: 3000 }, pierwsza)
  assert.equal((await zapytaj('A', [zmiana('wspolneKasy', kasa), zmiana('operacjeKas', zdalny)])).status, 200)
  const rozstrzygniety = wersja('operacjeKas', lokalny, zdalny)
  const ostatnia = rozstrzygniety.historiaWersji!.at(-1)!
  ostatnia.operacja = 'rozstrzygniecie'
  ostatnia.podpisPolecenia = kanonicznyZapis({ operacja: 'rozstrzygniecie', oczekiwanaRewizja: 2 })
  ostatnia.wariantyKonfliktu = { wybrano: 'lokalny', lokalny: JSON.parse(JSON.stringify(lokalny)), zdalny: JSON.parse(JSON.stringify(zdalny)) }
  const pomieszany = structuredClone(rozstrzygniety)
  pomieszany.kwotaGrosze = 4000
  pomieszany.historiaWersji!.at(-1)!.po.kwotaGrosze = 4000
  assert.equal((await zapytaj('A', [zmiana('operacjeKas', pomieszany, 'instalacja-druga', zdalny.updatedAt)], 'instalacja-druga')).status, 400)
  assert.equal((await zapytaj('A', [zmiana('operacjeKas', rozstrzygniety, 'instalacja-druga', zdalny.updatedAt)], 'instalacja-druga')).status, 200)
  const odebrany = (await (await zapytaj('A')).json()).zmiany.find((zmiana: Zmiana) => zmiana.tabela === 'operacjeKas').rekord
  assert.deepEqual(odebrany.historiaWersji.at(-1).wariantyKonfliktu, ostatnia.wariantyKonfliktu)
  assert.equal(odebrany.kwotaGrosze, 3000)
}))

test('F7.4 HTTP: niepełna paczka i błędne kwoty, waluty, podział, zwrot i historia nie zapisują części danych', async () => zSerwerem(async (baza, zapytaj) => {
  const bledy = [
    [zmiana('operacjeKas', operacja)],
    [zmiana('wspolneKasy', kasa), zmiana('operacjeKas', { ...operacja, kwotaGrosze: Number.MAX_SAFE_INTEGER + 1 })],
    [zmiana('wspolneKasy', kasa), zmiana('operacjeKas', { ...operacja, waluta: 'EUR' })],
    [zmiana('rozliczenia', grupa), zmiana('wydatkiGrupowe', { ...wydatek, finansujacy: [{ uczestnikId: 'a', kwotaGrosze: 9999 }] })],
    [zmiana('rozliczenia', grupa), zmiana('wydatkiGrupowe', { ...wydatek, podzialKosztu: [{ uczestnikId: 'a', kwotaGrosze: 6000 }, { uczestnikId: 'b', kwotaGrosze: 4000 }] })],
    [zmiana('rozliczenia', grupa), zmiana('zwrotyRozliczen', { ...zwrot, doUczestnikaId: 'b' })],
    [zmiana('wspolneKasy', { ...wersja('wspolneKasy', kasa), rewizja: 2 })],
    [zmiana('wspolneKasy', { ...kasa, id: ' ' })],
  ]
  for (const zmiany of bledy) {
    assert.equal((await zapytaj('A', zmiany)).status, 400)
    assert.equal(baza.prepare('SELECT COUNT(*) AS ile FROM rekordy_synchronizacji').get()!.ile, 0)
    assert.equal(baza.prepare('SELECT COUNT(*) AS ile FROM przetworzone_zmiany_synchronizacji').get()!.ile, 0)
  }
}))
