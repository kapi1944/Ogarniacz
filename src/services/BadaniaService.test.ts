import Dexie from 'dexie'
// @ts-expect-error Natywny Blob z Node pozwala sprawdzić transport treści pliku.
import { Blob as BlobWezla } from 'node:buffer'
// @ts-expect-error Natywne Web Crypto jest używane tylko w testach.
import { webcrypto as kryptografiaWezla } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze, WERSJA_SCHEMATU_BAZY } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { pobierzKolejkeSynchronizacji } from '../data/KolejkaSynchronizacji'
import type { ZmianaSynchronizacji } from '../data/DostawcaSynchronizacji'
import { utworzMetadane } from '../domain/fabryki'
import { odczytajWartoscBadania, type WynikBadania } from '../domain/badania'
import type { Dokument, Wizyta } from '../domain/typy'
import { czyDozwolone } from './UprawnieniaService'
import { dokumentyWizyty, usunWynikBadania, uzgodnijRelacjeDokumentow, zapiszDokumentMedyczny, zapiszWynikBadania, zapiszWizyteZDokumentami } from './BadaniaService'
import { obliczChecksum, odszyfrujBackup, przygotujBackupDoPrzywracania, przywrocBackup, szyfrujBackup, utworzBackup } from './BackupService'
import { nazwyTabelSynchronizowanych, SyncEngine } from './SyncEngine'

const dostep = () => true
function dokument(id = 'dokument'): Dokument { return { ...utworzMetadane(id), nazwa: 'Identyczna nazwa', powiazania: [] } }
function wizyta(id = 'wizyta'): Wizyta { return { ...utworzMetadane(id), nazwa: 'Wizyta', status: 'umowiona', notatka: '', pytania: [], checklista: [], dokumentyIds: [] } }
function wynik(id = 'wynik', oryginalnyWynik = '5,2'): WynikBadania {
  return { ...utworzMetadane(id), parametr: 'Parametr prywatny', dataPobrania: '2026-10-11', oryginalnyWynik, kwalifikator: 'rowne', dokumentId: 'dokument' }
}

describe.sequential('Badania i dokumenty medyczne', () => {
  beforeEach(async () => { baza.close(); await Dexie.delete('ogarniacz-v1'); await inicjalizujBaze(); await baza.tabela('dokumenty').put(dokument()); await baza.tabela('kolejkaSynchronizacji').clear() })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it.each([
    ['5,2', 'rowne', 5.2, undefined], ['0', 'rowne', 0, undefined], ['< 5', 'mniejsze', 5, undefined], ['> 100', 'wieksze', 100, undefined],
    ['ujemny', 'tekst', undefined, 'ujemny'], ['dodatni', 'tekst', undefined, 'dodatni'], ['nie wykryto', 'tekst', undefined, 'nie wykryto'],
  ])('zapisuje oryginalny wynik %s i jawny kwalifikator bez domyślnej jednostki lub zakresu', async (zapis, kwalifikator, liczba, tekst) => {
    await zapiszWynikBadania(wynik('wynik', zapis as string), dostep, dostep)
    const zapisany = (await baza.tabela('wynikiBadan').get('wynik'))!
    expect(zapisany).toMatchObject({ oryginalnyWynik: zapis, kwalifikator, dokumentId: 'dokument' })
    expect(zapisany.wartoscLiczbowa).toBe(liczba); expect(zapisany.wartoscTekstowa).toBe(tekst)
    expect(zapisany.jednostka).toBeUndefined(); expect(zapisany.zakresReferencyjny).toBeUndefined()
    expect((await pobierzKolejkeSynchronizacji()).map((zmiana) => zmiana.tabela)).toEqual(['dokumenty'])
    expect(await baza.tabela('historiaZmian').count()).toBe(0)
  })

  it('nie konwertuje jednostek ani nie odczytuje liczb z tekstu', async () => {
    expect(odczytajWartoscBadania('5 mg')).toEqual({ kwalifikator: 'tekst', wartoscTekstowa: '5 mg' })
    await zapiszWynikBadania({ ...wynik(), jednostka: 'mg/dl', zakresReferencyjny: 'wg źródła', metoda: 'Metoda źródłowa' }, dostep, dostep)
    expect(await baza.tabela('wynikiBadan').get('wynik')).toMatchObject({ wartoscLiczbowa: 5.2, jednostka: 'mg/dl', zakresReferencyjny: 'wg źródła', metoda: 'Metoda źródłowa' })
  })

  it('waliduje daty, źródła i prawa dostępu; repozytorium także chroni odczyt i zapis', async () => {
    for (const bledny of [{ ...wynik(), dataPobrania: '2026-02-30' }, { ...wynik(), oryginalnyWynik: ' ' }, { ...wynik(), dokumentId: 'brak' }]) await expect(zapiszWynikBadania(bledny, dostep, dostep)).rejects.toThrow()
    await expect(zapiszWynikBadania(wynik(), () => false, dostep)).rejects.toThrow('uprawnienia')
    await expect(zapiszWynikBadania(wynik(), dostep, () => false)).rejects.toThrow('uprawnienia')
    const prawa = (operacja: 'odczyt' | 'edycja') => czyDozwolone('edytor', [], 'zdrowie', operacja, 'edytor', 'badania')
    await expect(zapiszWynikBadania(wynik(), prawa, dostep)).rejects.toThrow('uprawnienia')
    await zapiszWynikBadania(wynik(), dostep, dostep)
    const prywatny = (await baza.tabela('wynikiBadan').get('wynik'))!
    const bezPraw = pobierzRepozytorium('wynikiBadan')
    expect(await bezPraw.lista()).toEqual([]); expect(await bezPraw.pobierz('wynik')).toBeUndefined()
    await expect(bezPraw.zapisz(prywatny)).rejects.toThrow('uprawnienia')
    await expect(bezPraw.usun('wynik')).rejects.toThrow('uprawnienia')
    await expect(bezPraw.zapiszWiele([prywatny])).rejects.toThrow('uprawnienia')
    await expect(bezPraw.przywroc('wynik')).rejects.toThrow('uprawnienia')
    expect(await pobierzRepozytorium('wynikiBadan', dostep).lista()).toHaveLength(1)
    const tylkoOdczyt = (operacja: 'odczyt' | 'edycja') => operacja === 'odczyt'
    expect(await pobierzRepozytorium('wynikiBadan', tylkoOdczyt).lista()).toHaveLength(1)
    await expect(zapiszWynikBadania(prywatny, tylkoOdczyt, dostep)).rejects.toThrow('uprawnienia')
    await expect(zapiszDokumentMedyczny({ ...dokument('nowy'), medyczne: { kategoria: 'wynik' } }, () => false)).rejects.toThrow('uprawnienia')
    await expect(uzgodnijRelacjeDokumentow(() => false)).rejects.toThrow('uprawnień')
  })

  it('edytuje, odrzuca spóźnioną edycję i usuwa miękko po usunięciu źródła', async () => {
    await zapiszWynikBadania(wynik(), dostep, dostep)
    const poprzedni = (await baza.tabela('wynikiBadan').get('wynik'))!
    await pobierzRepozytorium('dokumenty').usun('dokument')
    await zapiszWynikBadania({ ...poprzedni, oryginalnyWynik: 'ujemny' }, dostep, dostep)
    await expect(zapiszWynikBadania(poprzedni, dostep, dostep)).rejects.toThrow('uległ zmianie')
    expect(await baza.tabela('wynikiBadan').get('wynik')).toMatchObject({ dokumentId: 'dokument', wartoscTekstowa: 'ujemny' })
    await expect(usunWynikBadania('wynik', () => false)).rejects.toThrow('uprawnienia')
    await usunWynikBadania('wynik', dostep)
    expect(await pobierzRepozytorium('wynikiBadan', dostep).lista()).toEqual([])
    expect((await baza.tabela('wynikiBadan').get('wynik'))?.usunietoAt).toBeTruthy()
    await expect(zapiszWynikBadania(wynik('nowy'), dostep, dostep)).rejects.toThrow('niedostępne')
  })

  it('grupuje parametry jednym ID i dokumentem, odrzucając sprzeczną grupę', async () => {
    const grupa = { grupaId: 'grupa', nazwaGrupy: 'Morfologia krwi' }
    await zapiszWynikBadania({ ...wynik('hemoglobina'), ...grupa, parametr: 'Hemoglobina' }, dostep, dostep)
    await zapiszWynikBadania({ ...wynik('leukocyty'), ...grupa, parametr: 'Leukocyty' }, dostep, dostep)
    await baza.tabela('dokumenty').put(dokument('drugi'))
    await expect(zapiszWynikBadania({ ...wynik('plytki'), ...grupa, dokumentId: 'drugi' }, dostep, dostep)).rejects.toThrow('wspólną')
    expect(await baza.tabela('wynikiBadan').count()).toBe(2)
    expect(await baza.tabela('dokumenty').count()).toBe(2)
  })

  it('uzgadnia sumę dawnych relacji po ID, zachowuje nieznane, pomija duplikaty i jest idempotentne', async () => {
    const pierwszy = { ...dokument('pierwszy'), powiazania: [{ typ: 'projekty' as const, id: 'nieznany' }] }
    const drugi = { ...dokument('drugi'), powiazania: [{ typ: 'wizyty' as const, id: 'wizyta' }, { typ: 'wizyty' as const, id: 'wizyta' }, { typ: 'wizyty' as const, id: 'brak' }] }
    const dawny = { ...wizyta(), dokumentyIds: ['pierwszy', 'pierwszy', 'nieznany-dokument'] }
    await baza.tabela('dokumenty').bulkPut([pierwszy, drugi]); await baza.tabela('wizyty').put(dawny)
    expect(dokumentyWizyty(dawny, [pierwszy, drugi])).toEqual(['pierwszy', 'nieznany-dokument', 'drugi'])
    await uzgodnijRelacjeDokumentow(dostep)
    const po = { dokumenty: await baza.tabela('dokumenty').toArray(), wizyty: await baza.tabela('wizyty').toArray(), kolejka: await baza.tabela('kolejkaSynchronizacji').toArray(), historia: await baza.tabela('historiaZmian').toArray() }
    expect(po.wizyty[0].dokumentyIds).toEqual(['pierwszy', 'nieznany-dokument', 'drugi'])
    expect(po.dokumenty.find((element) => element.id === 'pierwszy')?.powiazania).toContainEqual({ typ: 'projekty', id: 'nieznany' })
    expect(po.dokumenty.find((element) => element.id === 'drugi')?.powiazania).toEqual([{ typ: 'wizyty', id: 'wizyta' }, { typ: 'wizyty', id: 'brak' }])
    await uzgodnijRelacjeDokumentow(dostep)
    expect({ dokumenty: await baza.tabela('dokumenty').toArray(), wizyty: await baza.tabela('wizyty').toArray(), kolejka: await baza.tabela('kolejkaSynchronizacji').toArray(), historia: await baza.tabela('historiaZmian').toArray() }).toEqual(po)
  })

  it('zapisuje metadane i relację po ID przy identycznych nazwach, bez kopiowania dokumentu', async () => {
    await baza.tabela('dokumenty').put(dokument('drugi')); await baza.tabela('wizyty').put(wizyta())
    await zapiszDokumentMedyczny({ ...dokument('drugi'), updatedAt: (await baza.tabela('dokumenty').get('drugi'))!.updatedAt, medyczne: { kategoria: 'wynik', dataDokumentu: '2026-10-11', tagi: ['badanie'] }, powiazania: [{ typ: 'wizyty', id: 'wizyta' }] }, dostep)
    expect((await baza.tabela('wizyty').get('wizyta'))?.dokumentyIds).toEqual(['drugi'])
    expect((await baza.tabela('dokumenty').get('dokument'))?.powiazania).toEqual([])
    expect(await baza.tabela('dokumenty').count()).toBe(2)
    const aktualna = (await baza.tabela('wizyty').get('wizyta'))!
    await zapiszWizyteZDokumentami({ ...aktualna, dokumentyIds: [...aktualna.dokumentyIds, 'dokument'] }, dostep)
    expect((await baza.tabela('dokumenty').get('dokument'))?.powiazania).toContainEqual({ typ: 'wizyty', id: 'wizyta' })
    await expect(zapiszDokumentMedyczny({ ...dokument('nowy'), medyczne: { kategoria: 'wynik' }, powiazania: [{ typ: 'wizyty', id: 'brak' }] }, dostep)).rejects.toThrow('niedostępna')
    expect(await baza.tabela('dokumenty').get('nowy')).toBeUndefined()
  })

  it('rzeczywisty silnik nie wysyła wyników; odrzuca obcy pull i konflikt lokalnej tabeli', async () => {
    await zapiszWynikBadania(wynik(), dostep, dostep)
    expect(nazwyTabelSynchronizowanych).not.toContain('wynikiBadan')
    const wyslij = vi.fn(async () => {})
    const silnik = new SyncEngine({ czyOnline: () => true, installationId: () => 'test', opoznieniePonowieniaMs: 0 })
    await silnik.synchronizuj({ pobierzZmiany: async () => [], wyslijZmiany: wyslij })
    expect(JSON.stringify(wyslij.mock.calls)).not.toContain('Parametr prywatny')
    const lokalny = (await baza.tabela('wynikiBadan').get('wynik'))!
    const zdalny = { ...lokalny, oryginalnyWynik: '999', updatedAt: '2099-01-01T00:00:00.000Z' }
    const obca = { tabela: 'wynikiBadan', rekord: zdalny, installationId: 'inne' } as unknown as ZmianaSynchronizacji
    await expect(silnik.synchronizuj({ pobierzZmiany: async () => [obca], wyslijZmiany: wyslij })).rejects.toThrow('niepoprawną paczkę')
    expect(await baza.tabela('wynikiBadan').get('wynik')).toEqual(lokalny)
    await baza.tabela('konfliktySynchronizacji').put({ ...utworzMetadane('obcy'), tabela: 'wynikiBadan', rekordId: 'wynik', lokalny, zdalny, wykrytoAt: new Date().toISOString() })
    await expect(silnik.rozstrzygnijKonflikt('obcy', { typ: 'zdalny' })).rejects.toThrow('Tabela lokalna')
    expect(await baza.tabela('wynikiBadan').get('wynik')).toEqual(lokalny)
    expect(await pobierzKolejkeSynchronizacji()).not.toEqual(expect.arrayContaining([expect.objectContaining({ tabela: 'wynikiBadan' })]))
  })

  it('szyfrowany backup odtwarza ID, metadane, grupę i relacje; starszy backup nie usuwa wyników', async () => {
    vi.stubGlobal('crypto', kryptografiaWezla)
    vi.stubGlobal('Blob', BlobWezla)
    const stary = await utworzBackup(['zdrowie'])
    stary.manifest.dexieSchemaVersion = 17
    const { checksum: _checksum, ...manifest } = stary.manifest
    stary.manifest.checksum = await obliczChecksum({ manifest, payload: stary.payload })
    await baza.tabela('wizyty').put(wizyta())
    await zapiszDokumentMedyczny({ ...(await baza.tabela('dokumenty').get('dokument'))!, plik: new BlobWezla(['Źródłowy plik'], { type: 'text/plain' }), medyczne: { kategoria: 'wynik', opis: 'Metadane źródła' }, powiazania: [{ typ: 'wizyty', id: 'wizyta' }] }, dostep)
    await zapiszWynikBadania({ ...wynik(), grupaId: 'grupa', nazwaGrupy: 'Badanie', wizytaId: 'wizyta' }, dostep, dostep)
    const oryginal = (await baza.tabela('wynikiBadan').get('wynik'))!
    const kopia = await utworzBackup(['badania', 'dokumenty', 'wizyty'])
    const szyfrowana = await szyfrujBackup(kopia, 'Hasło testowe!')
    expect(JSON.stringify(szyfrowana)).not.toContain('Parametr prywatny')
    const odczytana = await przygotujBackupDoPrzywracania(await odszyfrujBackup(JSON.stringify(szyfrowana), 'Hasło testowe!'))
    await przywrocBackup(await przygotujBackupDoPrzywracania(JSON.stringify(stary)))
    expect(await baza.tabela('wynikiBadan').get('wynik')).toEqual(oryginal)
    await baza.tabela('wynikiBadan').clear(); await baza.tabela('dokumenty').clear()
    const przywrocenie = await przywrocBackup(odczytana)
    expect(przywrocenie.backupPrzedPrzywracaniem.manifest.sections).toContain('badania')
    expect(await baza.tabela('wynikiBadan').get('wynik')).toEqual(oryginal)
    expect((await baza.tabela('dokumenty').get('dokument'))?.medyczne?.opis).toBe('Metadane źródła')
    expect(await (await baza.tabela('dokumenty').get('dokument'))?.plik?.text()).toBe('Źródłowy plik')
    expect((await baza.tabela('wizyty').get('wizyta'))?.dokumentyIds).toEqual(['dokument'])
    expect((await baza.tabela('dokumenty').get('dokument'))?.powiazania).toContainEqual({ typ: 'wizyty', id: 'wizyta' })
  })

  it('rollback restore zachowuje wyniki i dokumenty po błędzie zapisu', async () => {
    await zapiszWynikBadania(wynik(), dostep, dostep)
    const kopia = await utworzBackup(['badania', 'dokumenty'])
    const poprzedni = (await baza.tabela('wynikiBadan').get('wynik'))!
    await zapiszWynikBadania({ ...poprzedni, oryginalnyWynik: 'dodatni' }, dostep, dostep)
    const przed = await baza.tabela('wynikiBadan').toArray()
    vi.spyOn(baza.tabela('dokumenty'), 'bulkPut').mockRejectedValueOnce(new Error('Błąd testowy zapisu'))
    await expect(przywrocBackup(kopia)).rejects.toThrow('Błąd testowy')
    expect(await baza.tabela('wynikiBadan').toArray()).toEqual(przed)
    expect(await baza.tabela('dokumenty').get('dokument')).toBeDefined()
  })

  it('migruje rzeczywistą bazę Dexie 17 do bieżącego schematu bez utraty dokumentów i relacji', async () => {
    const schemat = Object.fromEntries(baza.tables.filter((tabela) => !['wynikiBadan', 'wazneInformacjeZdrowotne'].includes(tabela.name)).map((tabela) => [tabela.name, [tabela.schema.primKey.src, ...tabela.schema.indexes.map((indeks) => indeks.src)].join(',')]))
    baza.close(); await Dexie.delete('ogarniacz-v1')
    const stara = new Dexie('ogarniacz-v1'); stara.version(17).stores(schemat)
    await stara.open(); await stara.table('dokumenty').put({ ...dokument(), powiazania: [{ typ: 'wizyty', id: 'wizyta' }] }); await stara.table('wizyty').put({ ...wizyta(), dokumentyIds: ['dokument'] }); stara.close()
    await baza.open()
    expect(baza.verno).toBe(WERSJA_SCHEMATU_BAZY)
    expect(await baza.tabela('wynikiBadan').count()).toBe(0)
    expect((await baza.tabela('wizyty').get('wizyta'))?.dokumentyIds).toEqual(['dokument'])
    expect((await baza.tabela('dokumenty').get('dokument'))?.powiazania).toEqual([{ typ: 'wizyty', id: 'wizyta' }])
  })
})
