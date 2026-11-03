import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { baza, BazaOgarniacza, ustawBazePrzedUruchomieniem } from '../data/BazaOgarniacza'
import { ustawBiezacyDostep } from './UprawnieniaService'
import { utworzPuleFinansowa } from './WspolneKasyService'
import { zarejestrujZakupPuli } from './PuleService'
import { zarejestrujSprzedazPuli, skorygujSprzedazPuli, pobierzSprzedazePuli, type DaneSprzedazyPuli, type DaneKorektySprzedazy } from './SprzedazPulService'
import { cenaCalkowitaZJednostkowej } from '../../server/wspolne/ObliczeniaPul.ts'
import { przygotujBackupDoPrzywracania, przywrocBackup, utworzBackup } from './BackupService'
import { pobierzKolejkeSynchronizacji } from '../data/KolejkaSynchronizacji'

const noweId = () => crypto.randomUUID(), polecenie = (oczekiwanaRewizja = 0) => ({ idZapisu: noweId(), oczekiwanaRewizja })
let pulaId: string, zakupId: string, partie: string[]
beforeEach(async () => {
  localStorage.clear(); ustawBiezacyDostep(() => true); ustawBazePrzedUruchomieniem(new BazaOgarniacza('test-fz5-' + noweId())); await baza.open()
  pulaId = noweId(); zakupId = noweId(); partie = [noweId(), noweId()]
  await utworzPuleFinansowa(pulaId, { nazwa: 'Handel', opis: '', rodzaj: 'zakupowa' }, polecenie())
  await zarejestrujZakupPuli(pulaId, zakupId, { nazwa: 'Zakup', opis: '', dataZakupu: '2026-11-01', dokumentyIds: [], operacjaGotowkiId: noweId(), kosztyDodatkowe: [], partie: partie.map((id) => ({ id, produktId: noweId(), nazwaProduktu: 'Produkt', liczbaSztuk: 3, kosztTowaruGrosze: 1000 })) }, polecenie(), 1)
})
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); ustawBiezacyDostep(); localStorage.clear(); await baza.delete() })
const dane = (sztuki = 3, cena = 1000): DaneSprzedazyPuli => ({ dataSprzedazy: '2026-11-03', opis: 'Sprzedaż', platnoscId: noweId(), otrzymanoGrosze: cena, pozycje: [{ id: noweId(), zakupId, partiaId: partie[0], liczbaSztuk: sztuki, cenaCalkowitaGrosze: cena, zrodloCeny: 'calkowita' }] })
const rewizje = () => [{ id: zakupId, rewizja: 1 }]
async function sprzedaj(wartosci = dane()) { const id = noweId(); await zarejestrujSprzedazPuli(pulaId, id, wartosci, polecenie(), 1, rewizje()); return id }
const korekta = (pozycjaId: string, zmiany: Partial<DaneKorektySprzedazy> = {}): DaneKorektySprzedazy => ({ rodzaj: 'zwrot_towaru', pozycjaId, dataOperacji: '2026-11-04', uzasadnienie: 'Protokół', liczbaSztuk: 1, uszkodzoneSztuki: 0, partiaDocelowaId: '', zmianaCenyGrosze: 0, rozliczonoGrosze: 0, ...zmiany })

it.each([1, 3])('sprzedaje %i sztuk offline, zachowuje dokładne 1000 groszy i jeden wpływ', async (sztuki) => {
  vi.stubGlobal('navigator', { onLine: false }); const id = await sprzedaj(dane(sztuki))
  const widok = await pobierzSprzedazePuli(pulaId)
  expect(widok.sprzedaze[0]).toMatchObject({ id, pozycje: [{ cenaCalkowitaGrosze: 1000, cenaJednostkowa: { licznikGroszy: 1000, mianownik: sztuki } }] })
  expect(widok.wynik?.zapas.partie[0].liczbaSztuk).toBe(3 - sztuki)
  expect(await baza.tabela('operacjeKas').count()).toBe(2); expect(await pobierzKolejkeSynchronizacji()).toEqual([])
  expect(cenaCalkowitaZJednostkowej('3.33', 3, 'PLN')).toBe(999)
  expect(() => cenaCalkowitaZJednostkowej('3.333333', 3, 'PLN')).toThrow()
})
it('obsługuje wiele pozycji i partii oraz kontroluje łączny rozchód tej samej partii', async () => {
  const wartosci = dane(2, 1000); wartosci.pozycje.push({ ...wartosci.pozycje[0], id: noweId(), partiaId: partie[1] }); wartosci.otrzymanoGrosze = 2000
  await sprzedaj(wartosci); expect((await pobierzSprzedazePuli(pulaId)).wynik?.zapas.partie.map((partia) => partia.liczbaSztuk)).toEqual([1, 1])
  const zaDuzo = dane(1); zaDuzo.pozycje.push({ ...zaDuzo.pozycje[0], id: noweId() }); zaDuzo.otrzymanoGrosze = 2000
  await expect(sprzedaj(zaDuzo)).rejects.toThrow(); expect(await baza.tabela('sprzedazePul').count()).toBe(1)
})
it('idempotencja, inne dane tego ID, rewizje i brak pełnej zapłaty', async () => {
  const wartosci = dane(), id = noweId(), zapis = polecenie()
  await zarejestrujSprzedazPuli(pulaId, id, wartosci, zapis, 1, rewizje()); await zarejestrujSprzedazPuli(pulaId, id, wartosci, zapis, 1, rewizje())
  await expect(zarejestrujSprzedazPuli(pulaId, id, { ...wartosci, opis: 'Inny' }, zapis, 1, rewizje())).rejects.toThrow()
  await expect(sprzedaj({ ...dane(), otrzymanoGrosze: 1 })).rejects.toThrow('pełnej zapłaty')
  await expect(zarejestrujSprzedazPuli(pulaId, noweId(), dane(), polecenie(), 1, [{ id: zakupId, rewizja: 0 }])).rejects.toThrow()
})
it('zwrot częściowy bez gotówki przywraca dokładny koszt, a uszkodzenie daje stratę', async () => {
  const wartosci = dane(), id = await sprzedaj(wartosci)
  await skorygujSprzedazPuli(id, noweId(), korekta(wartosci.pozycje[0].id), polecenie(1), 1, rewizje())
  let widok = await pobierzSprzedazePuli(pulaId)
  expect(widok.wynik?.zapas.partie[0]).toMatchObject({ liczbaSztuk: 1, wartoscZapasuGrosze: 334, kosztSprzedanychGrosze: 666 })
  await skorygujSprzedazPuli(id, noweId(), korekta(wartosci.pozycje[0].id, { uszkodzoneSztuki: 1 }), polecenie(2), 1, rewizje())
  widok = await pobierzSprzedazePuli(pulaId); expect(widok.wynik?.zapas.partie[0]).toMatchObject({ liczbaSztuk: 1, kosztStratGrosze: 333 })
  expect(await baza.tabela('operacjeKas').count()).toBe(2)
})
it('korekta ceny wymaga rzeczywistego rozliczenia, ponowienie nie dubluje gotówki', async () => {
  const wartosci = dane(), id = await sprzedaj(wartosci), k = korekta(wartosci.pozycje[0].id, { rodzaj: 'cena', zmianaCenyGrosze: 200 })
  await expect(skorygujSprzedazPuli(id, noweId(), k, polecenie(1), 1, rewizje())).rejects.toThrow('FZ-6')
  k.rozliczonoGrosze = 200; const zapis = polecenie(1), korektaId = noweId()
  await skorygujSprzedazPuli(id, korektaId, k, zapis, 1, rewizje()); await skorygujSprzedazPuli(id, korektaId, k, zapis, 1, rewizje())
  expect(await baza.tabela('operacjeKas').count()).toBe(3)
  await expect(skorygujSprzedazPuli(id, korektaId, { ...k, zmianaCenyGrosze: 300, rozliczonoGrosze: 300 }, zapis, 1, rewizje())).rejects.toThrow()
})
it('koryguje błędną partię, następnie zwraca towar do właściwej partii', async () => {
  const wartosci = dane(), id = await sprzedaj(wartosci)
  await skorygujSprzedazPuli(id, noweId(), korekta(wartosci.pozycje[0].id, { rodzaj: 'pomylka_partii', partiaDocelowaId: partie[1] }), polecenie(1), 1, rewizje())
  expect((await pobierzSprzedazePuli(pulaId)).wynik?.zapas.partie.map((partia) => partia.liczbaSztuk)).toEqual([3, 0])
  await skorygujSprzedazPuli(id, noweId(), korekta(wartosci.pozycje[0].id), polecenie(2), 1, rewizje())
  expect((await pobierzSprzedazePuli(pulaId)).wynik?.zapas.partie.map((partia) => partia.liczbaSztuk)).toEqual([3, 1])
  await skorygujSprzedazPuli(id, noweId(), korekta(wartosci.pozycje[0].id, { rodzaj: 'pomylka_partii', partiaDocelowaId: partie[0] }), polecenie(3), 1, rewizje())
  expect((await pobierzSprzedazePuli(pulaId)).wynik?.zapas.partie.map((partia) => partia.liczbaSztuk)).toEqual([1, 3])
})

it('obniżka ceny i pełny zwrot wymagają rzeczywistego oddania pieniędzy, a awaria wycofuje korektę', async () => {
  const wartosci = dane(), id = await sprzedaj(wartosci), k = korekta(wartosci.pozycje[0].id, { rodzaj: 'cena', zmianaCenyGrosze: -200, rozliczonoGrosze: -200 })
  const tabela = baza.tabela('historiaZmian'), dodaj = tabela.add.bind(tabela); let licznik = 0
  vi.spyOn(tabela, 'add').mockImplementation((...argumenty) => { if (++licznik === 2) throw new Error('Awaria korekty'); return dodaj(...argumenty) })
  await expect(skorygujSprzedazPuli(id, noweId(), k, polecenie(1), 1, rewizje())).rejects.toThrow('Awaria korekty')
  expect((await baza.tabela('sprzedazePul').get(id))?.korekty).toHaveLength(0); expect(await baza.tabela('operacjeKas').count()).toBe(2)
  vi.restoreAllMocks()
  await skorygujSprzedazPuli(id, noweId(), k, polecenie(1), 1, rewizje())
  await skorygujSprzedazPuli(id, noweId(), korekta(wartosci.pozycje[0].id, { liczbaSztuk: 3, zmianaCenyGrosze: -800, rozliczonoGrosze: -800 }), polecenie(2), 1, rewizje())
  const wynik = (await pobierzSprzedazePuli(pulaId)).wynik!
  expect(wynik.zapas.partie[0].liczbaSztuk).toBe(3); expect(wynik.marza.marzaGrosze).toBe(0)
  expect(await baza.tabela('zobowiazania').count()).toBe(0)
})
it('anuluje całą sprzedaż z rzeczywistym zwrotem i zachowuje fakty w backupie', async () => {
  const wartosci = dane(), id = await sprzedaj(wartosci)
  await skorygujSprzedazPuli(id, noweId(), korekta(wartosci.pozycje[0].id, { rodzaj: 'anulowanie', rozliczonoGrosze: -1000 }), polecenie(1), 1, rewizje())
  const przed = await pobierzSprzedazePuli(pulaId); expect(przed.wynik?.zapas.partie[0].liczbaSztuk).toBe(3)
  expect(przed.wynik?.marza.marzaGrosze).toBe(0)
  const kopia = await przygotujBackupDoPrzywracania(JSON.stringify(await utworzBackup())); await przywrocBackup(kopia)
  expect(await pobierzSprzedazePuli(pulaId)).toEqual(przed)
})
it('wycofuje sprzedaż, płatność i historię przy awarii oraz odmawia Edytorowi i obcemu profilowi', async () => {
  const historia = baza.tabela('historiaZmian'), przed = await historia.count()
  vi.spyOn(historia, 'add').mockRejectedValueOnce(new Error('Dysk'))
  await expect(sprzedaj()).rejects.toThrow('Dysk'); expect(await baza.tabela('sprzedazePul').count()).toBe(0); expect(await historia.count()).toBe(przed); expect(await baza.tabela('operacjeKas').count()).toBe(1)
  vi.restoreAllMocks(); ustawBiezacyDostep((modul) => modul !== 'ustawienia'); await expect(sprzedaj()).rejects.toThrow()
  ustawBiezacyDostep(() => true); const pierwsza = baza, druga = new BazaOgarniacza('test-fz5-obcy-' + noweId())
  try { ustawBazePrzedUruchomieniem(druga); await druga.open(); await expect(sprzedaj()).rejects.toThrow(); expect(await druga.tabela('sprzedazePul').count()).toBe(0) } finally { await druga.delete(); ustawBazePrzedUruchomieniem(pierwsza) }
})
