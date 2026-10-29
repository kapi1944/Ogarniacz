import { afterEach, beforeEach, expect, it } from 'vitest'
import { baza, BazaOgarniacza, ustawBazePrzedUruchomieniem } from '../data/BazaOgarniacza'
import { ustawBiezacyDostep } from './UprawnieniaService'
import { utworzMetadane } from '../domain/fabryki'
import { utworzRozliczenie, dodajWydatekGrupowy, dodajZwrot, zarejestrujZwrot, pobierzWidokRozliczenia, edytujWydatekGrupowy, usunWydatekGrupowy, przywrocWydatekGrupowy, zmienEtapRozliczenia, archiwizujRozliczenie, przywrocRozliczenie, dodajUczestnika, edytujNazweUczestnika, wylaczUczestnika, listaPodsumowanRozliczen } from './RozliczeniaService'

const polecenie = (oczekiwanaRewizja = 0) => ({ idZapisu: crypto.randomUUID(), oczekiwanaRewizja })
const grupa = { nazwa: 'Wyjazd', opis: '', waluta: 'PLN', dataRozpoczecia: '2026-10-29', etap: 'aktywne' as const, domyslnyPodzial: 'po_rowno' as const, uczestnicy: [{ id: 'a', nazwa: 'Kacper' }, { id: 'b', nazwa: 'Julka' }] }
const wydatek = (kwotaGrosze = 20000) => ({ rozliczenieId: 'r', nazwa: 'Hotel', opis: '', waluta: 'PLN', dataOperacji: '2026-10-29', kwotaGrosze, finansujacy: [{ uczestnikId: 'a', kwotaGrosze }], parametryPodzialu: { metoda: 'po_rowno' as const, uczestnicyIds: ['a', 'b'] } })
const zwrot = (kwotaGrosze = 10000) => ({ rozliczenieId: 'r', odUczestnikaId: 'b', doUczestnikaId: 'a', kwotaGrosze, waluta: 'PLN', dataOperacji: '2026-10-29', opis: 'Wykonany przelew' })
const pozostalo = async () => (await pobierzWidokRozliczenia('r')).bilans!.bilanse.find((osoba) => osoba.uczestnikId === 'b')!.doOddaniaGrosze
beforeEach(async () => {
  localStorage.clear(); ustawBiezacyDostep(() => true)
  ustawBazePrzedUruchomieniem(new BazaOgarniacza('test-f78-' + crypto.randomUUID())); await baza.open()
  await utworzRozliczenie('r', grupa, polecenie())
})
afterEach(async () => { ustawBiezacyDostep(); await baza.delete() })

it('pusta aktywna grupa i zerowy bilans nie oznaczają automatycznie zakończenia', async () => {
  expect((await pobierzWidokRozliczenia('r')).status).toBe('Aktywne')
  await zmienEtapRozliczenia('r', 'oczekuje', polecenie(1))
  expect((await pobierzWidokRozliczenia('r')).status).toBe('Rozliczone')
  await zmienEtapRozliczenia('r', 'aktywne', polecenie(2))
  expect((await listaPodsumowanRozliczen())[0].statusWyliczony).toBe('Aktywne')
})
it.each([10000, 6000])('rejestruje zwrot %i bez zmiany sumy wydatków', async (kwota) => {
  await dodajWydatekGrupowy('w', wydatek(), polecenie())
  await zarejestrujZwrot('z', zwrot(kwota), polecenie(), false)
  const widok = await pobierzWidokRozliczenia('r')
  expect(widok.bilansPrzedZwrotami!.bilanse[0].doOtrzymaniaGrosze).toBe(10000)
  expect(widok.bilans!.sumaWydatkowGrosze).toBe(20000)
  expect(await pozostalo()).toBe(10000 - kwota)
})
it('kilka częściowych spłat zamyka dług i status, a wznowienie wydatków przywraca aktywność', async () => {
  await dodajWydatekGrupowy('w', wydatek(), polecenie())
  await zmienEtapRozliczenia('r', 'oczekuje', polecenie(1))
  await zarejestrujZwrot('z1', zwrot(6000), polecenie(), false)
  expect((await pobierzWidokRozliczenia('r')).status).toBe('Oczekuje na rozliczenie')
  expect(await pozostalo()).toBe(4000)
  await zarejestrujZwrot('z2', zwrot(4000), polecenie(), false)
  expect((await pobierzWidokRozliczenia('r')).bilans!.propozycjePrzelewow).toEqual([])
  expect((await pobierzWidokRozliczenia('r')).status).toBe('Rozliczone')
  await zmienEtapRozliczenia('r', 'aktywne', polecenie(2))
  expect((await pobierzWidokRozliczenia('r')).status).toBe('Aktywne')
})
it('nadpłata 120 na dług 100 wymaga potwierdzenia i odwraca należność na 20', async () => {
  await dodajWydatekGrupowy('w', wydatek(), polecenie())
  const zapis = polecenie()
  await expect(zarejestrujZwrot('z', zwrot(12000), zapis, false)).rejects.toThrow('Potwierdź')
  expect(await baza.tabela('zwrotyRozliczen').count()).toBe(0)
  await zarejestrujZwrot('z', zwrot(12000), zapis, true)
  expect((await pobierzWidokRozliczenia('r')).bilans!.propozycjePrzelewow).toEqual([{ odUczestnikaId: 'a', doUczestnikaId: 'b', kwotaGrosze: 2000 }])
})
it('zwrot w przeciwnym kierunku jest rzeczywistym zdarzeniem wymagającym potwierdzenia', async () => {
  await dodajWydatekGrupowy('w', wydatek(), polecenie())
  const dane = { ...zwrot(2000), odUczestnikaId: 'a', doUczestnikaId: 'b' }
  await expect(zarejestrujZwrot('z', dane, polecenie(), false)).rejects.toThrow('Potwierdź')
  await zarejestrujZwrot('z', dane, polecenie(), true)
  expect(await pozostalo()).toBe(12000)
})
it('ponowienie i równoczesne dwukrotne kliknięcie nie tworzą drugiego zwrotu', async () => {
  await dodajWydatekGrupowy('w', wydatek(), polecenie())
  const zapis = polecenie()
  await Promise.all([zarejestrujZwrot('z', zwrot(), zapis, false), zarejestrujZwrot('z', zwrot(), zapis, false)])
  expect(await baza.tabela('zwrotyRozliczen').count()).toBe(1)
  expect((await baza.tabela('zwrotyRozliczen').get('z'))?.historiaWersji).toHaveLength(1)
})
it('sprawdza zmieniony bilans atomowo zamiast ufać podglądowi otwartego formularza', async () => {
  await dodajWydatekGrupowy('w', wydatek(), polecenie())
  await zarejestrujZwrot('z1', zwrot(6000), polecenie(), false)
  await expect(zarejestrujZwrot('z2', zwrot(6000), polecenie(), false)).rejects.toThrow('Potwierdź')
  expect(await pozostalo()).toBe(4000)
})
it('edycja, usunięcie i przywrócenie wydatku przeliczają bilans, zachowując rzeczywisty zwrot', async () => {
  await dodajWydatekGrupowy('w', wydatek(), polecenie())
  await dodajZwrot('z', zwrot(6000), polecenie())
  await edytujWydatekGrupowy('w', wydatek(16000), polecenie(1))
  expect(await pozostalo()).toBe(2000)
  await usunWydatekGrupowy('w', polecenie(2))
  expect((await pobierzWidokRozliczenia('r')).bilans!.propozycjePrzelewow).toEqual([{ odUczestnikaId: 'a', doUczestnikaId: 'b', kwotaGrosze: 6000 }])
  await przywrocWydatekGrupowy('w', polecenie(3))
  expect(await pozostalo()).toBe(2000)
  expect((await baza.tabela('wydatkiGrupowe').get('w'))?.historiaWersji?.map(({ operacja }) => operacja)).toEqual(['utworzenie', 'aktualizacja', 'usuniecie', 'przywrocenie'])
  expect(await baza.tabela('zwrotyRozliczen').count()).toBe(1)
})
it('archiwum blokuje wszystkie zwykłe zapisy, zachowuje dane i przywraca poprzedni etap', async () => {
  await dodajWydatekGrupowy('w', wydatek(), polecenie())
  await dodajZwrot('z', zwrot(6000), polecenie())
  await zmienEtapRozliczenia('r', 'oczekuje', polecenie(1))
  await archiwizujRozliczenie('r', polecenie(2))
  expect((await pobierzWidokRozliczenia('r')).status).toBe('Zarchiwizowane')
  for (const wykonaj of [
    () => dodajWydatekGrupowy('x', wydatek(), polecenie()), () => zarejestrujZwrot('x', zwrot(), polecenie(), true),
    () => edytujWydatekGrupowy('w', wydatek(12000), polecenie(1)), () => usunWydatekGrupowy('w', polecenie(1)),
    () => dodajUczestnika('r', { id: 'c', nazwa: 'Ala' }, polecenie(3)), () => edytujNazweUczestnika('r', 'a', 'Nowa', polecenie(3)),
    () => wylaczUczestnika('r', 'a', polecenie(3)), () => zmienEtapRozliczenia('r', 'aktywne', polecenie(3)),
  ]) await expect(wykonaj()).rejects.toThrow('zarchiwizowane')
  await przywrocRozliczenie('r', polecenie(3))
  const widok = await pobierzWidokRozliczenia('r')
  expect(widok.status).toBe('Oczekuje na rozliczenie')
  expect(widok.rozliczenie.historiaWersji).toHaveLength(4)
  expect(widok.wydatki).toHaveLength(1); expect(widok.zwroty).toHaveLength(1)
})
it('nie oznacza niekompletnych danych jako rozliczonych', async () => {
  await zmienEtapRozliczenia('r', 'oczekuje', polecenie(1))
  await baza.tabela('stanSynchronizacji').put({ ...utworzMetadane('glowny'), stan: 'blad', liczbaOczekujacych: 0, liczbaKonfliktow: 0, finanseWspolneNiekompletne: true })
  const widok = await pobierzWidokRozliczenia('r')
  expect(widok.bilans).toBeUndefined()
  expect(widok.status).toBe('Oczekuje na rozliczenie')
})
it('nie udostępnia spłat, statusu ani archiwizacji Edytorowi', async () => {
  ustawBiezacyDostep((modul) => modul === 'finanse')
  await expect(zarejestrujZwrot('z', zwrot(), polecenie(), true)).rejects.toThrow('Brak dostępu')
  await expect(zmienEtapRozliczenia('r', 'oczekuje', polecenie(1))).rejects.toThrow('Brak dostępu')
  await expect(archiwizujRozliczenie('r', polecenie(1))).rejects.toThrow('Brak dostępu')
  await expect(przywrocRozliczenie('r', polecenie(1))).rejects.toThrow('Brak dostępu')
})
