// @ts-expect-error Natywny Blob jest potrzebny fake-indexeddb w środowisku testowym JSDOM.
import { Blob as BlobWezla } from 'node:buffer'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, BazaOgarniacza, ustawBazePrzedUruchomieniem } from '../data/BazaOgarniacza'
import { ustawBiezacyDostep } from './UprawnieniaService'
import { zapiszGrupeFinansowa, type PolecenieGrupyFinansowej } from './ZapisFinansowWspolnych'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { pobierzKolejkeSynchronizacji } from '../data/KolejkaSynchronizacji'
import { przygotujBackupDoPrzywracania, przywrocBackup, utworzBackup, obliczChecksum } from './BackupService'
import { alokujKoszt, kosztZakresu, obliczStanPartii, obliczZobowiazanie, obliczBilansGotowkowy, obliczKosztNieodzyskany, obliczSaldoZobowiazanOsoby, cenaJednostkowaZCalkowitej, cenaCalkowitaZJednostkowej } from '../../server/wspolne/ObliczeniaPul.ts'
import { TABELE_FZ, schematOsobyFinansowej, type Zobowiazanie, type OperacjaZobowiazania } from '../../server/wspolne/modelePulZobowiazan.ts'
import { obliczProjekcjePuli } from '../../server/wspolne/ProjekcjePul.ts'
import { TABELE_OBRAZU_FZ, type ObrazFz } from '../../server/wspolne/WalidacjaPulZobowiazan.ts'
import { SyncEngine } from './SyncEngine'
import { RepozytoriumZdalneInMemory } from '../data/RepozytoriumZdalneInMemory'
import { dodajOperacjeKasy, utworzKase } from './WspolneKasyService'
import { pobierzNajnowszaHistorie } from './HistoriaZmianService'
import { RejestrProfili, aktywujProfil, otworzBazeProfilu, zarejestrujProfilSesji, zamknijKontekstProfilu } from '../data/ProfileLokalne'
import { pobierzKonfiguracjeRuntime } from './RuntimeConfigService'
import type { KontoUzytkownika } from './KontaService'

const czas = '2026-11-03T10:00:00.000Z'
const noweId = () => crypto.randomUUID()
function osoba(nazwa = 'Osoba syntetyczna') { return { idOperacjiZrodlowej: noweId(), rolaZapisu: 'osoba', nazwa } }
function grupa(dane = osoba()): PolecenieGrupyFinansowej {
  const id = noweId()
  return { idZapisu: noweId(), idOperacjiZrodlowej: dane.idOperacjiZrodlowej, oczekiwaneRewizje: [{ tabela: 'osobyFinansowe', id, rewizja: 0 }], zapisy: [{ tabela: 'osobyFinansowe', id, operacja: 'utworzenie', dane }] }
}
function grupaSprzedazy(): PolecenieGrupyFinansowej {
  const [pulaId, zakupId, partiaId, sprzedazId, pozycjaId, osobaId, dlugId, zaplataId, wydatekId, idOperacjiZrodlowej] = Array.from({ length: 10 }, noweId)
  const metadane = { id: partiaId, createdAt: czas, updatedAt: czas }
  const zrodlo = { idOperacjiZrodlowej, rolaZapisu: '' }
  const zapisy: PolecenieGrupyFinansowej['zapisy'] = [
    { tabela: 'wspolneKasy', id: pulaId, operacja: 'utworzenie', dane: { nazwa: 'Pula testowa', opis: '', ikona: '', kolor: '', waluta: 'PLN', saldoPoczatkoweGrosze: 0, status: 'aktywna', pula: { wersja: 1, rodzaj: 'zakupowa' } } },
    { tabela: 'osobyFinansowe', id: osobaId, operacja: 'utworzenie', dane: { ...osoba(), ...zrodlo, rolaZapisu: 'osoba' } },
    { tabela: 'zakupyPul', id: zakupId, operacja: 'utworzenie', dane: { ...zrodlo, rolaZapisu: 'zakup', pulaId, nazwa: 'Towar', opis: '', dataZakupu: '2026-11-03', waluta: 'PLN', dokumentyIds: [], partie: [{ ...metadane, produktId: noweId(), nazwaProduktu: 'Produkt', liczbaSztuk: 10, kosztTowaruGrosze: 10000 }], kosztyDodatkowe: [{ ...metadane, id: noweId(), nazwa: 'Transport', kwotaGrosze: 2000, alokacja: [{ partiaId, kwotaGrosze: 2000 }] }], korekty: [] } },
    { tabela: 'sprzedazePul', id: sprzedazId, operacja: 'utworzenie', dane: { ...zrodlo, rolaZapisu: 'sprzedaz', pulaId, waluta: 'PLN', dataSprzedazy: '2026-11-03', kupujacyId: osobaId, opis: '', operacjaPierwszejZaplatyId: zaplataId, zobowiazanieId: dlugId, pozycje: [{ ...metadane, id: pozycjaId, zakupId, partiaId, liczbaSztuk: 3, cenaCalkowitaGrosze: 6000, zrodloCeny: 'calkowita', cenaJednostkowa: { licznikGroszy: 2000, mianownik: 1 } }], korekty: [] } },
    { tabela: 'zobowiazania', id: dlugId, operacja: 'utworzenie', dane: { ...Object.fromEntries(Object.entries(dlug()).filter(([klucz]) => !['id', 'createdAt', 'updatedAt', 'rewizja', 'historiaWersji'].includes(klucz))), ...zrodlo, rolaZapisu: 'dlug', osobaId, kwotaPoczatkowaGrosze: 4000, zrodlo: { rodzaj: 'sprzedaz_puli', id: sprzedazId, pulaId } } },
    ...[{ id: zaplataId, typ: 'wplyw', kwotaGrosze: 2000, rodzaj: 'zaplataSprzedazy', rolaZapisu: 'pierwsza_zaplata', sprzedazId }, { id: wydatekId, typ: 'wydatek', kwotaGrosze: 12000, rodzaj: 'zakup', rolaZapisu: 'zaplata_zakupu', zakupId }].map(({ id, typ, kwotaGrosze, rodzaj, rolaZapisu, ...relacja }) => ({ tabela: 'operacjeKas' as const, id, operacja: 'utworzenie' as const, dane: { kasaId: pulaId, typ, kwotaGrosze, waluta: 'PLN', dataOperacji: '2026-11-03', kategoria: '', zrodlo: '', opis: '', powiazaniePuli: { wersja: 1, idOperacjiZrodlowej, rodzaj, rolaZapisu, ...relacja } } })),
  ]
  return { idZapisu: noweId(), idOperacjiZrodlowej, zapisy, oczekiwaneRewizje: zapisy.map(({ tabela, id }) => ({ tabela, id, rewizja: 0 })) }
}
async function obraz(): Promise<ObrazFz> { return Object.fromEntries(await Promise.all(TABELE_OBRAZU_FZ.map(async (tabela) => [tabela, await baza.tabela(tabela).toArray()]))) as unknown as ObrazFz }
const dlug = (zmiany: Partial<Zobowiazanie> = {}): Zobowiazanie => ({ id: noweId(), createdAt: czas, updatedAt: czas, rewizja: 1, historiaWersji: [], osobaId: 'osoba', nazwa: 'Dług syntetyczny', kierunek: 'do_mnie', waluta: 'PLN', kwotaPoczatkowaGrosze: 10000, dataPowstania: '2026-11-03', opis: '', idOperacjiZrodlowej: noweId(), rolaZapisu: 'dlug', przypomnienia: { aktywne: false, przedTerminDni: [3], wDniuTerminu: true, poTerminieCoDni: 7, godzina: '10:00', strefaCzasowa: 'Europe/Warsaw' }, ...zmiany })
function operacja(zobowiazanieId: string, kwotaGrosze: number, rodzaj: OperacjaZobowiazania['rodzaj'] = 'splata'): OperacjaZobowiazania { return { id: noweId(), createdAt: czas, updatedAt: czas, rewizja: 1, historiaWersji: [], idOperacjiZrodlowej: noweId(), rolaZapisu: 'splata', zobowiazanieId, kwotaGrosze, rodzaj, waluta: 'PLN', dataOperacji: '2026-11-03', opis: '' } }
beforeEach(async () => { localStorage.clear(); ustawBiezacyDostep(() => true); ustawBazePrzedUruchomieniem(new BazaOgarniacza('test-fz-' + noweId())); await baza.open() })
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); ustawBiezacyDostep(); localStorage.clear(); await baza.delete() })

describe('FZ — migracja i chronione operacje', () => {
  it('migruje v20 i ponownie otwiera bazę bez zmiany F7, tombstone, historii i kolejki', async () => {
    const nazwa = 'test-migracja-fz-' + noweId()
    const schemat = Object.fromEntries(baza.tables.filter((tabela) => !(TABELE_FZ as readonly string[]).includes(tabela.name)).map((tabela) => [tabela.name, [tabela.schema.primKey.src, ...tabela.schema.indexes.map((indeks) => indeks.src)].join(', ')]))
    const stara = new Dexie(nazwa); stara.version(20).stores(schemat); await stara.open()
    const rekordy = { wspolneKasy: { id: 'stara', waluta: 'PLN', saldoPoczatkoweGrosze: 123, usunietoAt: czas, rewizja: 2, historiaWersji: [{ test: 'historia' }] }, historiaZmian: { id: 'h', encjaId: 'stara' }, kolejkaSynchronizacji: { id: 'q', tabela: 'wspolneKasy', rekordId: 'stara', rekord: { id: 'stara' } } }
    for (const [tabela, rekord] of Object.entries(rekordy)) await stara.table(tabela).put(rekord)
    stara.close()
    const nowa = new BazaOgarniacza(nazwa); await nowa.open(); expect(nowa.verno).toBe(21)
    for (const [tabela, rekord] of Object.entries(rekordy)) expect(await nowa.table(tabela).get(rekord.id)).toEqual(rekord)
    for (const tabela of TABELE_FZ) expect(await nowa.table(tabela).count()).toBe(0)
    nowa.close(); await nowa.open(); expect(await nowa.table('wspolneKasy').get('stara')).not.toHaveProperty('pula'); await nowa.delete()
  })
  it('zapisuje grupę raz, blokuje inne dane tego ID i nieaktualne rewizje', async () => {
    const polecenie = grupa(); await Promise.all([zapiszGrupeFinansowa(polecenie), zapiszGrupeFinansowa(polecenie)])
    expect(await baza.tabela('osobyFinansowe').count()).toBe(1); expect(await baza.tabela('historiaZmian').count()).toBe(1)
    expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(1); expect(await pobierzKolejkeSynchronizacji()).toEqual([])
    const inne = structuredClone(polecenie); inne.zapisy[0].dane.nazwa = 'Inna'; await expect(zapiszGrupeFinansowa(inne)).rejects.toThrow('identyfikator')
    const nieaktualne = { ...polecenie, idZapisu: noweId() }; await expect(zapiszGrupeFinansowa(nieaktualne)).rejects.toThrow('rewizja')
  })
  it('wycofuje całą grupę przy błędzie ostatniej historii lub outboxu', async () => {
    const polecenie = grupa(), drugie = grupa(); polecenie.zapisy.push(...drugie.zapisy); polecenie.oczekiwaneRewizje.push(...drugie.oczekiwaneRewizje)
    polecenie.zapisy[1].dane.idOperacjiZrodlowej = polecenie.idOperacjiZrodlowej; polecenie.zapisy[1].dane.rolaZapisu = 'druga_osoba'
    for (const tabela of ['historiaZmian', 'kolejkaSynchronizacji'] as const) {
      const repozytorium = baza.tabela(tabela), dodaj = repozytorium.add.bind(repozytorium)
      let licznik = 0
      vi.spyOn(repozytorium, 'add').mockImplementation((...argumenty) => { if (++licznik === 2) throw new Error('Usterka syntetyczna'); return dodaj(...argumenty) })
      await expect(zapiszGrupeFinansowa(polecenie)).rejects.toThrow('Usterka syntetyczna')
      expect(await baza.tabela('osobyFinansowe').count()).toBe(0); expect(await baza.tabela('historiaZmian').count()).toBe(0); expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(0)
      vi.restoreAllMocks()
    }
    await zapiszGrupeFinansowa(polecenie); expect(await baza.tabela('osobyFinansowe').count()).toBe(2)
  })
  it('odmawia Edytorowi zapisu, repozytorium, historii i eksportu', async () => {
    await zapiszGrupeFinansowa(grupa()); ustawBiezacyDostep((modul) => modul !== 'ustawienia')
    await expect(zapiszGrupeFinansowa(grupa())).rejects.toThrow('właściciela')
    expect(() => pobierzRepozytorium('osobyFinansowe')).toThrow('serwisu')
    await expect(utworzBackup(['puleZobowiazania'])).rejects.toThrow()
  })
  it('wykonuje pełny round-trip FZ i zachowuje dane przy starszej kopii', async () => {
    const stary = await utworzBackup(['wspolneKasy', 'dokumenty', 'ustawienia'])
    const polecenie = grupa(); await zapiszGrupeFinansowa(polecenie)
    const kopia = await przygotujBackupDoPrzywracania(JSON.stringify(await utworzBackup(['puleZobowiazania'])))
    expect(kopia.manifest.formatVersion).toBe(3)
    await przywrocBackup(stary); expect(await baza.tabela('osobyFinansowe').count()).toBe(1)
    await baza.tabela('osobyFinansowe').clear(); await baza.tabela('historiaZmian').clear(); await przywrocBackup(kopia)
    expect(await baza.tabela('osobyFinansowe').get(polecenie.zapisy[0].id)).toMatchObject({ nazwa: 'Osoba syntetyczna', rewizja: 1 })
    const brak = structuredClone(kopia); brak.payload.puleZobowiazania!.osobyFinansowe[0].historiaWersji = []
    const { checksum: _checksum, ...manifest } = brak.manifest; brak.manifest.checksum = await obliczChecksum({ manifest, payload: brak.payload })
    await expect(przygotujBackupDoPrzywracania(JSON.stringify(brak))).rejects.toThrow()
  })
  it('waliduje UUID, metadane i wymagane pola osoby', () => {
    expect(schematOsobyFinansowej.safeParse({ ...osoba(), id: 'obce', createdAt: czas, updatedAt: czas, rewizja: 1, historiaWersji: [] }).success).toBe(false)
  })
  it('atomowo zapisuje graf przykładu 120/60/20, liczy zapas, należność i marżę', async () => {
    const polecenie = grupaSprzedazy(); await zapiszGrupeFinansowa(polecenie)
    const pulaId = polecenie.zapisy[0].id
    expect(obliczProjekcjePuli(await obraz(), pulaId, '2026-11-03')).toMatchObject({ kompletne: true, wynik: { bilansGotowkowyGrosze: -10000, wartoscZapasuGrosze: 8400, kosztNieodzyskanyGrosze: 10000, marza: { marzaGrosze: 2400 }, naleznosci: { doOtrzymaniaGrosze: 4000 } } })
    const kopia = await przygotujBackupDoPrzywracania(JSON.stringify(await utworzBackup()))
    expect(kopia.payload.wspolneKasy!.wspolneKasy).toEqual([])
    expect(kopia.payload.puleZobowiazania!.wspolneKasy).toHaveLength(1)
    expect(kopia.payload.puleZobowiazania!.historiaZmian).toHaveLength(7)
    await expect(przywrocBackup(kopia)).resolves.toBeDefined()
    await expect(zapiszGrupeFinansowa(polecenie)).resolves.toBeUndefined()
    expect(await baza.tabela('sprzedazePul').count()).toBe(1)
    const zdalne = new RepozytoriumZdalneInMemory(), wyslij = vi.spyOn(zdalne, 'wyslijZmiany')
    await expect(new SyncEngine({ czyOnline: () => true }).synchronizuj(zdalne)).resolves.toBeDefined()
    expect(await baza.tabela('stanSynchronizacji').get('glowny')).toMatchObject({ stan: 'oczekuje' })
    expect(wyslij.mock.calls.flatMap((wywolanie) => wywolanie[0]).some((zmiana) => ['wspolneKasy', 'operacjeKas', ...TABELE_FZ].includes(zmiana.tabela))).toBe(false)
    expect(await baza.tabela('kolejkaSynchronizacji').where('tabela').equals('sprzedazePul').count()).toBe(1)
    await expect(dodajOperacjeKasy(noweId(), { kasaId: pulaId, typ: 'wplyw', kwotaGrosze: 1, waluta: 'PLN', dataOperacji: '2026-11-03', kategoria: '', zrodlo: '', opis: '' }, { idZapisu: noweId(), oczekiwanaRewizja: 0 })).rejects.toThrow('FZ')
  })
  it('odrzuca sprzedaż bez długu i całą nadmierną sprzedaż bez częściowego zapisu', async () => {
    const brakDlugu = grupaSprzedazy(); brakDlugu.zapisy = brakDlugu.zapisy.filter((zapis) => zapis.tabela !== 'zobowiazania')
    await expect(zapiszGrupeFinansowa(brakDlugu)).rejects.toThrow(); expect(await baza.tabela('wspolneKasy').count()).toBe(0)
    const zaDuzo = grupaSprzedazy(); (zaDuzo.zapisy.find((zapis) => zapis.tabela === 'zakupyPul')!.dane.partie as { liczbaSztuk: number }[])[0].liczbaSztuk = 2
    await expect(zapiszGrupeFinansowa(zaDuzo)).rejects.toThrow(); expect(await baza.tabela('sprzedazePul').count()).toBe(0)
  })
  it('koryguje stratę konkretnego zakresu bez obniżania historycznego kosztu nabycia', async () => {
    const polecenie = grupaSprzedazy(); await zapiszGrupeFinansowa(polecenie)
    const zakup = polecenie.zapisy.find((zapis) => zapis.tabela === 'zakupyPul')!, pulaId = polecenie.zapisy[0].id
    const partiaId = (zakup.dane.partie as { id: string }[])[0].id, idOperacjiZrodlowej = noweId()
    const korekta = { id: noweId(), createdAt: czas, updatedAt: czas, idOperacjiZrodlowej, rodzaj: 'rozbieznosc', dataOperacji: '2026-11-04', uzasadnienie: 'Uszkodzenie syntetyczne', pozycje: [{ partiaId, odSztuki: 9, zmianaSztuk: -1, zmianaKosztuGrosze: -1200 }], powiazaneOperacjeIds: [] }
    await zapiszGrupeFinansowa({ idZapisu: noweId(), idOperacjiZrodlowej, oczekiwaneRewizje: [{ tabela: 'zakupyPul', id: zakup.id, rewizja: 1 }, { tabela: 'wspolneKasy', id: pulaId, rewizja: 1 }], zapisy: [{ ...zakup, operacja: 'aktualizacja', dane: { ...zakup.dane, korekty: [korekta] } }] })
    expect(obliczProjekcjePuli(await obraz(), pulaId, '2026-11-04')).toMatchObject({ kompletne: true, wynik: { wartoscZapasuGrosze: 7200, koszty: { razemGrosze: 12000 }, zapas: { partie: [{ liczbaSztuk: 6, kosztStratGrosze: 1200, kosztSprzedanychGrosze: 3600 }] } } })
  })
  it('waliduje korektę ceny razem z długiem, a potem ich atomowe storno', async () => {
    const pierwotne = grupaSprzedazy(); await zapiszGrupeFinansowa(pierwotne)
    const sprzedaz = pierwotne.zapisy.find((zapis) => zapis.tabela === 'sprzedazePul')!, dlug = pierwotne.zapisy.find((zapis) => zapis.tabela === 'zobowiazania')!
    const pulaId = pierwotne.zapisy[0].id, partiaId = (sprzedaz.dane.pozycje as { partiaId: string }[])[0].partiaId
    const korekty: Record<string, unknown>[] = [], korektaDluguId = noweId()
    for (const cofnij of [false, true]) {
      const idOperacjiZrodlowej = noweId(), id = cofnij ? noweId() : korektaDluguId
      korekty.push({ id: noweId(), createdAt: czas, updatedAt: czas, idOperacjiZrodlowej, rodzaj: 'cena', dataOperacji: cofnij ? '2026-11-05' : '2026-11-04', uzasadnienie: 'Korekta testowa', pozycje: [{ partiaId, zmianaSztuk: 0, zmianaCenyGrosze: cofnij ? 1000 : -1000 }], powiazaneOperacjeIds: [id] })
      const daneOperacji = { ...Object.fromEntries(Object.entries(operacja(dlug.id, cofnij ? 0 : -1000, cofnij ? 'storno' : 'korekta_kwoty')).filter(([klucz]) => !['id', 'createdAt', 'updatedAt', 'rewizja', 'historiaWersji'].includes(klucz))), idOperacjiZrodlowej, rolaZapisu: cofnij ? 'storno' : 'korekta', pulaId, sprzedazId: sprzedaz.id, dataOperacji: cofnij ? '2026-11-05' : '2026-11-04', ...(cofnij ? { operacjaKorygowanaId: korektaDluguId } : {}) }
      const polecenie: PolecenieGrupyFinansowej = {
        idZapisu: noweId(), idOperacjiZrodlowej,
        oczekiwaneRewizje: [...pierwotne.oczekiwaneRewizje.filter((warunek) => warunek.tabela !== 'operacjeKas').map((warunek) => ({ ...warunek, rewizja: warunek.tabela === 'sprzedazePul' && cofnij ? 2 : 1 })), { tabela: 'operacjeZobowiazan', id, rewizja: 0 }],
        zapisy: [{ ...sprzedaz, operacja: 'aktualizacja', dane: { ...sprzedaz.dane, korekty: [...korekty] } }, { tabela: 'operacjeZobowiazan', id, operacja: 'utworzenie', dane: daneOperacji }],
      }
      await zapiszGrupeFinansowa(polecenie)
      expect(obliczProjekcjePuli(await obraz(), pulaId, '2026-11-05')).toMatchObject({ kompletne: true, wynik: { bilansGotowkowyGrosze: -10000, naleznosci: { doOtrzymaniaGrosze: cofnij ? 4000 : 3000 } } })
    }
  })
  it('przelicza kolejne spłaty i zwrot nadpłaty bez drugiej kopii gotówki', async () => {
    const polecenie = grupaSprzedazy(); await zapiszGrupeFinansowa(polecenie)
    const pulaId = polecenie.zapisy[0].id, dlugId = polecenie.zapisy.find((zapis) => zapis.tabela === 'zobowiazania')!.id
    for (const [kwotaGrosze, rodzaj, bilans, pozostalo] of [[3000, 'splata', -7000, 1000], [1500, 'splata', -5500, -500], [500, 'zwrot_nadplaty', -6000, 0]] as const) {
      const id = noweId(), idOperacjiZrodlowej = noweId()
      const dane = { ...Object.fromEntries(Object.entries(operacja(dlugId, kwotaGrosze, rodzaj)).filter(([klucz]) => !['id', 'createdAt', 'updatedAt', 'rewizja', 'historiaWersji'].includes(klucz))), idOperacjiZrodlowej, pulaId, sprzedazId: polecenie.zapisy.find((zapis) => zapis.tabela === 'sprzedazePul')!.id }
      await zapiszGrupeFinansowa({ idZapisu: noweId(), idOperacjiZrodlowej, oczekiwaneRewizje: [{ tabela: 'operacjeZobowiazan', id, rewizja: 0 }, { tabela: 'zobowiazania', id: dlugId, rewizja: 1 }, { tabela: 'wspolneKasy', id: pulaId, rewizja: 1 }], zapisy: [{ tabela: 'operacjeZobowiazan', id, operacja: 'utworzenie', dane }] })
      const stan = await obraz()
      expect(obliczProjekcjePuli(stan, pulaId, '2026-11-03')).toMatchObject({ kompletne: true, wynik: { bilansGotowkowyGrosze: bilans, marza: { marzaGrosze: 2400 } } })
      expect(obliczZobowiazanie(stan.zobowiazania[0], stan.operacjeZobowiazan, '2026-11-03').pozostaloGrosze).toBe(pozostalo)
    }
    expect(await baza.tabela('operacjeKas').count()).toBe(2)
  })
  it('wstrzymuje również stare operacje po jawnej aktywacji Puli, blokuje stary restore i zdalne nadpisanie', async () => {
    const id = noweId(), operacjaId = noweId()
    const dane = { nazwa: 'Stara kasa', opis: '', ikona: '', kolor: '', waluta: 'PLN', saldoPoczatkoweGrosze: 100, status: 'aktywna' as const }
    const stara = await utworzKase(id, dane, { idZapisu: noweId(), oczekiwanaRewizja: 0 })
    await dodajOperacjeKasy(operacjaId, { kasaId: id, typ: 'wplyw', kwotaGrosze: 100, waluta: 'PLN', dataOperacji: '2026-11-03', kategoria: '', zrodlo: '', opis: '' }, { idZapisu: noweId(), oczekiwanaRewizja: 0 })
    const kopia = await utworzBackup(['wspolneKasy'])
    await zapiszGrupeFinansowa({ idZapisu: noweId(), idOperacjiZrodlowej: noweId(), oczekiwaneRewizje: [{ tabela: 'wspolneKasy', id, rewizja: 1 }], zapisy: [{ tabela: 'wspolneKasy', id, operacja: 'aktualizacja', dane: { ...dane, pula: { wersja: 1, rodzaj: 'finansowa' } } }] })
    expect(await pobierzKolejkeSynchronizacji()).toEqual([])
    await expect(przywrocBackup(kopia)).rejects.toThrow('koliduje')
    expect((await baza.tabela('wspolneKasy').get(id))?.pula).toBeDefined()
    const zdalne = Object.assign(new RepozytoriumZdalneInMemory(), { pobierzObslugiwaneTabeleFinansowe: () => ['wspolneKasy', 'operacjeKas', 'rozliczenia', 'wydatkiGrupowe', 'zwrotyRozliczen'] as const })
    await zdalne.wyslijZmiany([{ tabela: 'wspolneKasy', rekord: stara, installationId: 'inny' }])
    await expect(new SyncEngine({ czyOnline: () => true }).synchronizuj(zdalne)).resolves.toBeDefined()
    expect((await baza.tabela('wspolneKasy').get(id))?.pula).toBeDefined()
    expect(await baza.tabela('kolejkaSynchronizacji').where('rekordId').equals(operacjaId).count()).toBe(1)
  })
  it('zachowuje finansową i medyczną ochronę Blobu oraz pomija go w starszej sekcji', async () => {
    vi.stubGlobal('Blob', BlobWezla)
    const dokument = { id: noweId(), createdAt: czas, updatedAt: czas, nazwa: 'Paragon testowy', powiazania: [], finansowe: { wersja: 1 as const, tylkoWlasciciel: true as const }, sekcjePrywatnosci: ['dokumentacja' as const], plik: new Blob(['syntetyczny paragon'], { type: 'application/pdf' }) }
    await baza.tabela('dokumenty').put(dokument)
    const kopia = await przygotujBackupDoPrzywracania(JSON.stringify(await utworzBackup(['dokumenty', 'puleZobowiazania'])))
    expect(kopia.payload.dokumenty!.dokumenty).toEqual([])
    await przywrocBackup(kopia); expect((await baza.tabela('dokumenty').get(dokument.id))?.plik).toBeInstanceOf(Blob)
    await expect(pobierzRepozytorium('dokumenty').zapisz({ ...dokument, finansowe: undefined })).rejects.toThrow('ochrony finansowej')
    ustawBiezacyDostep((modul) => modul !== 'finanse')
    expect(await pobierzRepozytorium('dokumenty').pobierz(dokument.id)).toBeUndefined()
    await expect(utworzBackup(['puleZobowiazania'])).rejects.toThrow()
  })
  it('izoluje właścicieli, blokuje rzeczywistego Edytora i zmianę profilu w transakcji', async () => {
    const lokalna = baza, poprzedniAdres = pobierzKonfiguracjeRuntime().syncApiUrl
    pobierzKonfiguracjeRuntime().syncApiUrl = 'https://fz.example.test'
    const rejestr = new RejestrProfili('test-profile-fz-' + noweId())
    const konto = (id: string): KontoUzytkownika => ({ zalogowany: true, uzytkownikId: id, wlascicielId: id, email: id + '@example.test', rola: 'wlasciciel', granty: [], edytorzy: [] })
    const a = await zarejestrujProfilSesji('https://fz.example.test', konto('a'), rejestr), b = await zarejestrujProfilSesji('https://fz.example.test', konto('b'), rejestr)
    const edytor = await zarejestrujProfilSesji('https://fz.example.test', { ...konto('edytor'), wlascicielId: 'a', rola: 'edytor', granty: [{ id: 'grant', editorId: 'edytor', modul: 'finanse', odczyt: true, edycja: true, status: 'aktywne' }] }, rejestr)
    const bazy = await Promise.all([a, b, edytor].map(otworzBazeProfilu))
    try {
      ustawBazePrzedUruchomieniem(bazy[0]); await aktywujProfil(a, rejestr)
      const polecenie = grupa(); await zapiszGrupeFinansowa(polecenie); const kopia = await utworzBackup(['puleZobowiazania'])
      ustawBazePrzedUruchomieniem(bazy[1]); await aktywujProfil(b, rejestr)
      expect(await baza.tabela('osobyFinansowe').count()).toBe(0); await expect(przywrocBackup(kopia)).rejects.toThrow('Właściciela')
      await zapiszGrupeFinansowa(polecenie)
      ustawBazePrzedUruchomieniem(bazy[2]); await aktywujProfil(edytor, rejestr)
      await expect(zapiszGrupeFinansowa(grupa())).rejects.toThrow('właściciela'); expect(await pobierzNajnowszaHistorie()).toEqual([])
      ustawBazePrzedUruchomieniem(bazy[0]); await baza.open(); await aktywujProfil(a, rejestr)
      const przerwane = grupa()
      vi.spyOn(baza.tabela('historiaZmian'), 'add').mockImplementationOnce(() => { zamknijKontekstProfilu(bazy[0]); return Dexie.Promise.reject(new Error('Zmiana profilu')) })
      await expect(zapiszGrupeFinansowa(przerwane)).rejects.toThrow(); vi.restoreAllMocks(); await bazy[0].open()
      expect(await bazy[0].tabela('osobyFinansowe').get(przerwane.zapisy[0].id)).toBeUndefined()
    } finally { pobierzKonfiguracjeRuntime().syncApiUrl = poprzedniAdres; for (const testowa of bazy) await testowa.delete(); await rejestr.delete(); ustawBazePrzedUruchomieniem(lokalna) }
  })
})

describe('FZ — dokładne obliczenia', () => {
  it('zachowuje 3 sztuki za 10,00 i odrzuca ułamkowy grosz bez zaokrąglenia', () => {
    expect(cenaJednostkowaZCalkowitej(1000, 3)).toEqual({ licznikGroszy: 1000, mianownik: 3 })
    expect(cenaCalkowitaZJednostkowej('3,33', 3, 'PLN')).toBe(999)
    expect(cenaCalkowitaZJednostkowej('0.01', 1, 'PLN')).toBe(1)
    expect(() => cenaCalkowitaZJednostkowej('3,333333', 3, 'PLN')).toThrow('ułamkowy grosz')
  })
  it('alokuje 1000/3 jako 333,333,334 i kontroluje iloczyny BigInt', () => {
    expect([0, 1, 2].map((od) => kosztZakresu(1000, 3, od, 1))).toEqual([333, 333, 334])
    expect(kosztZakresu(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => kosztZakresu(1000.1, 3, 0, 1)).toThrow()
    const partie = [{ id: 'b', kosztTowaruGrosze: 0, liczbaSztuk: 1 }, { id: 'a', kosztTowaruGrosze: 0, liczbaSztuk: 1 }]
    expect(alokujKoszt(1, partie)).toEqual(alokujKoszt(1, [...partie].reverse())); expect(alokujKoszt(1, partie)[0]).toEqual({ partiaId: 'a', kwotaGrosze: 1 })
  })
  it('przywraca historyczny koszt zwrotu, ponownie wydaje i rozróżnia straty', () => {
    const wydanie = { id: 'a', data: '2026-11-03', rodzaj: 'wydanie' as const, liczbaSztuk: 3 }
    const zwrot = { id: 'b', data: '2026-11-03', rodzaj: 'zwrot' as const, liczbaSztuk: 1, zrodloId: 'a' }
    expect(obliczStanPartii(1000, 3, [zwrot, wydanie])).toMatchObject({ liczbaSztuk: 1, wartoscZapasuGrosze: 334, kosztSprzedanychGrosze: 666 })
    expect(obliczStanPartii(1000, 3, [wydanie, zwrot, { ...wydanie, id: 'c', liczbaSztuk: 1 }])).toMatchObject({ liczbaSztuk: 0, kosztSprzedanychGrosze: 1000 })
    expect(obliczStanPartii(1000, 3, [{ ...wydanie, rodzaj: 'strata', liczbaSztuk: 1 }])).toMatchObject({ wartoscZapasuGrosze: 667, kosztStratGrosze: 333 })
    expect(() => obliczStanPartii(1000, 3, [{ ...wydanie, liczbaSztuk: 4 }])).toThrow()
    expect(obliczStanPartii(2000, 3, [wydanie, zwrot])).toMatchObject({ wartoscZapasuGrosze: 667, kosztSprzedanychGrosze: 1333 })
    expect(obliczStanPartii(3000, 3, [])).toMatchObject({ wartoscZapasuGrosze: 3000, liczbaSztuk: 3 })
    expect(obliczStanPartii(1000, 3, [{ ...wydanie, rodzaj: 'zwrot_dostawcy', liczbaSztuk: 1 }])).toMatchObject({ wartoscZapasuGrosze: 667, kosztZwrotowDostawcyGrosze: 333 })
  })
  it('odróżnia gotówkę, umorzenie, nadpłatę i storno', () => {
    const zobowiazanie = dlug(), splata = operacja(zobowiazanie.id, 6000)
    expect(obliczZobowiazanie(zobowiazanie, [splata], '2026-11-03').pozostaloGrosze).toBe(4000)
    expect(obliczZobowiazanie(zobowiazanie, [splata, operacja(zobowiazanie.id, 4000, 'umorzenie')], '2026-11-03')).toMatchObject({ pozostaloGrosze: 0, zaplaconoGrosze: 6000, status: 'zamkniete_z_umorzeniem' })
    const nadplata = operacja(zobowiazanie.id, 12000)
    expect(obliczZobowiazanie(zobowiazanie, [nadplata], '2026-11-03').pozostaloGrosze).toBe(-2000)
    expect(obliczZobowiazanie(zobowiazanie, [nadplata, operacja(zobowiazanie.id, 2000, 'zwrot_nadplaty')], '2026-11-03').pozostaloGrosze).toBe(0)
    expect(obliczZobowiazanie(zobowiazanie, [splata, { ...operacja(zobowiazanie.id, 0, 'storno'), operacjaKorygowanaId: splata.id }], '2026-11-03').pozostaloGrosze).toBe(10000)
  })
  it('nie kompensuje niezależnych długów i walut', () => {
    const zobowiazania = [dlug(), dlug({ kierunek: 'ode_mnie' }), dlug({ waluta: 'EUR' })]
    const wynik = obliczSaldoZobowiazanOsoby('osoba', zobowiazania, [], '2026-11-03')
    expect(wynik.pozycje).toHaveLength(3); expect(wynik.sumy.find((suma) => suma.waluta === 'PLN')).toMatchObject({ doOtrzymaniaGrosze: 10000, doOddaniaGrosze: 10000, saldoGrosze: 0 })
    expect(() => obliczZobowiazanie(zobowiazania[0], [{ ...operacja(zobowiazania[0].id, 1), waluta: 'USD' }], '2026-11-03')).toThrow()
  })
  it('wpłata właściciela zwiększa gotówkę, zachowując koszt nieodzyskany', () => {
    const przeplywy = [{ id: 'zakup', waluta: 'PLN', kategoria: 'zakup' as const, kwotaGrosze: -12000 }, { id: 'sprzedaz', waluta: 'PLN', kategoria: 'sprzedaz' as const, kwotaGrosze: 2000 }, { id: 'wlasciciel', waluta: 'PLN', kategoria: 'finansowanie' as const, kwotaGrosze: 12000 }]
    expect(obliczBilansGotowkowy('PLN', 0, przeplywy)).toBe(2000); expect(obliczKosztNieodzyskany('PLN', przeplywy)).toBe(10000)
  })
})
