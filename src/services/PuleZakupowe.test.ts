import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { baza, BazaOgarniacza, ustawBazePrzedUruchomieniem } from '../data/BazaOgarniacza'
import { ustawBiezacyDostep } from './UprawnieniaService'
import { utworzPuleFinansowa, pobierzWidokPuli, edytujPuleFinansowa, zmienArchiwizacjePuli } from './WspolneKasyService'
import { zarejestrujZakupPuli, skorygujZakupPuli, stornujKorekteZakupu, pobierzZakupyPuli, type DaneZakupuPuli, type DaneKorektyZakupu } from './PuleService'
import { przygotujBackupDoPrzywracania, przywrocBackup, utworzBackup } from './BackupService'
import { kosztZakresu } from '../../server/wspolne/ObliczeniaPul.ts'
import { pobierzKolejkeSynchronizacji } from '../data/KolejkaSynchronizacji'

const noweId = () => crypto.randomUUID()
const polecenie = (oczekiwanaRewizja = 0) => ({ idZapisu: noweId(), oczekiwanaRewizja })
const partia = (liczbaSztuk = 3, kosztTowaruGrosze = 1000, produktId = noweId()) => ({ id: noweId(), produktId, nazwaProduktu: 'Produkt A', liczbaSztuk, kosztTowaruGrosze })
const daneZakupu = (partie = [partia()]): DaneZakupuPuli => ({ nazwa: 'Dostawa testowa', dataZakupu: '2026-11-03', opis: '', dokumentyIds: [], operacjaGotowkiId: noweId(), partie, kosztyDodatkowe: [] })
const daneKorekty = (partiaId: string, zmianaKosztuGrosze = 200): DaneKorektyZakupu => ({ rodzaj: 'cena', dataOperacji: '2026-11-04', uzasadnienie: 'Korekta faktury', pozycje: [{ partiaId, zmianaSztuk: 0, zmianaKosztuGrosze }] })
let pulaId: string
beforeEach(async () => {
  localStorage.clear(); ustawBiezacyDostep(() => true)
  ustawBazePrzedUruchomieniem(new BazaOgarniacza('test-fz4-' + noweId())); await baza.open()
  pulaId = noweId(); await utworzPuleFinansowa(pulaId, { nazwa: 'Towar', opis: '', rodzaj: 'zakupowa' }, polecenie())
})
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); ustawBiezacyDostep(); localStorage.clear(); await baza.delete() })
async function kup(dane = daneZakupu()) {
  const id = noweId(); await zarejestrujZakupPuli(pulaId, id, dane, polecenie(), 1); return id
}

it('tworzy Pulę zakupową bez uczestników i opłacony zakup z jedną partią offline', async () => {
  vi.stubGlobal('navigator', { onLine: false })
  const dane = daneZakupu(), id = await kup(dane)
  const widok = await pobierzWidokPuli(pulaId), zakupy = await pobierzZakupyPuli(pulaId)
  expect(widok.pula.pula?.rodzaj).toBe('zakupowa'); expect(widok.pula).not.toHaveProperty('uczestnicy')
  expect(widok.podsumowanie?.saldoGrosze).toBe(-1000)
  expect(zakupy.zakupy[0]).toMatchObject({ id, partie: dane.partie })
  expect(zakupy.wynik).toMatchObject({ wartoscZapasuGrosze: 1000, zapas: { partie: [{ liczbaSztuk: 3 }] } })
  expect(await baza.tabela('operacjeKas').count()).toBe(1); expect(await baza.tabela('wydatki').count()).toBe(0)
  expect(await pobierzKolejkeSynchronizacji()).toEqual([])
  const nazwa = baza.name; baza.close(); await baza.open(); expect(baza.name).toBe(nazwa)
  expect((await pobierzZakupyPuli(pulaId)).wynik?.wartoscZapasuGrosze).toBe(1000)
})

it('zachowuje osobne partie i koszty kolejnych zakupów tego samego produktu', async () => {
  const produktId = noweId(), pierwsze = daneZakupu([partia(10, 5000, produktId)]), drugie = daneZakupu([partia(15, 9000, produktId), partia(20, 8000)])
  await kup(pierwsze); await kup({ ...drugie, dataZakupu: '2026-11-05' })
  const widok = await pobierzZakupyPuli(pulaId)
  expect(widok.zakupy).toHaveLength(2); expect(widok.wynik?.zapas.partie).toHaveLength(3)
  expect(widok.wynik?.zapas.produkty.find((produkt) => produkt.produktId === produktId)?.liczbaSztuk).toBe(25)
  expect(widok.wynik?.zapas.partie.find((partia) => partia.partiaId === pierwsze.partie[0].id)?.kosztNabyciaGrosze).toBe(5000)
})

it('dzieli 1000 groszy na sztuki 333, 333, 334 i alokuje koszty bez utraty grosza', async () => {
  expect([0, 1, 2].map((od) => kosztZakresu(1000, 3, od, 1))).toEqual([333, 333, 334])
  const dane = daneZakupu([partia(1, 0), partia(1, 0), partia(1, 0)])
  dane.kosztyDodatkowe = [{ id: noweId(), nazwa: 'Transport', kwotaGrosze: 1000 }]
  await kup(dane)
  const widok = await pobierzZakupyPuli(pulaId)
  expect(widok.zakupy[0].kosztyDodatkowe[0].alokacja.map((element) => element.kwotaGrosze).sort()).toEqual([333, 333, 334])
  expect(widok.wynik?.wartoscZapasuGrosze).toBe(1000)
  expect((await pobierzWidokPuli(pulaId)).podsumowanie?.wydatkiGrosze).toBe(1000)
})

it('koryguje koszt i alokowane koszty dodatkowe bez nadpisywania faktu ani nowej płatności', async () => {
  const dane = daneZakupu(), id = await kup(dane), korekta = daneKorekty(dane.partie[0].id), zapis = polecenie(1), korektaId = noweId()
  await skorygujZakupPuli(id, korektaId, korekta, zapis, 1)
  await skorygujZakupPuli(id, korektaId, korekta, zapis, 1)
  let widok = await pobierzZakupyPuli(pulaId)
  expect(widok.zakupy[0].partie).toMatchObject(dane.partie); expect(widok.zakupy[0].korekty).toHaveLength(1)
  expect(widok.wynik?.wartoscZapasuGrosze).toBe(1200); expect(widok.wynik?.koszty.razemGrosze).toBe(1200)
  expect((await pobierzWidokPuli(pulaId)).podsumowanie?.saldoGrosze).toBe(-1000)
  await skorygujZakupPuli(id, noweId(), { ...korekta, uzasadnienie: 'Koszty dodatkowe: zmiana dostawy', pozycje: [{ partiaId: dane.partie[0].id, zmianaSztuk: 0, zmianaKosztuGrosze: 100 }] }, polecenie(2), 1)
  const storno = polecenie(3)
  await stornujKorekteZakupu(id, korektaId, storno, 1); await stornujKorekteZakupu(id, korektaId, storno, 1)
  await skorygujZakupPuli(id, korektaId, korekta, zapis, 1)
  widok = await pobierzZakupyPuli(pulaId)
  expect(widok.wynik?.wartoscZapasuGrosze).toBe(1100); expect(widok.zakupy[0].historiaWersji).toHaveLength(4)
})

it('anuluje błędny zakup i atomowo stornuje anulowanie wraz z gotówką', async () => {
  const dane = daneZakupu(), id = await kup(dane), korektaId = noweId()
  const anulowanie: DaneKorektyZakupu = { rodzaj: 'anulowanie', dataOperacji: '2026-11-05', uzasadnienie: 'Błędne księgowanie', pozycje: [] }
  const zapis = polecenie(1)
  await skorygujZakupPuli(id, korektaId, anulowanie, zapis, 1); await skorygujZakupPuli(id, korektaId, anulowanie, zapis, 1)
  expect((await pobierzZakupyPuli(pulaId)).wynik).toMatchObject({ wartoscZapasuGrosze: 0, koszty: { razemGrosze: 0 } })
  expect((await pobierzWidokPuli(pulaId)).podsumowanie?.saldoGrosze).toBe(0)
  expect(await baza.tabela('zakupyPul').count()).toBe(1); expect(await baza.tabela('operacjeKas').count()).toBe(2)
  await expect(skorygujZakupPuli(id, noweId(), anulowanie, polecenie(2), 1)).rejects.toThrow('anulowany')
  const storno = polecenie(2)
  await stornujKorekteZakupu(id, korektaId, storno, 1); await stornujKorekteZakupu(id, korektaId, storno, 1)
  expect((await pobierzZakupyPuli(pulaId)).wynik?.wartoscZapasuGrosze).toBe(1000)
  expect((await pobierzWidokPuli(pulaId)).podsumowanie?.saldoGrosze).toBe(-1000)
})

it('obsługuje pomyłkę partii i rozbieżność, blokuje ujemny stan oraz storno użytego przyjęcia', async () => {
  const dane = daneZakupu([partia(3, 1000), partia(3, 1000)]), id = await kup(dane)
  await skorygujZakupPuli(id, noweId(), { rodzaj: 'pomylka_partii', dataOperacji: '2026-11-04', uzasadnienie: 'Zła partia', pozycje: [{ partiaId: dane.partie[0].id, zmianaSztuk: -1 }, { partiaId: dane.partie[1].id, zmianaSztuk: 1 }] }, polecenie(1), 1)
  expect((await pobierzZakupyPuli(pulaId)).wynik?.zapas.partie.map((partia) => partia.liczbaSztuk)).toEqual([2, 4])
  expect((await pobierzZakupyPuli(pulaId)).wynik?.wartoscZapasuGrosze).toBe(2000)
  expect((await pobierzZakupyPuli(pulaId)).wynik?.zapas.partie.map((partia) => partia.kosztNabyciaGrosze)).toEqual([1000, 1000])
  const przyjecieId = noweId(), partiaId = dane.partie[0].id
  const rozbieznosc: DaneKorektyZakupu = { rodzaj: 'rozbieznosc', dataOperacji: '2026-11-05', uzasadnienie: 'Protokół', pozycje: [{ partiaId, zmianaSztuk: 2, zmianaKosztuGrosze: 500 }] }
  await skorygujZakupPuli(id, przyjecieId, rozbieznosc, polecenie(2), 1)
  await skorygujZakupPuli(id, noweId(), { ...rozbieznosc, dataOperacji: '2026-11-06', pozycje: [{ partiaId, zmianaSztuk: -4, zmianaKosztuGrosze: 0 }] }, polecenie(3), 1)
  await expect(stornujKorekteZakupu(id, przyjecieId, polecenie(4), 1)).rejects.toThrow()
  await expect(skorygujZakupPuli(id, noweId(), { ...rozbieznosc, pozycje: [{ partiaId, zmianaSztuk: -1, zmianaKosztuGrosze: 0 }] }, polecenie(4), 1)).rejects.toThrow()
  expect((await baza.tabela('zakupyPul').get(id))?.rewizja).toBe(4)
})

it('chroni rewizje, role, kwoty, historię, rodzaj i walutę po pierwszym zakupie', async () => {
  const dane = daneZakupu(), id = noweId(), zapis = polecenie()
  await Promise.all([zarejestrujZakupPuli(pulaId, id, dane, zapis, 1), zarejestrujZakupPuli(pulaId, id, dane, zapis, 1)])
  await expect(zarejestrujZakupPuli(pulaId, id, { ...dane, opis: 'Inny' }, zapis, 1)).rejects.toThrow()
  await expect(skorygujZakupPuli(id, noweId(), daneKorekty(dane.partie[0].id), polecenie(0), 1)).rejects.toThrow('rewizja')
  await expect(skorygujZakupPuli(id, noweId(), daneKorekty(dane.partie[0].id, -1001), polecenie(1), 1)).rejects.toThrow()
  await expect(edytujPuleFinansowa(pulaId, { nazwa: 'Towar', opis: '', waluta: 'EUR' }, polecenie(1))).rejects.toThrow('waluty')
  await expect(edytujPuleFinansowa(pulaId, { nazwa: 'Towar', opis: '', rodzaj: 'finansowa' }, polecenie(1))).rejects.toThrow('rodzaju')
  await zmienArchiwizacjePuli(pulaId, true, polecenie(1)); await expect(kup()).rejects.toThrow('zarchiwizowaną')
  expect(await baza.tabela('operacjeKas').count()).toBe(1)
})

it('wycofuje zakup, gotówkę, historię i kolejkę po awarii ostatniego zapisu', async () => {
  const dane = daneZakupu(), id = noweId(), przed = await utworzBackup()
  const tabela = baza.tabela('historiaZmian'), oryginal = tabela.add.bind(tabela)
  let licznik = 0
  vi.spyOn(tabela, 'add').mockImplementation((...argumenty) => { if (++licznik === 2) throw new Error('Usterka dysku'); return oryginal(...argumenty) })
  await expect(zarejestrujZakupPuli(pulaId, id, dane, polecenie(), 1)).rejects.toThrow('Usterka dysku')
  expect(await baza.tabela('zakupyPul').count()).toBe(0); expect(await baza.tabela('operacjeKas').count()).toBe(0)
  expect((await utworzBackup()).payload).toEqual(przed.payload)
})

it('zachowuje zakup, koszty, korekty i storna w pełnym backupie i restore', async () => {
  const dane = daneZakupu(), id = await kup(dane), cenaId = noweId(), anulowanieId = noweId()
  await skorygujZakupPuli(id, cenaId, daneKorekty(dane.partie[0].id), polecenie(1), 1)
  await skorygujZakupPuli(id, anulowanieId, { rodzaj: 'anulowanie', dataOperacji: '2026-11-05', uzasadnienie: 'Błędny zakup', pozycje: [] }, polecenie(2), 1)
  await expect(stornujKorekteZakupu(id, cenaId, polecenie(3), 1)).rejects.toThrow('Najpierw stornuj anulowanie')
  await stornujKorekteZakupu(id, anulowanieId, polecenie(3), 1)
  const przed = await pobierzZakupyPuli(pulaId), kopia = await przygotujBackupDoPrzywracania(JSON.stringify(await utworzBackup()))
  await skorygujZakupPuli(id, noweId(), daneKorekty(dane.partie[0].id, 300), polecenie(4), 1)
  await przywrocBackup(kopia)
  expect(await pobierzZakupyPuli(pulaId)).toEqual(przed)
})

it('odmawia Edytorowi oraz nie ujawnia zakupu w innej bazie profilu', async () => {
  const dane = daneZakupu(), id = await kup(dane)
  ustawBiezacyDostep((modul) => modul !== 'ustawienia')
  await expect(pobierzZakupyPuli(pulaId)).rejects.toThrow(); await expect(kup()).rejects.toThrow()
  await expect(skorygujZakupPuli(id, noweId(), daneKorekty(dane.partie[0].id), polecenie(1), 1)).rejects.toThrow()
  ustawBiezacyDostep(() => true)
  const pierwsza = baza, druga = new BazaOgarniacza('test-drugi-fz4-' + noweId())
  try { ustawBazePrzedUruchomieniem(druga); await druga.open(); await expect(pobierzZakupyPuli(pulaId)).rejects.toThrow(); expect(await druga.tabela('zakupyPul').count()).toBe(0) }
  finally { await druga.delete(); ustawBazePrzedUruchomieniem(pierwsza) }
})

it('zerowy zakup nie tworzy gotówki, ale blokuje rodzaj i walutę Puli', async () => {
  await kup(daneZakupu([partia(1, 0)]))
  const widok = await pobierzWidokPuli(pulaId)
  expect(widok.maFakty).toBe(true); expect(widok.operacje).toHaveLength(0)
  await expect(edytujPuleFinansowa(pulaId, { nazwa: 'Towar', opis: '', waluta: 'EUR' }, polecenie(1))).rejects.toThrow('waluty')
  expect((await pobierzZakupyPuli(pulaId)).wynik?.zapas.partie[0].liczbaSztuk).toBe(1)
})

it('ponowienie edycji bez jawnego rodzaju nie cofa późniejszego wyboru rodzaju pustej Puli', async () => {
  const dane = { nazwa: 'Towar', opis: '' }, zapis = polecenie(1)
  await edytujPuleFinansowa(pulaId, dane, zapis)
  await edytujPuleFinansowa(pulaId, { ...dane, rodzaj: 'finansowa' }, polecenie(2))
  await edytujPuleFinansowa(pulaId, dane, zapis)
  expect((await pobierzWidokPuli(pulaId)).pula).toMatchObject({ rewizja: 3, pula: { rodzaj: 'finansowa' } })
})
