import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { baza, BazaOgarniacza, ustawBazePrzedUruchomieniem } from '../data/BazaOgarniacza'
import { ustawBiezacyDostep } from './UprawnieniaService'
import { utworzPuleFinansowa, edytujPuleFinansowa, zapiszOperacjePuli, zmienArchiwizacjePuli, pobierzWidokPuli, listaPodsumowanPul, utworzKase, pobierzSaldoKasy, type DaneOperacjiPuli } from './WspolneKasyService'
import { przygotujBackupDoPrzywracania, przywrocBackup, utworzBackup } from './BackupService'
import { pobierzKolejkeSynchronizacji } from '../data/KolejkaSynchronizacji'
import { RepozytoriumZdalneInMemory } from '../data/RepozytoriumZdalneInMemory'
import { SyncEngine } from './SyncEngine'
import { KonfliktZapisuFinansowego } from './ZapisFinansowWspolnych'
import { RejestrProfili, aktywujProfil, otworzBazeProfilu, zarejestrujProfilSesji } from '../data/ProfileLokalne'
import { pobierzKonfiguracjeRuntime } from './RuntimeConfigService'
import type { KontoUzytkownika } from './KontaService'

const polecenie = (oczekiwanaRewizja = 0) => ({ idZapisu: crypto.randomUUID(), oczekiwanaRewizja })
let pulaId: string
const dane = { nazwa: 'Wakacje', opis: 'Nasz cel' }
const operacja = (kwotaGrosze: number, typ: 'wplyw' | 'wydatek' = 'wplyw'): DaneOperacjiPuli => ({ typ, kwotaGrosze, dataOperacji: '2026-11-03', opis: 'Operacja testowa', zrodlo: '', kategoria: '' })
const dodaj = async (kwotaGrosze: number, typ: 'wplyw' | 'wydatek' = 'wplyw') => {
  const id = crypto.randomUUID(), pula = (await pobierzWidokPuli(pulaId)).pula
  await zapiszOperacjePuli(pulaId, id, operacja(kwotaGrosze, typ), 'utworzenie', polecenie(), pula.rewizja!)
  return id
}
beforeEach(async () => {
  localStorage.clear(); ustawBiezacyDostep(() => true)
  ustawBazePrzedUruchomieniem(new BazaOgarniacza('test-pule-' + crypto.randomUUID())); await baza.open()
  pulaId = crypto.randomUUID()
})
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); ustawBiezacyDostep(); localStorage.clear(); await baza.delete() })

it('tworzy Pulę z PLN, zerowym saldem, bez uczestników i bez celu', async () => {
  await utworzPuleFinansowa(pulaId, { ...dane, nazwa: ' Wakacje ' }, polecenie())
  const widok = await pobierzWidokPuli(pulaId)
  expect(widok.pula).toMatchObject({ nazwa: 'Wakacje', waluta: 'PLN', saldoPoczatkoweGrosze: 0, pula: { wersja: 1, rodzaj: 'finansowa' } })
  expect(widok.pula).not.toHaveProperty('uczestnicy')
  expect(widok.podsumowanie).toEqual({ saldoGrosze: 0, wplatyGrosze: 0, wydatkiGrosze: 0 })
  expect(widok.pula.historiaWersji).toHaveLength(1)
})

it('oddziela zebrane wpłaty i postęp celu od salda oraz dopuszcza ujemny bilans', async () => {
  await utworzPuleFinansowa(pulaId, { ...dane, celGrosze: 100000 }, polecenie())
  await dodaj(30000); await dodaj(20000); await dodaj(20000, 'wydatek')
  expect((await pobierzWidokPuli(pulaId)).podsumowanie).toEqual({ saldoGrosze: 30000, wplatyGrosze: 50000, wydatkiGrosze: 20000, postep: 50 })
  await dodaj(40000, 'wydatek')
  expect((await pobierzWidokPuli(pulaId)).podsumowanie?.saldoGrosze).toBe(-10000)
  expect(await baza.tabela('wydatki').count()).toBe(0)
  expect(await baza.tabela('zobowiazania').count()).toBe(0)
  await expect(pobierzSaldoKasy(pulaId)).rejects.toThrow('kompletnej projekcji FZ')
})

it('waliduje nazwę, cel i kwoty także poza formularzem', async () => {
  await expect(utworzPuleFinansowa(pulaId, { ...dane, nazwa: '  ' }, polecenie())).rejects.toThrow()
  await expect(utworzPuleFinansowa(pulaId, { ...dane, celGrosze: 0 }, polecenie())).rejects.toThrow()
  await expect(utworzPuleFinansowa(pulaId, { ...dane, waluta: 'XYZ' }, polecenie())).rejects.toThrow()
  await utworzPuleFinansowa(pulaId, dane, polecenie())
  await expect(dodaj(0)).rejects.toThrow(); await expect(dodaj(1.5)).rejects.toThrow()
  expect(await baza.tabela('operacjeKas').count()).toBe(0)
})

it('wycofuje zapis przekraczający zakres zagregowanych kwot', async () => {
  await utworzPuleFinansowa(pulaId, dane, polecenie()); await dodaj(Number.MAX_SAFE_INTEGER)
  const liczbaHistorii = await baza.tabela('historiaZmian').count()
  await expect(dodaj(1)).rejects.toThrow('bezpieczny zakres')
  expect(await baza.tabela('operacjeKas').count()).toBe(1)
  expect(await baza.tabela('historiaZmian').count()).toBe(liczbaHistorii)
  expect((await pobierzWidokPuli(pulaId)).podsumowanie?.saldoGrosze).toBe(Number.MAX_SAFE_INTEGER)
})

it('edytuje nazwę, opis, cel i walutę tylko przed pierwszym faktem', async () => {
  await utworzPuleFinansowa(pulaId, dane, polecenie())
  await edytujPuleFinansowa(pulaId, { nazwa: 'Inny cel', opis: 'Zmieniony', waluta: 'EUR', celGrosze: 50000 }, polecenie(1))
  const id = await dodaj(1000)
  await zapiszOperacjePuli(pulaId, id, undefined, 'usuniecie', polecenie(1), 2)
  await expect(edytujPuleFinansowa(pulaId, { ...dane, waluta: 'PLN' }, polecenie(2))).rejects.toThrow('waluty')
  await edytujPuleFinansowa(pulaId, { ...dane, waluta: 'EUR' }, polecenie(2))
  expect((await pobierzWidokPuli(pulaId)).pula.pula?.celGrosze).toBeUndefined()
})

it('poprawia operację, usuwa ją miękko i przywraca z pełną historią', async () => {
  await utworzPuleFinansowa(pulaId, dane, polecenie())
  const id = await dodaj(1000)
  await zapiszOperacjePuli(pulaId, id, { ...operacja(1500), opis: 'Poprawiona', zrodlo: 'Oszczędności' }, 'aktualizacja', polecenie(1), 1)
  expect((await pobierzWidokPuli(pulaId)).podsumowanie?.saldoGrosze).toBe(1500)
  await zapiszOperacjePuli(pulaId, id, undefined, 'usuniecie', polecenie(2), 1)
  expect((await pobierzWidokPuli(pulaId)).podsumowanie?.saldoGrosze).toBe(0)
  expect((await pobierzWidokPuli(pulaId)).operacje).toHaveLength(1)
  await zapiszOperacjePuli(pulaId, id, undefined, 'przywrocenie', polecenie(3), 1)
  const widok = await pobierzWidokPuli(pulaId)
  expect(widok.podsumowanie?.saldoGrosze).toBe(1500)
  expect(widok.operacje[0].historiaWersji?.map((wersja) => wersja.operacja)).toEqual(['utworzenie', 'aktualizacja', 'usuniecie', 'przywrocenie'])
})

it('archiwum zachowuje saldo i historię oraz blokuje zwykłe zapisy do przywrócenia', async () => {
  await utworzPuleFinansowa(pulaId, dane, polecenie()); const id = await dodaj(1000)
  await zmienArchiwizacjePuli(pulaId, true, polecenie(1))
  expect((await pobierzWidokPuli(pulaId)).podsumowanie?.saldoGrosze).toBe(1000)
  await expect(dodaj(100)).rejects.toThrow('zarchiwizowana')
  await expect(zapiszOperacjePuli(pulaId, id, undefined, 'usuniecie', polecenie(1), 2)).rejects.toThrow('zarchiwizowana')
  await expect(edytujPuleFinansowa(pulaId, dane, polecenie(2))).rejects.toThrow('zarchiwizowana')
  await zmienArchiwizacjePuli(pulaId, false, polecenie(2)); await dodaj(100)
  expect((await pobierzWidokPuli(pulaId)).podsumowanie?.saldoGrosze).toBe(1100)
})

it('podwójny zapis tworzy jeden fakt, a konflikt rewizji nie zmienia danych', async () => {
  const tworzenie = polecenie()
  await Promise.all([utworzPuleFinansowa(pulaId, dane, tworzenie), utworzPuleFinansowa(pulaId, dane, tworzenie)])
  const id = crypto.randomUUID(), zapis = polecenie()
  await Promise.all([zapiszOperacjePuli(pulaId, id, operacja(101), 'utworzenie', zapis, 1), zapiszOperacjePuli(pulaId, id, operacja(101), 'utworzenie', zapis, 1)])
  expect(await baza.tabela('operacjeKas').count()).toBe(1)
  await expect(zapiszOperacjePuli(pulaId, id, operacja(102), 'aktualizacja', polecenie(0), 1)).rejects.toBeInstanceOf(KonfliktZapisuFinansowego)
  await edytujPuleFinansowa(pulaId, dane, polecenie(1))
  await expect(zapiszOperacjePuli(pulaId, crypto.randomUUID(), operacja(100), 'utworzenie', polecenie(), 1)).rejects.toBeInstanceOf(KonfliktZapisuFinansowego)
  expect((await pobierzWidokPuli(pulaId)).podsumowanie?.saldoGrosze).toBe(101)
})

it('błąd historii wycofuje operację i pozwala ponowić te same ID', async () => {
  await utworzPuleFinansowa(pulaId, dane, polecenie())
  const id = crypto.randomUUID(), zapis = polecenie(), tabela = baza.tabela('historiaZmian')
  const usterka = vi.spyOn(tabela, 'add').mockRejectedValueOnce(new Error('Usterka dysku'))
  await expect(zapiszOperacjePuli(pulaId, id, operacja(100), 'utworzenie', zapis, 1)).rejects.toThrow('Usterka dysku')
  expect(await baza.tabela('operacjeKas').count()).toBe(0)
  usterka.mockRestore()
  await zapiszOperacjePuli(pulaId, id, operacja(100), 'utworzenie', zapis, 1)
  expect((await pobierzWidokPuli(pulaId)).podsumowanie?.saldoGrosze).toBe(100)
})

it('nie pokazuje pozornego zera przy niekompletności, zachowuje historię i odmawia zapisów', async () => {
  await utworzPuleFinansowa(pulaId, dane, polecenie()); await dodaj(1000)
  await baza.tabela('stanSynchronizacji').put({ id: 'glowny', stan: 'oczekuje', liczbaKonfliktow: 0, liczbaOczekujacych: 0, createdAt: new Date().toISOString(), finanseWspolneNiekompletne: true, updatedAt: new Date().toISOString() })
  const widok = await pobierzWidokPuli(pulaId)
  expect(widok.podsumowanie).toBeUndefined(); expect(widok.ograniczenie).toBeTruthy(); expect(widok.operacje).toHaveLength(1)
  await expect(dodaj(100)).rejects.toThrow('Niekompletne')
})

it('zachowuje stare kasy poza listą Pul i blokuje przeniesienie operacji', async () => {
  const staraId = crypto.randomUUID()
  await utworzKase(staraId, { nazwa: 'Stara kasa', opis: '', ikona: '', kolor: '', waluta: 'PLN', saldoPoczatkoweGrosze: 234, status: 'aktywna' }, polecenie())
  await utworzPuleFinansowa(pulaId, dane, polecenie()); const id = await dodaj(100)
  expect((await listaPodsumowanPul()).map((widok) => widok.pula.id)).toEqual([pulaId])
  expect(await pobierzSaldoKasy(staraId)).toBe(234)
  expect(await baza.tabela('wspolneKasy').get(staraId)).not.toHaveProperty('pula')
  await expect(pobierzWidokPuli(staraId)).rejects.toThrow('Nie znaleziono')
  const druga = crypto.randomUUID(); await utworzPuleFinansowa(druga, dane, polecenie())
  await expect(zapiszOperacjePuli(druga, id, operacja(500), 'aktualizacja', polecenie(1), 1)).rejects.toThrow('tej Puli')
})

it('działa offline po ponownym otwarciu i zachowuje pełny graf po backup/restore bez transportu FZ', async () => {
  vi.stubGlobal('navigator', { ...navigator, onLine: false })
  await utworzPuleFinansowa(pulaId, { ...dane, celGrosze: 10000 }, polecenie()); await dodaj(5000); await dodaj(1000, 'wydatek')
  baza.close(); await baza.open()
  expect((await pobierzWidokPuli(pulaId)).podsumowanie).toMatchObject({ saldoGrosze: 4000, postep: 50 })
  const kopia = await przygotujBackupDoPrzywracania(JSON.stringify(await utworzBackup(['puleZobowiazania'])))
  await przywrocBackup(kopia)
  expect((await pobierzWidokPuli(pulaId)).podsumowanie).toMatchObject({ saldoGrosze: 4000, postep: 50 })
  const zdalne = new RepozytoriumZdalneInMemory()
  const wysylka = vi.spyOn(zdalne, 'wyslijZmiany')
  await new SyncEngine({ czyOnline: () => true }).synchronizuj(zdalne)
  expect(wysylka.mock.calls.flatMap((wywolanie) => wywolanie[0]).some((zmiana) => zmiana.rekord.id === pulaId)).toBe(false)
  expect((await pobierzKolejkeSynchronizacji()).some((zmiana) => zmiana.rekordId === pulaId)).toBe(false)
  expect(await baza.tabela('kolejkaSynchronizacji').where('rekordId').equals(pulaId).count()).toBe(1)
})

it('odmawia odczytu i zapisu bez uprawnień właściciela', async () => {
  await utworzPuleFinansowa(pulaId, dane, polecenie())
  ustawBiezacyDostep((modul) => modul === 'finanse')
  await expect(listaPodsumowanPul()).rejects.toThrow('dostępu')
  await expect(pobierzWidokPuli(pulaId)).rejects.toThrow('dostępu')
  await expect(dodaj(100)).rejects.toThrow('dostępu')
})

it('ponowienia edycji, usunięcia i archiwizacji nie cofają późniejszych zmian', async () => {
  await utworzPuleFinansowa(pulaId, dane, polecenie())
  const id = await dodaj(100), edycja = polecenie(1), usuniecie = polecenie(2), archiwizacja = polecenie(1)
  await zapiszOperacjePuli(pulaId, id, operacja(200), 'aktualizacja', edycja, 1)
  await zapiszOperacjePuli(pulaId, id, undefined, 'usuniecie', usuniecie, 1)
  await zapiszOperacjePuli(pulaId, id, undefined, 'przywrocenie', polecenie(3), 1)
  await zapiszOperacjePuli(pulaId, id, operacja(300), 'aktualizacja', polecenie(4), 1)
  await zapiszOperacjePuli(pulaId, id, operacja(200), 'aktualizacja', edycja, 1)
  await zapiszOperacjePuli(pulaId, id, undefined, 'usuniecie', usuniecie, 1)
  expect((await pobierzWidokPuli(pulaId)).podsumowanie?.saldoGrosze).toBe(300)
  await zmienArchiwizacjePuli(pulaId, true, archiwizacja)
  await zmienArchiwizacjePuli(pulaId, false, polecenie(2))
  await edytujPuleFinansowa(pulaId, { ...dane, nazwa: 'Nowa nazwa' }, polecenie(3))
  await zmienArchiwizacjePuli(pulaId, true, archiwizacja)
  expect((await pobierzWidokPuli(pulaId)).pula).toMatchObject({ nazwa: 'Nowa nazwa', status: 'aktywna', rewizja: 4 })
})

it('izoluje bazy właścicieli i odmawia rzeczywistemu Edytorowi z grantem Finanse', async () => {
  const lokalna = baza, poprzedniAdres = pobierzKonfiguracjeRuntime().syncApiUrl
  pobierzKonfiguracjeRuntime().syncApiUrl = 'https://pule.example.test'
  const rejestr = new RejestrProfili('test-profile-pule-' + crypto.randomUUID())
  const konto = (id: string): KontoUzytkownika => ({ zalogowany: true, uzytkownikId: id, wlascicielId: id, email: id + '@example.test', rola: 'wlasciciel', granty: [], edytorzy: [] })
  const pierwszy = await zarejestrujProfilSesji('https://pule.example.test', konto('a'), rejestr)
  const drugi = await zarejestrujProfilSesji('https://pule.example.test', konto('b'), rejestr)
  const edytor = await zarejestrujProfilSesji('https://pule.example.test', { ...konto('edytor'), wlascicielId: 'a', rola: 'edytor', granty: [{ id: 'grant', editorId: 'edytor', modul: 'finanse', odczyt: true, edycja: true, status: 'aktywne' }] }, rejestr)
  const bazy = await Promise.all([pierwszy, drugi, edytor].map(otworzBazeProfilu))
  try {
    ustawBazePrzedUruchomieniem(bazy[0]); await aktywujProfil(pierwszy, rejestr)
    await utworzPuleFinansowa(pulaId, dane, polecenie())
    ustawBazePrzedUruchomieniem(bazy[1]); await aktywujProfil(drugi, rejestr)
    expect(await listaPodsumowanPul()).toEqual([])
    await expect(pobierzWidokPuli(pulaId)).rejects.toThrow('nie istnieje')
    ustawBazePrzedUruchomieniem(bazy[0])
    await expect(listaPodsumowanPul()).rejects.toThrow('dostępu')
    ustawBazePrzedUruchomieniem(bazy[2]); await aktywujProfil(edytor, rejestr)
    await expect(listaPodsumowanPul()).rejects.toThrow('dostępu')
    await expect(utworzPuleFinansowa(crypto.randomUUID(), dane, polecenie())).rejects.toThrow('dostępu')
  } finally { pobierzKonfiguracjeRuntime().syncApiUrl = poprzedniAdres; for (const testowa of bazy) await testowa.delete(); await rejestr.delete(); ustawBazePrzedUruchomieniem(lokalna) }
})
