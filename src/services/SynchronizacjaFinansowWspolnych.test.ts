import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { baza, BazaOgarniacza, ustawBazePrzedUruchomieniem } from '../data/BazaOgarniacza'
import { RepozytoriumZdalneInMemory } from '../data/RepozytoriumZdalneInMemory'
import { pobierzKolejkeSynchronizacji } from '../data/KolejkaSynchronizacji'
import { utworzMetadane } from '../domain/fabryki'
import { SyncEngine, pobierzStanSynchronizacji, pobierzKonfliktySynchronizacji } from './SyncEngine'
import { TABELE_FINANSOW_WSPOLNYCH, ustawBiezacyDostep } from './UprawnieniaService'
import { utworzKase, edytujKase, dodajOperacjeKasy, edytujOperacjeKasy, usunOperacjeKasy, przywrocOperacjeKasy, pobierzSaldoKasy } from './WspolneKasyService'
import { utworzRozliczenie, dodajWydatekGrupowy, edytujWydatekGrupowy, dodajZwrot, pobierzBilansRozliczenia, pobierzWidokRozliczenia, zmienEtapRozliczenia } from './RozliczeniaService'
import { walidujObrazFinansowy } from '../../server/wspolne/SynchronizacjaFinansow.ts'
import { utworzBackup, przygotujBackupDoPrzywracania, przywrocBackup } from './BackupService'
import { RejestrProfili, zarejestrujProfilSesji, otworzBazeProfilu, aktywujProfil } from '../data/ProfileLokalne'
import { pobierzKonfiguracjeRuntime } from './RuntimeConfigService'
import type { KontoUzytkownika } from './KontaService'

class AtrapaFinansow extends RepozytoriumZdalneInMemory {
  pobierzObslugiwaneTabeleFinansowe() { return TABELE_FINANSOW_WSPOLNYCH }
}
const kasy = { nazwa: 'Kasa', opis: '', ikona: '', kolor: '', waluta: 'PLN', saldoPoczatkoweGrosze: 0, status: 'aktywna' as const }
const operacja = (kwotaGrosze = 1000) => ({ kasaId: 'k', typ: 'wplyw' as const, kwotaGrosze, waluta: 'PLN', dataOperacji: '2026-10-29', kategoria: '', zrodlo: '', opis: 'Test' })
const grupa = { nazwa: 'Test', opis: '', waluta: 'PLN', uczestnicy: [{ id: 'a', nazwa: 'Ala' }, { id: 'b', nazwa: 'Bartek' }], domyslnyPodzial: 'po_rowno' as const, etap: 'aktywne' as const, dataRozpoczecia: '2026-10-29' }
const wydatek = (kwotaGrosze = 10000) => ({ rozliczenieId: 'r', nazwa: 'Test', opis: '', waluta: 'PLN', dataOperacji: '2026-10-29', kwotaGrosze, finansujacy: [{ uczestnikId: 'a', kwotaGrosze }], parametryPodzialu: { metoda: 'po_rowno' as const, uczestnicyIds: ['a', 'b'] } })
const zwrot = { rozliczenieId: 'r', odUczestnikaId: 'b', doUczestnikaId: 'a', kwotaGrosze: 1000, waluta: 'PLN', dataOperacji: '2026-10-29', opis: 'Przelew' }
const polecenie = (oczekiwanaRewizja = 0) => ({ idZapisu: crypto.randomUUID(), oczekiwanaRewizja })
const silnik = (id: string) => new SyncEngine({ installationId: () => id, czyOnline: () => true, opoznieniePonowieniaMs: 0 })
const bazy: BazaOgarniacza[] = []
async function urzadzenie() {
  const nowa = new BazaOgarniacza(`test-f74-${crypto.randomUUID()}`)
  bazy.push(nowa)
  ustawBazePrzedUruchomieniem(nowa)
  await nowa.open()
  return nowa
}
beforeEach(async () => { localStorage.clear(); await urzadzenie() })
afterEach(async () => { vi.restoreAllMocks(); for (const baza of bazy.splice(0)) await baza.delete(); localStorage.clear() })

it('przesyła wszystkie tabele, historię i saldo między dwoma urządzeniami właściciela', async () => {
  const serwer = new AtrapaFinansow()
  await utworzKase('k', kasy, polecenie())
  await dodajOperacjeKasy('o', operacja(), polecenie())
  await utworzRozliczenie('r', grupa, polecenie())
  await dodajWydatekGrupowy('w', wydatek(), polecenie())
  await dodajZwrot('z', zwrot, polecenie())
  expect((await silnik('A').synchronizuj(serwer)).wyslane).toBe(5)
  const historia = (await baza.tabela('operacjeKas').get('o'))!.historiaWersji
  await urzadzenie()
  expect((await silnik('B').synchronizuj(serwer)).pobrane).toBe(5)
  expect(await pobierzSaldoKasy('k')).toBe(1000)
  expect((await baza.tabela('operacjeKas').get('o'))!.historiaWersji).toEqual(historia)
  expect(await baza.tabela('historiaZmian').count()).toBe(5)
  expect((await pobierzBilansRozliczenia('r')).propozycjePrzelewow[0].kwotaGrosze).toBe(4000)
  expect(await silnik('B').synchronizuj(serwer)).toMatchObject({ pobrane: 0, wyslane: 0 })
})

it('pierwszy upload obejmuje wielokrotnie edytowane i usunięte dane F7.3 sprzed kursora', async () => {
  await utworzKase('k', kasy, polecenie())
  await dodajOperacjeKasy('o', operacja(), polecenie())
  await edytujOperacjeKasy('o', operacja(2000), polecenie(1))
  await usunOperacjeKasy('o', polecenie(2))
  await baza.tabela('kolejkaSynchronizacji').clear() // stan zapisany przez F7.3
  await baza.tabela('stanSynchronizacji').put({ ...utworzMetadane('glowny'), stan: 'zsynchronizowano', liczbaKonfliktow: 0, liczbaOczekujacych: 0, kolejkaZmigrowana: true, ostatniSync: '2099-01-01T00:00:00.000Z' })
  const serwer = new AtrapaFinansow()
  await silnik('A').synchronizuj(serwer)
  const rekord = (await serwer.pobierzWszystkie()).find(({ tabela }) => tabela === 'operacjeKas')!.rekord
  expect(rekord).toMatchObject({ rewizja: 3, usunietoAt: expect.any(String), historiaWersji: expect.any(Array) })
  expect((await silnik('A').synchronizuj(serwer)).wyslane).toBe(0)
  expect(await pobierzKolejkeSynchronizacji()).toHaveLength(0)
})

it('nie wysyła nowych tabel do starego backendu i nadal synchronizuje stare Finanse', async () => {
  await utworzKase('k', kasy, polecenie())
  const { pobierzRepozytorium } = await import('../data/Repozytorium')
  await pobierzRepozytorium('wydatki').zapisz({ ...utworzMetadane('osobisty'), kwota: 12.5, data: '2026-10-29', kategoria: 'test', opis: '' })
  const stary = new RepozytoriumZdalneInMemory()
  const wynik = await silnik('A').synchronizuj(stary)
  expect(wynik).toMatchObject({ wyslane: 1, stan: 'oczekuje' })
  expect((await stary.pobierzWszystkie()).map(({ tabela }) => tabela)).toEqual(['wydatki'])
  expect(await pobierzKolejkeSynchronizacji()).toHaveLength(1)
  expect((await pobierzStanSynchronizacji()).ograniczenieFinansowWspolnych).toContain('Serwer nie obsługuje')
  const nowy = new AtrapaFinansow()
  expect((await silnik('A').synchronizuj(nowy)).wyslane).toBe(1)
})

it('ponawia tę samą zmianę po utracie odpowiedzi bez dodatkowej operacji i historii', async () => {
  await utworzKase('k', kasy, polecenie())
  await dodajOperacjeKasy('o', operacja(), polecenie())
  const serwer = new AtrapaFinansow()
  const wyslij = serwer.wyslijZmiany.bind(serwer)
  const proby: string[][] = []
  vi.spyOn(serwer, 'wyslijZmiany').mockImplementation(async (zmiany) => {
    proby.push(zmiany.map(({ zmianaId }) => zmianaId!))
    await wyslij(zmiany)
    if (proby.length === 1) throw new Error('Utrata odpowiedzi')
  })
  await silnik('A').synchronizuj(serwer)
  expect(proby).toHaveLength(2)
  expect(proby[0]).toEqual(proby[1])
  expect(await serwer.pobierzWszystkie()).toHaveLength(2)
  expect(await pobierzSaldoKasy('k')).toBe(1000)
})

it('synchronizuje usunięcie offline i późniejsze przywrócenie z pełną historią', async () => {
  const a = baza
  const serwer = new AtrapaFinansow()
  await utworzKase('k', kasy, polecenie())
  await dodajOperacjeKasy('o', operacja(), polecenie())
  await silnik('A').synchronizuj(serwer)
  const b = await urzadzenie()
  await silnik('B').synchronizuj(serwer)
  ustawBazePrzedUruchomieniem(a); await a.open()
  await usunOperacjeKasy('o', polecenie(1))
  await silnik('A').synchronizuj(serwer)
  ustawBazePrzedUruchomieniem(b); await b.open()
  await silnik('B').synchronizuj(serwer)
  expect(await pobierzSaldoKasy('k')).toBe(0)
  await przywrocOperacjeKasy('o', polecenie(2))
  await silnik('B').synchronizuj(serwer)
  ustawBazePrzedUruchomieniem(a); await a.open()
  await silnik('A').synchronizuj(serwer)
  expect(await pobierzSaldoKasy('k')).toBe(1000)
  expect((await baza.tabela('operacjeKas').get('o'))!.historiaWersji).toHaveLength(3)
})

it.each(['lokalny', 'zdalny'] as const)('rozstrzyga konflikt finansowy przez wybór %s i zachowuje oba pełne warianty', async (typ) => {
  const a = baza
  const serwer = new AtrapaFinansow()
  await utworzRozliczenie('r', grupa, polecenie())
  await dodajWydatekGrupowy('w', wydatek(), polecenie())
  await silnik('A').synchronizuj(serwer)
  const b = await urzadzenie()
  await silnik('B').synchronizuj(serwer)
  ustawBazePrzedUruchomieniem(a); await a.open()
  await edytujWydatekGrupowy('w', wydatek(20000), polecenie(1))
  await silnik('A').synchronizuj(serwer)
  ustawBazePrzedUruchomieniem(b); await b.open()
  await edytujWydatekGrupowy('w', wydatek(6000), polecenie(1))
  const synchronizacja = silnik('B')
  expect((await synchronizacja.synchronizuj(serwer)).konflikty).toBe(1)
  await expect(pobierzBilansRozliczenia('r')).rejects.toThrow('Saldo')
  const [konflikt] = await pobierzKonfliktySynchronizacji()
  await expect(synchronizacja.rozstrzygnijKonflikt(konflikt.id, { typ: 'reczny', pola: { kwotaGrosze: 'zdalny' } })).rejects.toThrow('kompletnej')
  await synchronizacja.rozstrzygnijKonflikt(konflikt.id, { typ })
  const rekord = (await baza.tabela('wydatkiGrupowe').get('w'))!
  expect(rekord.kwotaGrosze).toBe(typ === 'lokalny' ? 6000 : 20000)
  expect(rekord.historiaWersji!.at(-1)!.wariantyKonfliktu).toMatchObject({ lokalny: { kwotaGrosze: 6000, historiaWersji: expect.any(Array) }, zdalny: { kwotaGrosze: 20000, historiaWersji: expect.any(Array) } })
  await synchronizacja.synchronizuj(serwer)
  await urzadzenie()
  await silnik('C').synchronizuj(serwer)
  expect((await pobierzBilansRozliczenia('r')).sumaWydatkowGrosze).toBe(rekord.kwotaGrosze)
})

it('zachowuje dwa rzeczywiste zwroty offline o różnych ID', async () => {
  const a = baza
  const serwer = new AtrapaFinansow()
  await utworzRozliczenie('r', grupa, polecenie())
  await dodajWydatekGrupowy('w', wydatek(), polecenie())
  await silnik('A').synchronizuj(serwer)
  const b = await urzadzenie()
  await silnik('B').synchronizuj(serwer)
  await dodajZwrot('zwrot-B', zwrot, polecenie())
  ustawBazePrzedUruchomieniem(a); await a.open()
  await dodajZwrot('zwrot-A', zwrot, polecenie())
  await silnik('A').synchronizuj(serwer)
  ustawBazePrzedUruchomieniem(b); await b.open()
  expect((await silnik('B').synchronizuj(serwer)).konflikty).toBe(0)
  expect(await baza.tabela('zwrotyRozliczen').count()).toBe(2)
  expect((await pobierzBilansRozliczenia('r')).propozycjePrzelewow[0].kwotaGrosze).toBe(3000)
  expect((await pobierzBilansRozliczenia('r')).sumaWydatkowGrosze).toBe(10000)
})

it('późne zwroty offline zamykają dług, a późna edycja wydatku ponownie otwiera należność', async () => {
  const a = baza
  const serwer = new AtrapaFinansow()
  await utworzRozliczenie('r', grupa, polecenie())
  await dodajWydatekGrupowy('w', wydatek(), polecenie())
  await zmienEtapRozliczenia('r', 'oczekuje', polecenie(1))
  await silnik('A').synchronizuj(serwer)
  const b = await urzadzenie()
  await silnik('B').synchronizuj(serwer)
  await dodajZwrot('zwrot-B', { ...zwrot, kwotaGrosze: 3000 }, polecenie())
  ustawBazePrzedUruchomieniem(a); await a.open()
  await dodajZwrot('zwrot-A', { ...zwrot, kwotaGrosze: 2000 }, polecenie())
  await silnik('A').synchronizuj(serwer)
  ustawBazePrzedUruchomieniem(b); await b.open()
  await silnik('B').synchronizuj(serwer)
  expect((await pobierzWidokRozliczenia('r')).status).toBe('Rozliczone')
  await edytujWydatekGrupowy('w', wydatek(12000), polecenie(1))
  await silnik('B').synchronizuj(serwer)
  ustawBazePrzedUruchomieniem(a); await a.open()
  await silnik('A').synchronizuj(serwer)
  const widok = await pobierzWidokRozliczenia('r')
  expect(widok.status).toBe('Oczekuje na rozliczenie')
  expect(widok.bilans!.propozycjePrzelewow[0].kwotaGrosze).toBe(1000)
  expect(widok.zwroty).toHaveLength(2)
})

it('przyjmuje dziecko przed rodzicem, a niepełnej paczki nie zapisuje i blokuje saldo', async () => {
  const serwer = new AtrapaFinansow()
  await utworzKase('k', kasy, polecenie())
  await dodajOperacjeKasy('o', operacja(), polecenie())
  await silnik('A').synchronizuj(serwer)
  const zmiany = (await serwer.pobierzWszystkie()).sort((a, b) => a.tabela.localeCompare(b.tabela))
  walidujObrazFinansowy(zmiany)
  const b = await urzadzenie()
  vi.spyOn(serwer, 'pobierzZmiany').mockResolvedValueOnce(zmiany.filter(({ tabela }) => tabela === 'operacjeKas'))
  await expect(silnik('B').synchronizuj(serwer)).rejects.toThrow()
  expect(await b.tabela('operacjeKas').count()).toBe(0)
  await expect(pobierzSaldoKasy('k')).rejects.toThrow('Saldo')
  await silnik('B').synchronizuj(serwer)
  expect(await pobierzSaldoKasy('k')).toBe(1000)
})

it('przerwane pobieranie i zmiana bazy profilu nie zapisują danych ani kursora w nowej bazie', async () => {
  const stara = baza
  await utworzKase('k', kasy, polecenie())
  const serwer = new AtrapaFinansow()
  const nowa = await urzadzenie()
  ustawBazePrzedUruchomieniem(stara); await stara.open()
  vi.spyOn(serwer, 'pobierzZmiany').mockImplementation(async () => { ustawBazePrzedUruchomieniem(nowa); return [] })
  await expect(silnik('A').synchronizuj(serwer)).rejects.toThrow('Profil')
  await nowa.open(); await stara.open()
  expect(await nowa.tabela('stanSynchronizacji').count()).toBe(0)
  expect(await nowa.tabela('wspolneKasy').count()).toBe(0)
  expect(await stara.tabela('kolejkaSynchronizacji').count()).toBe(1)
})

it('nie udostępnia kolejki ani pobranych finansów lokalnemu Edytorowi z grantem finanse', async () => {
  await utworzKase('k', kasy, polecenie())
  const rekord = (await baza.tabela('wspolneKasy').get('k'))!
  ustawBiezacyDostep((modul) => modul === 'finanse')
  expect(await pobierzKolejkeSynchronizacji()).toHaveLength(0)
  const serwer = new AtrapaFinansow()
  await serwer.ustawZmiany([{ tabela: 'wspolneKasy', rekord, installationId: 'A' }])
  await expect(silnik('B').synchronizuj(serwer)).rejects.toThrow('właściciela')
  expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(1)
})

it('wycofuje zapis rekordu i historii, gdy outbox odmawia zapisu', async () => {
  vi.spyOn(baza.tabela('kolejkaSynchronizacji'), 'add').mockRejectedValueOnce(new Error('Awaria kolejki'))
  await expect(utworzKase('k', kasy, polecenie())).rejects.toThrow('Awaria kolejki')
  expect(await baza.tabela('wspolneKasy').count()).toBe(0)
  expect(await baza.tabela('historiaZmian').count()).toBe(0)
})

it('ponownie przygotowuje dane przywrócone z kopii po wcześniejszej migracji kolejki', async () => {
  await utworzKase('k', kasy, polecenie())
  const kopia = await przygotujBackupDoPrzywracania(JSON.stringify(await utworzBackup(['wspolneKasy'])))
  const serwer = new AtrapaFinansow()
  await silnik('A').synchronizuj(serwer)
  await edytujKase('k', { ...kasy, nazwa: 'Po zmianie' }, polecenie(1))
  await silnik('A').synchronizuj(serwer)
  expect((await pobierzStanSynchronizacji()).finanseWspolneZmigrowane).toBe(true)
  await przywrocBackup(kopia)
  expect((await pobierzStanSynchronizacji()).finanseWspolneZmigrowane).toBe(false)
  expect((await silnik('A').synchronizuj(serwer)).konflikty).toBe(1)
  expect(await pobierzKolejkeSynchronizacji()).toHaveLength(1)
  expect((await baza.tabela('wspolneKasy').get('k'))!.nazwa).toBe('Kasa')
})

it('zachowuje bazę pierwszej zmiany mimo kilku lokalnych edycji i wykrywa zmianę formularza podczas pull', async () => {
  await utworzKase('k', kasy, polecenie())
  await edytujKase('k', { ...kasy, nazwa: 'Druga' }, polecenie(1))
  await edytujKase('k', { ...kasy, nazwa: 'Trzecia' }, polecenie(2))
  expect((await pobierzKolejkeSynchronizacji())[0].bazowyUpdatedAt).toBeUndefined()
  const serwer = new AtrapaFinansow()
  await silnik('A').synchronizuj(serwer)
  const pobierz = serwer.pobierzZmiany.bind(serwer)
  vi.spyOn(serwer, 'pobierzZmiany').mockImplementationOnce(async (od) => {
    const wynik = await pobierz(od)
    await new Promise((gotowe) => setTimeout(gotowe, 20))
    await edytujKase('k', { ...kasy, nazwa: 'Czwarta' }, polecenie(3))
    return wynik
  })
  expect((await silnik('A').synchronizuj(serwer)).stan).toBe('oczekuje')
  expect((await baza.tabela('wspolneKasy').get('k'))!.nazwa).toBe('Czwarta')
  expect(await pobierzKolejkeSynchronizacji()).toHaveLength(1)
})

it('chroni rzeczywiste profile właścicieli i Edytora oraz nie potwierdza wysyłki po zmianie aktywnego profilu', async () => {
  const rejestr = new RejestrProfili(`profile-f74-${crypto.randomUUID()}`)
  const konfiguracja = pobierzKonfiguracjeRuntime()
  const poprzedniAdres = konfiguracja.syncApiUrl
  konfiguracja.syncApiUrl = 'https://finanse.example.test'
  const konto = (id: string): KontoUzytkownika => ({ zalogowany: true, uzytkownikId: id, wlascicielId: id, rola: 'wlasciciel', email: `${id}@example.test`, granty: [], edytorzy: [] })
  const a = await zarejestrujProfilSesji(konfiguracja.syncApiUrl, konto('a'), rejestr)
  const b = await zarejestrujProfilSesji(konfiguracja.syncApiUrl, konto('b'), rejestr)
  const e = await zarejestrujProfilSesji(konfiguracja.syncApiUrl, { ...konto('e'), wlascicielId: 'a', rola: 'edytor', granty: [{ id: 'g', editorId: 'e', modul: 'finanse', odczyt: true, edycja: true, status: 'aktywne' }] }, rejestr)
  const profile = await Promise.all([a, b, e].map(otworzBazeProfilu))
  bazy.push(...profile)
  try {
    ustawBazePrzedUruchomieniem(profile[0]); await profile[0].open(); await aktywujProfil(a, rejestr)
    await utworzKase('k', kasy, polecenie())
    const serwerA = new AtrapaFinansow()
    const wyslij = serwerA.wyslijZmiany.bind(serwerA)
    const przerwij = vi.spyOn(serwerA, 'wyslijZmiany').mockImplementationOnce(async (zmiany) => {
      await wyslij(zmiany)
      ustawBazePrzedUruchomieniem(profile[1]); await profile[1].open(); await aktywujProfil(b, rejestr)
    })
    await expect(silnik('A').synchronizuj(serwerA)).rejects.toThrow('Profil')
    expect(await profile[1].tabela('stanSynchronizacji').count()).toBe(0)
    expect(await profile[1].tabela('wspolneKasy').count()).toBe(0)
    przerwij.mockRestore()
    ustawBazePrzedUruchomieniem(profile[0]); await profile[0].open(); await aktywujProfil(a, rejestr)
    expect(await pobierzKolejkeSynchronizacji()).toHaveLength(1)
    expect((await silnik('A').synchronizuj(serwerA)).konflikty).toBe(0)
    expect(await pobierzKolejkeSynchronizacji()).toHaveLength(0)
    ustawBazePrzedUruchomieniem(profile[2]); await profile[2].open(); await aktywujProfil(e, rejestr)
    await expect(silnik('E').synchronizuj(serwerA)).rejects.toThrow('właściciela')
    expect(await profile[2].tabela('wspolneKasy').count()).toBe(0)
  } finally {
    konfiguracja.syncApiUrl = poprzedniAdres
    await rejestr.delete()
  }
})
