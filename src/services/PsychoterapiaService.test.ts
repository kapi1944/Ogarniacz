import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { pobierzKolejkeSynchronizacji } from '../data/KolejkaSynchronizacji'
import { utworzMetadane } from '../domain/fabryki'
import type { WpisTerapii } from '../domain/typy'
import { schematSzczegolowPsychoterapii } from '../domain/psychoterapia'
import { czyDozwolone } from './UprawnieniaService'
import { przygotujBackupDoPrzywracania, przywrocBackup, utworzBackup } from './BackupService'
import { SyncEngine } from './SyncEngine'
import { usunSesje, utworzCwiczenie, zapiszSesje, type DostepPsychoterapii } from './PsychoterapiaService'

const czas = '2026-10-11T10:00:00.000Z'
const dostep: DostepPsychoterapii = { sesje: () => true, dziennik: () => true, zadania: () => true, zrodla: () => true }
const repoSesji = () => pobierzRepozytorium('wpisyTerapii', dostep.sesje)
const repoZadan = () => pobierzRepozytorium('zadania', dostep.sesje)
function sesja(id = 'sesja'): WpisTerapii { return { ...utworzMetadane(id), terapiaId: '', dataCzas: czas, tresc: 'Prywatna notatka', psychoterapia: {} } }
async function zapiszDziennik() {
  await baza.tabela('wpisySamopoczucia').put({ ...utworzMetadane('dziennik'), dataObserwacji: '2026-10-11', godzinaObserwacji: '12:00', czasObserwacji: czas, strefaCzasowa: 'Europe/Warsaw', notatka: 'Wrażliwa obserwacja', wskazniki: [], doOmowienia: true })
}

describe.sequential('Sesje psychoterapii w istniejących tabelach', () => {
  beforeEach(async () => { baza.close(); await Dexie.delete('ogarniacz-v1'); await inicjalizujBaze(); await baza.tabela('kolejkaSynchronizacji').clear() })

  it('tworzy krótką lub pustą sesję bez terapeuty, terapii i wizyty; zachowuje ją po otwarciu bazy', async () => {
    await zapiszSesje(sesja(), dostep)
    await zapiszSesje({ ...sesja('pusta'), tresc: '' }, dostep)
    baza.close(); await baza.open()
    expect(await repoSesji().pobierz('sesja')).toMatchObject({ terapiaId: '', tresc: 'Prywatna notatka', psychoterapia: {} })
    expect(await repoSesji().lista()).toHaveLength(2)
    expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(0)
  })

  it('edytuje i usuwa przez soft-delete; odrzuca nieaktualny formularz', async () => {
    await zapiszSesje(sesja(), dostep)
    const poprzednia = (await repoSesji().pobierz('sesja'))!
    await zapiszSesje({ ...poprzednia, zalecenia: 'Ustalenia użytkownika', psychoterapia: { tematy: 'Tematy', wypowiedzi: 'Wypowiedzi' } }, dostep)
    await expect(zapiszSesje({ ...poprzednia, tresc: 'Nieaktualna' }, dostep)).rejects.toThrow('uległa zmianie')
    await usunSesje('sesja', dostep)
    expect(await repoSesji().pobierz('sesja')).toBeUndefined()
    expect((await baza.tabela('wpisyTerapii').get('sesja'))?.usunietoAt).toBeTruthy()
  })

  it('adaptuje historyczny wpis przy edycji bez utraty starych pól, ID i relacji', async () => {
    const dawny = { ...sesja('dawna'), terapiaId: 'dawna-terapia', dataCzas: '2020-03-04T09:00', samopoczucie: 0, obserwacje: 'Dawne refleksje', zalecenia: 'Dawne ustalenia', tematNastepnegoSpotkania: 'Dawne pytanie', wizytaId: 'dawna-wizyta', polaWlasne: { 'custom:cel': 'Cel' } }
    delete dawny.psychoterapia
    await baza.tabela('wpisyTerapii').put(dawny)
    expect(await pobierzRepozytorium('wpisyTerapii').pobierz('dawna')).toEqual(dawny)
    await zapiszSesje({ ...dawny, tresc: 'Nowa notatka' }, dostep)
    expect(await repoSesji().pobierz('dawna')).toMatchObject({ ...dawny, updatedAt: expect.any(String), tresc: 'Nowa notatka', psychoterapia: {} })
    expect(await pobierzRepozytorium('wpisyTerapii').pobierz('dawna')).toBeUndefined()
  })

  it('przechowuje ID dziennika bez kopii treści i zachowuje sesję po usunięciu źródła', async () => {
    await zapiszDziennik()
    await zapiszSesje({ ...sesja(), psychoterapia: { wpisySamopoczuciaIds: ['dziennik'] } }, dostep)
    const powiazana = (await repoSesji().pobierz('sesja'))!
    expect(JSON.stringify(powiazana)).not.toContain('Wrażliwa obserwacja')
    await pobierzRepozytorium('wpisySamopoczucia').usun('dziennik')
    expect(await pobierzRepozytorium('wpisySamopoczucia').pobierz('dziennik')).toBeUndefined()
    await zapiszSesje({ ...powiazana, obserwacje: 'Refleksja po usunięciu źródła' }, { ...dostep, dziennik: () => false })
    expect((await repoSesji().pobierz('sesja'))?.psychoterapia?.wpisySamopoczuciaIds).toEqual(['dziennik'])
  })

  it('odrzuca nieoznaczony wpis, błędne ID i duplikaty referencji', async () => {
    await zapiszDziennik()
    await baza.tabela('wpisySamopoczucia').update('dziennik', { doOmowienia: false })
    await expect(zapiszSesje({ ...sesja(), psychoterapia: { wpisySamopoczuciaIds: ['dziennik'] } }, dostep)).rejects.toThrow('Do omówienia')
    await expect(zapiszSesje({ ...sesja(), psychoterapia: { wpisySamopoczuciaIds: ['nie-ma'] } }, dostep)).rejects.toThrow('Do omówienia')
    expect(schematSzczegolowPsychoterapii.safeParse({ wpisySamopoczuciaIds: ['a', 'a'] }).success).toBe(false)
    expect(await repoSesji().lista()).toHaveLength(0)
  })

  it('uprawnienia blokują odczyt, zapis, usunięcie, ćwiczenia i wybór źródeł', async () => {
    const odmowa = { ...dostep, sesje: () => false }
    await expect(zapiszSesje(sesja(), odmowa)).rejects.toThrow('uprawnienia')
    await zapiszSesje(sesja(), dostep)
    expect(await pobierzRepozytorium('wpisyTerapii', odmowa.sesje).lista()).toEqual([])
    await expect(usunSesje('sesja', odmowa)).rejects.toThrow('uprawnienia')
    await expect(pobierzRepozytorium('wpisyTerapii').usun('sesja')).rejects.toThrow('uprawnienia')
    await expect(pobierzRepozytorium('wpisyTerapii').zapisz({ ...sesja(), psychoterapia: undefined })).rejects.toThrow('uprawnienia')
    await expect(utworzCwiczenie('sesja', 'operacja', { tytul: 'Ćwiczenie', opis: '' }, true, { ...dostep, zadania: () => false })).rejects.toThrow('uprawnienia')
    await zapiszDziennik()
    await expect(zapiszSesje({ ...sesja('nowa'), psychoterapia: { wpisySamopoczuciaIds: ['dziennik'] } }, { ...dostep, dziennik: () => false })).rejects.toThrow('uprawnienia')
    await expect(zapiszSesje({ ...sesja('kontakt'), psychoterapia: { terapeutaId: 'kontakt' } }, { ...dostep, zrodla: () => false })).rejects.toThrow('uprawnienia')
    expect(czyDozwolone('edytor', [{ ...utworzMetadane(), owner: 'wlasciciel', editorId: 'edytor', modul: 'zdrowie', sekcja: 'samopoczucie', status: 'aktywne', odczyt: true, edycja: true }], 'zdrowie', 'odczyt', 'edytor', 'psychoterapia')).toBe(false)
  })

  it('nie pozwala usunąć znacznika prywatności ani obejść uprawnień zapisem zbiorczym i przywróceniem', async () => {
    await zapiszSesje(sesja(), dostep)
    const wpis = (await repoSesji().pobierz('sesja'))!
    const bezOchrony = { ...wpis }; delete bezOchrony.psychoterapia
    await expect(repoSesji().zapisz(bezOchrony)).rejects.toThrow('ochrony')
    await expect(repoSesji().zapisz({ ...wpis, psychoterapia: undefined })).rejects.toThrow()
    await expect(pobierzRepozytorium('wpisyTerapii').zapiszWiele([wpis])).rejects.toThrow('uprawnienia')
    await usunSesje('sesja', dostep)
    await expect(pobierzRepozytorium('wpisyTerapii').przywroc('sesja')).rejects.toThrow('uprawnienia')
    await repoSesji().przywroc('sesja')
    expect((await repoSesji().pobierz('sesja'))?.psychoterapia).toEqual({})
  })

  it('tworzy jedno zadanie dla tej samej operacji, ale dopuszcza identyczne nazwy dla różnych operacji', async () => {
    await zapiszSesje(sesja(), dostep)
    const dane = { tytul: 'Ćwiczenie', opis: 'Prywatny opis', termin: '2026-10-20' }
    await expect(utworzCwiczenie('sesja', 'jedna', dane, false, dostep)).rejects.toThrow('Zatwierdź')
    const ids = await Promise.all([utworzCwiczenie('sesja', 'jedna', dane, true, dostep), utworzCwiczenie('sesja', 'jedna', dane, true, dostep)])
    expect(ids[0]).toBe(ids[1])
    await utworzCwiczenie('sesja', 'druga', dane, true, dostep)
    expect(await repoZadan().lista()).toHaveLength(2)
    const zadanie = (await repoZadan().pobierz(ids[0]))!
    await repoZadan().zapisz({ ...zadanie, status: 'wykonane' })
    expect((await repoZadan().pobierz(ids[0]))?.status).toBe('wykonane')
    expect(await pobierzRepozytorium('zadania').lista()).toEqual([])
    expect(await baza.tabela('historiaZmian').count()).toBe(0)
    await repoZadan().usun(ids[0])
    await utworzCwiczenie('sesja', 'jedna', dane, true, dostep)
    expect(await baza.tabela('zadania').count()).toBe(2)
    expect(await repoZadan().pobierz(ids[0])).toBeUndefined()
    await usunSesje('sesja', dostep)
    expect(await repoZadan().lista()).toHaveLength(1)
  })

  it('wybiera wcześniejsze pytania, ustalenia i ćwiczenia przez ID, bez kopiowania', async () => {
    await zapiszSesje({ ...sesja('wczesniej'), dataCzas: '2026-10-01T10:00:00Z', zalecenia: 'Stare ustalenie', tematNastepnegoSpotkania: 'Stare pytanie' }, dostep)
    const zadanieId = await utworzCwiczenie('wczesniej', 'cwiczenie', { tytul: 'Oddech', opis: '' }, true, dostep)
    const szczegoly = { ustaleniaSesjiIds: ['wczesniej'], pytaniaSesjiIds: ['wczesniej'], cwiczeniaZadaniaIds: [zadanieId] }
    await zapiszSesje({ ...sesja(), psychoterapia: szczegoly }, dostep)
    expect((await repoSesji().pobierz('sesja'))?.psychoterapia).toEqual(szczegoly)
    expect(JSON.stringify(await repoSesji().pobierz('sesja'))).not.toContain('Stare ustalenie')
  })

  it('błąd zapisu ćwiczenia nie zostawia częściowego zadania; ponowienie zachowuje ID operacji', async () => {
    await zapiszSesje(sesja(), dostep)
    const odrzuc = () => { throw new Error('Błąd lokalnego zapisu') }
    baza.tabela('zadania').hook('creating', odrzuc)
    try { await expect(utworzCwiczenie('sesja', 'ponowienie', { tytul: 'Ćwiczenie', opis: '' }, true, dostep)).rejects.toThrow('Błąd lokalnego zapisu') }
    finally { baza.tabela('zadania').hook('creating').unsubscribe(odrzuc) }
    expect(await baza.tabela('zadania').count()).toBe(0)
    expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(0)
    expect(await utworzCwiczenie('sesja', 'ponowienie', { tytul: 'Ćwiczenie', opis: '' }, true, dostep)).toBe('cwiczenie:ponowienie')
  })

  it('SyncEngine nie wysyła sesji, ćwiczeń, metadanych ani referencji; nie nadpisuje ich zdalnym rekordem', async () => {
    await zapiszDziennik()
    const dawny = { ...sesja('dawna'), psychoterapia: undefined }
    delete dawny.psychoterapia
    await pobierzRepozytorium('wpisyTerapii').zapisz(dawny)
    const lokalny = (await pobierzRepozytorium('wpisyTerapii').pobierz('dawna'))!
    await zapiszSesje({ ...lokalny, psychoterapia: { wpisySamopoczuciaIds: ['dziennik'] } }, dostep)
    await utworzCwiczenie('dawna', 'cwiczenie', { tytul: 'Prywatne ćwiczenie', opis: 'Wrażliwy opis' }, true, dostep)
    expect(await pobierzKolejkeSynchronizacji()).toEqual([])
    const wyslij = vi.fn(async () => {})
    const silnik = new SyncEngine({ czyOnline: () => true, installationId: () => 'test', opoznieniePonowieniaMs: 0 })
    await silnik.synchronizuj({ pobierzZmiany: async () => [{ tabela: 'wpisyTerapii', installationId: 'inne', rekord: { ...dawny, updatedAt: '2099-01-01T00:00:00.000Z', tresc: 'Zdalna treść' } }], wyslijZmiany: wyslij })
    expect(JSON.stringify(wyslij.mock.calls)).not.toMatch(/Prywatna notatka|Wrażliwy opis|wpisyTerapii|sesjaTerapiiId|psychoterapia/)
    expect((await repoSesji().pobierz('dawna'))?.tresc).toBe('Prywatna notatka')
    expect(await baza.tabela('konfliktySynchronizacji').count()).toBe(0)
  })

  it('odrzuca prywatny rekord w starszej kolejce i prywatne dane otrzymane z transportu', async () => {
    await zapiszSesje(sesja(), dostep)
    await baza.tabela('kolejkaSynchronizacji').put({ ...utworzMetadane('stara-kolejka'), tabela: 'wpisyTerapii', rekordId: 'sesja', operacja: 'aktualizacja', rekord: { ...sesja(), psychoterapia: undefined } as WpisTerapii, liczbaProb: 0 })
    const wyslij = vi.fn(async () => {})
    await new SyncEngine({ czyOnline: () => true, installationId: () => 'test', opoznieniePonowieniaMs: 0 }).synchronizuj({ pobierzZmiany: async () => [{ tabela: 'wpisyTerapii', installationId: 'inne', rekord: sesja('zdalna-prywatna') }], wyslijZmiany: wyslij })
    expect(JSON.stringify(wyslij.mock.calls)).not.toMatch(/Prywatna notatka|wpisyTerapii|sesjaTerapiiId|psychoterapia/)
    expect(await repoSesji().pobierz('zdalna-prywatna')).toBeUndefined()
  })

  it('backup w dotychczasowym formacie odtwarza sesję, ćwiczenie i relacje; starszy wpis pozostaje czytelny', async () => {
    await zapiszDziennik()
    const dawny = { ...sesja('dawna') }; delete dawny.psychoterapia
    await baza.tabela('wpisyTerapii').put(dawny)
    await zapiszSesje({ ...sesja(), psychoterapia: { wpisySamopoczuciaIds: ['dziennik'], tematy: 'Temat', wypowiedzi: 'Wypowiedź' } }, dostep)
    const id = await utworzCwiczenie('sesja', 'backup', { tytul: 'Ćwiczenie', opis: 'Opis' }, true, dostep)
    const przed = await baza.tabela('wpisyTerapii').toArray()
    const kopia = await utworzBackup(['zdrowie', 'samopoczucie', 'zadania'])
    expect(kopia.manifest.formatVersion).toBe(3)
    await baza.tabela('wpisyTerapii').clear(); await baza.tabela('zadania').clear()
    await przywrocBackup(await przygotujBackupDoPrzywracania(JSON.stringify(kopia)))
    expect(await baza.tabela('wpisyTerapii').toArray()).toEqual(przed)
    expect((await repoZadan().pobierz(id))?.sesjaTerapiiId).toBe('sesja')
    expect(await pobierzRepozytorium('wpisyTerapii').pobierz('dawna')).toBeDefined()
    const wyslij = vi.fn(async () => {})
    await new SyncEngine({ czyOnline: () => true, installationId: () => 'test', opoznieniePonowieniaMs: 0 }).synchronizuj({ pobierzZmiany: async () => [], wyslijZmiany: wyslij })
    expect(JSON.stringify(wyslij.mock.calls)).not.toContain('psychoterapia')
    expect(JSON.stringify(wyslij.mock.calls)).not.toContain('cwiczenie:backup')
  })
})
