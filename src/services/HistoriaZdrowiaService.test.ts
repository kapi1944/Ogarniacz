import Dexie from 'dexie'
// @ts-expect-error Natywne Web Crypto jest używane wyłącznie w testach.
import { webcrypto as kryptografiaWezla } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze, WERSJA_SCHEMATU_BAZY } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { pobierzKolejkeSynchronizacji } from '../data/KolejkaSynchronizacji'
import { utworzMetadane } from '../domain/fabryki'
import { schematDatyZdrowia, TABELE_HISTORII_ZDROWIA, type WaznaInformacjaZdrowotna } from '../domain/historiaZdrowia'
import type { Lek, WpisTerapii } from '../domain/typy'
import type { ZmianaSynchronizacji } from '../data/DostawcaSynchronizacji'
import { dataChwiliZdrowia, filtrujOsZdrowia, odczytajZrodloZdrowia, pobierzDaneHistoriiZdrowia, stanZrodlaZdrowia, usunWaznaInformacje, utworzHtmlKartyZdrowotnej, wygenerujKartePoPodgladzie, wybierzSekcjeKarty, zbudujKarteZdrowotna, zbudujOsZdrowia, zapiszWaznaInformacje, type DaneHistoriiZdrowia, type DostepHistoriiZdrowia } from './HistoriaZdrowiaService'
import { obliczChecksum, odszyfrujBackup, przygotujBackupDoPrzywracania, przywrocBackup, szyfrujBackup, utworzBackup } from './BackupService'
import { nazwyTabelSynchronizowanych, SyncEngine } from './SyncEngine'
import { czyDozwolone } from './UprawnieniaService'

const STREFA = 'Europe/Warsaw'
const CZAS = new Date('2026-10-11T10:00:00.000Z')
const dostep: DostepHistoriiZdrowia = () => true
function pusteDane(): DaneHistoriiZdrowia { return { leki: [], dziennikLekow: [], wizyty: [], terapie: [], wpisyTerapii: [], wpisySamopoczucia: [], wynikiBadan: [], dokumenty: [], skierowania: [], recepty: [], kontakty: [], wazneInformacjeZdrowotne: [] } }
function informacja(id = 'wazna'): WaznaInformacjaZdrowotna { return { ...utworzMetadane(id), kategoria: 'alergia', tresc: 'Ważny fakt użytkownika', data: { dokladnosc: 'rok', od: '2020' }, statusPotwierdzenia: 'do_weryfikacji', ukryjTresc: false } }
function sesja(id: string, dataCzas: string): WpisTerapii { return { ...utworzMetadane(id), terapiaId: 'terapia', dataCzas, tresc: 'TAJNA TREŚĆ SESJI', tytul: 'TAJNY TYTUŁ', psychoterapia: { wypowiedzi: 'TAJNA WYPOWIEDŹ' } } }
function lek(id = 'lek'): Lek { return { ...utworzMetadane(id), nazwa: 'Lek źródłowy', aktywny: true, godziny: [], dawkaInstrukcja: 'Dawkowanie źródłowe' } }

describe.sequential('Osobista historia i ważne informacje zdrowotne', () => {
  beforeEach(async () => { baza.close(); await Dexie.delete('ogarniacz-v1'); await inicjalizujBaze(); await baza.tabela('kolejkaSynchronizacji').clear() })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('sortuje chwile według czasu absolutnego podczas cofnięcia zegara; wiele wydarzeń i duplikaty', () => {
    const dane = pusteDane()
    dane.wpisyTerapii = [sesja('wczesna', '2026-10-25T02:50:00+02:00'), sesja('pozna', '2026-10-25T02:10:00+01:00'), sesja('pozna', '2026-10-25T02:10:00+01:00')]
    dane.wizyty = [{ ...utworzMetadane('wizyta'), nazwa: 'Wizyta', status: 'odbyta', data: '2026-10-25', notatka: 'Prywatna notatka', pytania: [], checklista: [], dokumentyIds: [] }]
    const os = zbudujOsZdrowia(dane, dostep, STREFA)
    expect(os.map((zdarzenie) => zdarzenie.id)).toEqual(['wpisyTerapii:pozna', 'wpisyTerapii:wczesna', 'wizyty:wizyta'])
    expect(os[0].godzina).toBe('02:10'); expect(os[1].godzina).toBe('02:50'); expect(os[2].godzina).toBeUndefined()
    expect(dataChwiliZdrowia('2026-03-29T01:30:00Z', STREFA)?.godzina).toBe('03:30')
    expect(dataChwiliZdrowia('2026-10-11T23:30:00Z', STREFA)?.data).toEqual({ dokladnosc: 'dzien', od: '2026-10-12' })
    expect(dataChwiliZdrowia('2026-10-11T23:30:00Z', 'UTC')?.data).toEqual({ dokladnosc: 'dzien', od: '2026-10-11' })
    expect(dataChwiliZdrowia('2026-10-25T02:30:00', STREFA)).toBeUndefined()
  })

  it('zachowuje datę przybliżoną, nieznaną i okres; filtr obejmuje nakładające się okresy bez wymyślania godzin', () => {
    const dane = pusteDane()
    dane.wazneInformacjeZdrowotne = [informacja('rok'), { ...informacja('miesiac'), data: { dokladnosc: 'miesiac', od: '2020-05' } }, { ...informacja('okres'), data: { dokladnosc: 'okres', od: '2020-04-25', do: '2020-06-03' } }, { ...informacja('nieznana'), data: { dokladnosc: 'nieznana', opis: 'W dzieciństwie' } }]
    const os = zbudujOsZdrowia(dane, dostep, STREFA)
    expect(os.every((zdarzenie) => !zdarzenie.godzina && !zdarzenie.chwila)).toBe(true)
    expect(filtrujOsZdrowia(os, { okres: '2020-05-10' })).toHaveLength(3)
    expect(filtrujOsZdrowia(os, { okres: '2020' })).toHaveLength(3)
    expect(os.at(-1)?.data).toEqual({ dokladnosc: 'nieznana', opis: 'W dzieciństwie' })
    expect(schematDatyZdrowia.safeParse({ dokladnosc: 'okres', od: '2020-06-01', do: '2020-05-01' }).success).toBe(false)
    expect(schematDatyZdrowia.safeParse({ dokladnosc: 'miesiac', od: '2020-13' }).success).toBe(false)
  })

  it('nie ujawnia treści psychiatrycznych w projekcji, filtrze, karcie lub eksporcie; otwarcie jest osobną operacją', async () => {
    await baza.tabela('wpisyTerapii').put(sesja('sesja', CZAS.toISOString()))
    await zapiszWaznaInformacje({ ...informacja('plan'), kategoria: 'plan_wsparcia', ukryjTresc: true, tresc: 'PRYWATNY PLAN' }, dostep)
    const dane = await pobierzDaneHistoriiZdrowia(dostep)
    const os = zbudujOsZdrowia(dane, dostep, STREFA)
    expect(JSON.stringify(os)).not.toMatch(/TAJNA|TAJNY|PRYWATNY PLAN/)
    expect(filtrujOsZdrowia(os, { szukana: 'TAJNA' })).toEqual([])
    expect(filtrujOsZdrowia(os, { kategoria: 'terapia', rodzaj: 'Sesja terapeutyczna' })).toHaveLength(1)
    const karta = zbudujKarteZdrowotna(dane, dostep, CZAS, STREFA)
    expect(JSON.stringify(karta)).not.toContain('PRYWATNY PLAN')
    expect(utworzHtmlKartyZdrowotnej(karta)).not.toMatch(/TAJNA|PRYWATNY PLAN/)
    expect(await odczytajZrodloZdrowia({ tabela: 'wpisyTerapii', id: 'sesja' }, () => false)).toEqual({ stan: 'brak_uprawnien' })
    expect(await odczytajZrodloZdrowia({ tabela: 'wpisyTerapii', id: 'sesja' }, dostep)).toMatchObject({ stan: 'dostepne', rekord: { tresc: 'TAJNA TREŚĆ SESJI' } })
  })

  it('tworzy projekcję ze wszystkich istniejących rodzajów danych bez nowych zapisów wydarzeń', async () => {
    const dane = pusteDane()
    dane.leki = [{ ...lek(), dataOd: '2026-10-01' }]
    dane.dziennikLekow = [{ ...utworzMetadane('dawka'), lekId: 'lek', data: '2026-10-11', planowanaGodzina: '08:00', status: 'zazyte', reakcjaAt: '2026-10-11T09:00:00Z' }]
    dane.wizyty = [{ ...utworzMetadane('wizyta'), nazwa: 'Wizyta', status: 'odbyta', data: '2026-10-11', notatka: '', pytania: [], checklista: [], dokumentyIds: ['dokument'] }]
    dane.terapie = [{ ...utworzMetadane('terapia'), nazwa: 'Rehabilitacja', status: 'aktywna', dataRozpoczecia: '2026-10-01' }]
    dane.wpisyTerapii = [sesja('sesja', CZAS.toISOString())]
    dane.wpisySamopoczucia = [{ ...utworzMetadane('samopoczucie'), dataObserwacji: '2026-10-11', godzinaObserwacji: '12:00', czasObserwacji: CZAS.toISOString(), strefaCzasowa: STREFA, wskazniki: [], doOmowienia: true, notatka: 'Prywatne' }]
    dane.wynikiBadan = [{ ...utworzMetadane('wynik'), parametr: 'Parametr', dataPobrania: '2026-10-11', oryginalnyWynik: 'ujemny', wartoscTekstowa: 'ujemny', kwalifikator: 'tekst', dokumentId: 'dokument' }]
    dane.dokumenty = [{ ...utworzMetadane('dokument'), nazwa: 'Dokument', powiazania: [], medyczne: { kategoria: 'wynik', dataDokumentu: '2026-10-11' } }]
    dane.skierowania = [{ ...utworzMetadane('skierowanie'), nazwa: 'Skierowanie', dataWystawienia: '2026-10-01', typCelu: 'badanie', cel: 'Cel', status: 'nowe' }]
    dane.recepty = [{ ...utworzMetadane('recepta'), dataWystawienia: '2026-10-01', status: 'do_realizacji', pozycje: [] }]
    const os = zbudujOsZdrowia(dane, dostep, STREFA)
    expect(os).toHaveLength(10)
    expect(new Set(os.map((zdarzenie) => zdarzenie.zrodlo.tabela)).size).toBe(10)
    expect(os.find((zdarzenie) => zdarzenie.zrodlo.tabela === 'dziennikLekow')?.godzina).toBeUndefined()
    expect(await baza.tabela('wazneInformacjeZdrowotne').count()).toBe(0)
    expect(TABELE_HISTORII_ZDROWIA).not.toContain('historiaZmian')
  })

  it('pomija niepotwierdzone przyjęcia i wcześniejszy status tego samego wystąpienia', () => {
    const dane = pusteDane(); dane.leki = [lek()]
    const wpis = { ...utworzMetadane('starszy'), idWystapienia: 'wystapienie', lekId: 'lek', data: '2026-10-11', planowanaGodzina: '08:00', status: 'zazyte' as const, updatedAt: '2026-10-11T09:00:00Z' }
    dane.dziennikLekow = [wpis, { ...wpis, id: 'nowszy', status: 'pominiete', updatedAt: '2026-10-11T10:00:00Z' }]
    expect(zbudujOsZdrowia(dane, dostep, STREFA).filter((zdarzenie) => zdarzenie.rodzaj === 'Potwierdzone przyjęcie')).toEqual([])
    dane.dziennikLekow = [{ ...wpis, id: 'pierwsze', idWystapienia: undefined }, { ...wpis, id: 'drugie', idWystapienia: undefined, wersjaDawkowaniaId: 'inna' }]
    expect(zbudujOsZdrowia(dane, dostep, STREFA).filter((zdarzenie) => zdarzenie.rodzaj === 'Potwierdzone przyjęcie')).toHaveLength(2)
  })

  it('aktywne leki biorą bieżącą wersję, pomijają przyszłe i zakończone; nie ma kopii listy', () => {
    const dane = pusteDane()
    const stara = { id: 'stara', obowiazujeOd: '2026-01-01T00:00:00Z', zapisanoAt: '2026-01-01T00:00:00Z', konfiguracja: { dawkaInstrukcja: 'BIEŻĄCA DAWKA', godziny: ['08:00'] } }
    dane.leki = [{ ...lek(), dawkaInstrukcja: 'PRZYSZŁA DAWKA', historiaDawkowania: [stara, { ...stara, id: 'nowa', obowiazujeOd: '2027-01-01T00:00:00Z', konfiguracja: { dawkaInstrukcja: 'PRZYSZŁA DAWKA', godziny: ['09:00'] } }] }, { ...lek('nieaktywny'), aktywny: false }, { ...lek('zakończony'), dataDo: '2026-10-01' }, { ...lek('przyszly'), dataOd: '2027-01-01' }]
    const karta = zbudujKarteZdrowotna(dane, dostep, CZAS, STREFA)
    expect(karta.sekcje.leki).toHaveLength(1)
    expect(karta.sekcje.leki[0].tresc).toContain('BIEŻĄCA DAWKA')
    expect(karta.sekcje.leki[0].tresc).not.toContain('PRZYSZŁA DAWKA')
    expect(zbudujOsZdrowia(dane, dostep, STREFA).filter((zdarzenie) => zdarzenie.zrodlo.id === 'lek')).toHaveLength(2)
    expect(zbudujKarteZdrowotna(dane, (tabela) => tabela !== 'leki', CZAS, STREFA).sekcje.leki).toEqual([])
  })

  it('waliduje źródło, prawa, daty; odrzuca spóźniony zapis i zachowuje usunięte odniesienie', async () => {
    await expect(zapiszWaznaInformacje(informacja(), () => false)).rejects.toThrow('uprawnienia')
    const prawa: DostepHistoriiZdrowia = (_tabela, operacja) => czyDozwolone('edytor', [], 'zdrowie', operacja, 'edytor', 'wazne_informacje')
    await expect(zapiszWaznaInformacje(informacja(), prawa)).rejects.toThrow('uprawnienia')
    await expect(zapiszWaznaInformacje({ ...informacja(), zrodlo: { tabela: 'dokumenty', id: 'brak' } }, dostep)).rejects.toThrow('niedostępne')
    await expect(zapiszWaznaInformacje({ ...informacja(), obowiazujeOd: '2026-12-01', obowiazujeDo: '2026-01-01' }, dostep)).rejects.toThrow()
    await baza.tabela('dokumenty').put({ ...utworzMetadane('dokument'), nazwa: 'Źródło', powiazania: [] })
    await zapiszWaznaInformacje({ ...informacja(), zrodlo: { tabela: 'dokumenty', id: 'dokument' } }, dostep)
    const poprzednia = (await baza.tabela('wazneInformacjeZdrowotne').get('wazna'))!
    await pobierzRepozytorium('dokumenty').usun('dokument')
    await zapiszWaznaInformacje({ ...poprzednia, ostatniPrzeglad: '2026-10-11' }, dostep)
    await expect(zapiszWaznaInformacje(poprzednia, dostep)).rejects.toThrow('uległa zmianie')
    expect(await odczytajZrodloZdrowia({ tabela: 'dokumenty', id: 'dokument' }, dostep)).toEqual({ stan: 'usuniete' })
    const dane = await pobierzDaneHistoriiZdrowia(dostep)
    expect(stanZrodlaZdrowia(poprzednia.zrodlo, dane, dostep)).toBe('niedostepne')
    expect(utworzHtmlKartyZdrowotnej(zbudujKarteZdrowotna(dane, dostep, CZAS, STREFA))).not.toContain('Ważny fakt użytkownika')
    expect(await pobierzRepozytorium('wazneInformacjeZdrowotne').lista()).toEqual([])
    await expect(pobierzRepozytorium('wazneInformacjeZdrowotne').usun('wazna')).rejects.toThrow('uprawnienia')
    await usunWaznaInformacje('wazna', dostep)
    expect((await baza.tabela('wazneInformacjeZdrowotne').get('wazna'))?.usunietoAt).toBeTruthy()
  })

  it('dobór sekcji i okres obowiązywania ograniczają eksport; HTML neutralizuje kod i nie dołącza dzienników', async () => {
    await zapiszWaznaInformacje({ ...informacja(), tresc: '<img src=x onerror=alert(1)>', ostatniPrzeglad: '2026-10-11' }, dostep)
    await zapiszWaznaInformacje({ ...informacja('nieaktualna'), tresc: 'NIEAKTUALNE', obowiazujeDo: '2020-12-31' }, dostep)
    await baza.tabela('leki').put(lek())
    const dane = await pobierzDaneHistoriiZdrowia(dostep)
    const karta = zbudujKarteZdrowotna(dane, dostep, new Date(), STREFA)
    const podglad = wybierzSekcjeKarty(karta, ['reakcje'])
    expect(podglad.sekcje.leki).toEqual([])
    const html = await wygenerujKartePoPodgladzie(podglad, ['reakcje'], dostep, STREFA)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img'); expect(html).not.toContain('Lek źródłowy'); expect(html).not.toContain('NIEAKTUALNE')
    await expect(wygenerujKartePoPodgladzie(undefined, ['reakcje'], dostep, STREFA)).rejects.toThrow('podgląd')
    await expect(wygenerujKartePoPodgladzie(podglad, ['leki'], dostep, STREFA)).rejects.toThrow('zmianie')
    await expect(wygenerujKartePoPodgladzie(podglad, ['reakcje'], () => false, STREFA)).rejects.toThrow('zmianie')
    const przed = (await baza.tabela('wazneInformacjeZdrowotne').get('wazna'))!
    await zapiszWaznaInformacje({ ...przed, tresc: 'NOWY FAKT' }, dostep)
    await expect(wygenerujKartePoPodgladzie(podglad, ['reakcje'], dostep, STREFA)).rejects.toThrow('zmianie')
  })

  it('wybrane kontakty są odczytywane z modelu i zgodnie z uprawnieniami, bez notatek', () => {
    const dane = pusteDane(); dane.wazneInformacjeZdrowotne = [{ ...informacja(), kontaktyIds: ['kontakt'] }]
    dane.kontakty = [{ ...utworzMetadane('kontakt'), nazwa: 'Kontakt wybrany', telefon: '123', notatki: 'PRYWATNA NOTATKA KONTAKTU' }, { ...utworzMetadane('nie-wybrany'), nazwa: 'Nie wybrano' }]
    expect(zbudujKarteZdrowotna(dane, dostep, CZAS, STREFA).sekcje.kontakty).toHaveLength(1)
    expect(JSON.stringify(zbudujKarteZdrowotna(dane, dostep, CZAS, STREFA))).not.toContain('PRYWATNA NOTATKA')
    expect(zbudujKarteZdrowotna(dane, (tabela) => tabela !== 'kontakty', CZAS, STREFA).sekcje.kontakty).toEqual([])
  })

  it('działa offline; dane pozostają poza kolejką, wysyłką, pull i konfliktami SyncEngine', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    await zapiszWaznaInformacje(informacja(), dostep)
    expect((await pobierzDaneHistoriiZdrowia(dostep)).wazneInformacjeZdrowotne).toHaveLength(1)
    expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(0)
    expect(await baza.tabela('historiaZmian').count()).toBe(0)
    expect(nazwyTabelSynchronizowanych).not.toContain('wazneInformacjeZdrowotne')
    const wyslij = vi.fn(async () => {})
    const silnik = new SyncEngine({ czyOnline: () => true, installationId: () => 'test', opoznieniePonowieniaMs: 0 })
    await silnik.synchronizuj({ pobierzZmiany: async () => [], wyslijZmiany: wyslij })
    expect(JSON.stringify(wyslij.mock.calls)).not.toContain('Ważny fakt użytkownika')
    const lokalny = (await baza.tabela('wazneInformacjeZdrowotne').get('wazna'))!
    const zdalny = { ...lokalny, tresc: 'OBCE DANE', updatedAt: '2099-01-01T00:00:00Z' }
    await expect(silnik.synchronizuj({ pobierzZmiany: async () => [{ tabela: 'wazneInformacjeZdrowotne', rekord: zdalny, installationId: 'inne' } as unknown as ZmianaSynchronizacji], wyslijZmiany: wyslij })).rejects.toThrow('niepoprawną paczkę')
    await baza.tabela('konfliktySynchronizacji').put({ ...utworzMetadane('obcy'), tabela: 'wazneInformacjeZdrowotne', rekordId: 'wazna', lokalny, zdalny, wykrytoAt: new Date().toISOString() })
    await expect(silnik.rozstrzygnijKonflikt('obcy', { typ: 'zdalny' })).rejects.toThrow('Tabela lokalna')
    expect(await baza.tabela('wazneInformacjeZdrowotne').get('wazna')).toEqual(lokalny)
    expect(await pobierzKolejkeSynchronizacji()).not.toEqual(expect.arrayContaining([expect.objectContaining({ tabela: 'wazneInformacjeZdrowotne' })]))
  })

  it('szyfrowany backup i restore zachowują model, status i źródło; kopia Dexie 18 nie czyści nowej tabeli', async () => {
    vi.stubGlobal('crypto', kryptografiaWezla)
    const starsza = await utworzBackup(['zdrowie']); starsza.manifest.dexieSchemaVersion = 18
    const { checksum: _checksum, ...manifest } = starsza.manifest; starsza.manifest.checksum = await obliczChecksum({ manifest, payload: starsza.payload })
    await baza.tabela('kontakty').put({ ...utworzMetadane('kontakt'), nazwa: 'Ważny kontakt' })
    await baza.tabela('leki').put(lek())
    await zapiszWaznaInformacje({ ...informacja(), zrodlo: { tabela: 'leki', id: 'lek' }, kontaktyIds: ['kontakt'], ostatniPrzeglad: '2026-10-11', statusPotwierdzenia: 'potwierdzone_przez_uzytkownika' }, dostep)
    const oryginal = await baza.tabela('wazneInformacjeZdrowotne').toArray()
    const backup = await utworzBackup()
    const zaszyfrowany = await szyfrujBackup(backup, 'Hasło testowe!')
    expect(JSON.stringify(zaszyfrowany)).not.toContain('Ważny fakt użytkownika')
    await przywrocBackup(await przygotujBackupDoPrzywracania(JSON.stringify(starsza)))
    expect(await baza.tabela('wazneInformacjeZdrowotne').toArray()).toEqual(oryginal)
    await baza.tabela('wazneInformacjeZdrowotne').clear(); await baza.tabela('kontakty').clear()
    const przywrocono = await przywrocBackup(await przygotujBackupDoPrzywracania(await odszyfrujBackup(JSON.stringify(zaszyfrowany), 'Hasło testowe!')))
    expect(przywrocono.backupPrzedPrzywracaniem.manifest.sections).toContain('wazneInformacjeZdrowotne')
    expect(await baza.tabela('wazneInformacjeZdrowotne').toArray()).toEqual(oryginal)
    expect(await baza.tabela('kontakty').get('kontakt')).toBeDefined()
    expect(stanZrodlaZdrowia(oryginal[0].zrodlo, await pobierzDaneHistoriiZdrowia(dostep), dostep)).toBe('dostepne')
  })

  it('migruje rzeczywistą bazę Dexie 18 do aktualnej wersji zachowując wyniki i dokumenty', async () => {
    const schemat = Object.fromEntries(baza.tables.filter((tabela) => !['wazneInformacjeZdrowotne', 'wspolneKasy', 'operacjeKas', 'rozliczenia', 'wydatkiGrupowe', 'zwrotyRozliczen'].includes(tabela.name)).map((tabela) => [tabela.name, [tabela.schema.primKey.src, ...tabela.schema.indexes.map((indeks) => indeks.src)].join(',')]))
    baza.close(); await Dexie.delete('ogarniacz-v1'); const stara = new Dexie('ogarniacz-v1'); stara.version(18).stores(schemat)
    await stara.open(); await stara.table('dokumenty').put({ ...utworzMetadane('dokument'), nazwa: 'Dokument', powiazania: [] }); await stara.table('wynikiBadan').put({ ...utworzMetadane('wynik'), dokumentId: 'dokument', oryginalnyWynik: '5,2' }); stara.close()
    await baza.open(); expect(baza.verno).toBe(WERSJA_SCHEMATU_BAZY)
    expect(await baza.tabela('wazneInformacjeZdrowotne').count()).toBe(0)
    expect((await baza.tabela('wynikiBadan').get('wynik'))?.dokumentId).toBe('dokument')
    expect((await baza.tabela('dokumenty').get('dokument'))?.nazwa).toBe('Dokument')
  })
})
