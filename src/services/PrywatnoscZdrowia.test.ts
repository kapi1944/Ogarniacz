import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { pobierzKolejkeSynchronizacji } from '../data/KolejkaSynchronizacji'
import { utworzMetadane } from '../domain/fabryki'
import type { Dokument, Lek, Przypomnienie, Uprawnienie, WpisTerapii } from '../domain/typy'
import { czyDozwolone, PRYWATNE_SEKCJE_ZDROWIA, ustawBiezacyDostep } from './UprawnieniaService'
import { szukajGlobalnie } from './WyszukiwanieService'
import { odczytajZrodloZdrowia } from './HistoriaZdrowiaService'
import { utworzBackup } from './BackupService'
import { utworzEksportUstawien } from './TransferUstawienService'
import { repozytoriumUstawien } from '../data/RepozytoriumUstawien'
import { domyslneUstawieniaSamopoczucia } from '../domain/samopoczucie'
import { mapujPrzypomnienieNaPowiadomienie } from '../platform/NotificationService'
import { DostawcaLekowPulpitu } from '../providers/DostawcaLekowPulpitu'
import { pobierzNajnowszaHistorie } from './HistoriaZmianService'
import { utworzDomyslnyRejestrNarzedziEcho, WykonawcaNarzedziEcho } from './echo/NarzedziaEcho'
import { zapiszLekZDodanymZapasem } from './LekiService'
import { czyKontoZgodneZDanymiLokalnymi } from './KontaService'
import { SyncEngine } from './SyncEngine'
import { zapiszSesje } from './PsychoterapiaService'
import { zapiszWynikBadania } from './BadaniaService'
import type { ZmianaSynchronizacji } from '../data/DostawcaSynchronizacji'
import { nasluchujZmianDanych } from '../data/ZdarzeniaDanych'

const lek: Lek = { ...utworzMetadane('lek'), nazwa: 'Sekret zdrowotny', dawkaInstrukcja: '1', godziny: ['08:00'], aktywny: true }
const dokument: Dokument = { ...utworzMetadane('dokument'), nazwa: 'Sekret medyczny', medyczne: { kategoria: 'wynik' }, powiazania: [] }
const sesja: WpisTerapii = { ...utworzMetadane('sesja'), terapiaId: 'terapia', dataCzas: '2026-10-11T10:00:00Z', tresc: 'Sekret terapeutyczny' }
const przypomnienie: Przypomnienie = { ...utworzMetadane('alarm'), tytul: 'Sekret zdrowotny', typ: 'absolutne', czas: '2026-10-11T10:00:00Z', stan: 'nowe', eskalacja: false, priorytet: 'normalny', zrodlo: { typ: 'leki', id: lek.id } }
const grant: Uprawnienie = { ...utworzMetadane('grant'), editorId: 'edytor', owner: 'wlasciciel', modul: 'zdrowie', status: 'aktywne', odczyt: true, edycja: true }

describe.sequential('Granice prywatności Health 2.0', () => {
  beforeEach(async () => {
    ustawBiezacyDostep(() => true)
    baza.close(); await Dexie.delete('ogarniacz-v1'); await inicjalizujBaze()
    await baza.tabela('kolejkaSynchronizacji').clear()
    await baza.tabela('leki').put(lek)
    await baza.tabela('dokumenty').bulkPut([dokument, { ...dokument, id: 'zwykly', nazwa: 'Sekret projektu', medyczne: undefined }])
    await baza.tabela('wpisyTerapii').put(sesja)
  })
  afterEach(() => { ustawBiezacyDostep(undefined); localStorage.removeItem('ogarniacz-konto-offline'); localStorage.removeItem('ogarniacz-wlasciciel-danych') })

  it.each(Object.keys(PRYWATNE_SEKCJE_ZDROWIA))('grant ogólny nie otwiera kategorii %s, a jawny grant zachowuje read/edit', (sekcja) => {
    expect(czyDozwolone('edytor', [grant], 'zdrowie', 'odczyt', 'edytor', sekcja)).toBe(false)
    expect(czyDozwolone('edytor', [{ ...grant, sekcja, edycja: false }], 'zdrowie', 'odczyt', 'edytor', sekcja)).toBe(true)
    expect(czyDozwolone('edytor', [{ ...grant, sekcja, edycja: false }], 'zdrowie', 'edycja', 'edytor', sekcja)).toBe(false)
  })

  it('cofnięcie dostępu blokuje zachowane repozytorium, ID z linku, edycję, usunięcie, przywrócenie i zapis zbiorczy', async () => {
    const repozytorium = pobierzRepozytorium('dokumenty', () => true)
    ustawBiezacyDostep(() => true)
    expect(await repozytorium.pobierz(dokument.id)).toBeDefined()
    ustawBiezacyDostep((modul) => modul !== 'zdrowie')
    expect(await repozytorium.pobierz(dokument.id)).toBeUndefined()
    expect((await repozytorium.lista()).map((rekord) => rekord.id)).toEqual(['zwykly'])
    await expect(repozytorium.zapisz(dokument)).rejects.toThrow('uprawnienia')
    await expect(repozytorium.zapiszWiele([dokument])).rejects.toThrow('uprawnienia')
    await expect(repozytorium.usun(dokument.id)).rejects.toThrow('uprawnienia')
    await expect(repozytorium.przywroc(dokument.id)).rejects.toThrow('uprawnienia')
    expect(await odczytajZrodloZdrowia({ tabela: 'dokumenty', id: dokument.id }, () => true)).toEqual({ stan: 'brak_uprawnien' })
    expect(await baza.tabela('dokumenty').get(dokument.id)).toEqual(dokument)
  })

  it('nie pozwala zdjąć ochrony dokumentu przez edycję metadanych', async () => {
    const { medyczne: _medyczne, ...bezOchrony } = dokument
    await expect(pobierzRepozytorium('dokumenty').zapisz(bezOchrony)).rejects.toThrow('ochrony')
  })

  it('materiał sesji jest prywatny również bez metadanych na samym dokumencie', async () => {
    await baza.tabela('wpisyTerapii').put({ ...sesja, psychoterapia: { dokumentyIds: ['zwykly'] } })
    ustawBiezacyDostep((_modul, _operacja, sekcja) => sekcja !== 'psychoterapia')
    expect(await pobierzRepozytorium('dokumenty').pobierz('zwykly')).toBeUndefined()
    expect(await odczytajZrodloZdrowia({ tabela: 'dokumenty', id: 'zwykly' }, () => true)).toEqual({ stan: 'brak_uprawnien' })
    await expect(pobierzRepozytorium('dokumenty').usun('zwykly')).rejects.toThrow('uprawnienia')
    ustawBiezacyDostep(() => true)
    expect(await pobierzRepozytorium('dokumenty').pobierz('zwykly')).toBeDefined()
    expect(await pobierzRepozytorium('dokumenty', () => false).pobierz('zwykly')).toBeUndefined()
  })

  it('wyszukiwanie, Pulpit i historia nie ujawniają zdrowia bez dostępu', async () => {
    await pobierzRepozytorium('leki').zapisz(lek)
    ustawBiezacyDostep((modul) => !['leki', 'zdrowie'].includes(modul))
    expect(JSON.stringify(await szukajGlobalnie('Sekret'))).not.toContain('medyczny')
    expect(JSON.stringify(await szukajGlobalnie('Sekret'))).not.toContain('zdrowotny')
    expect(await new DostawcaLekowPulpitu().pobierzElementy({ od: '2026-10-11', do: '2026-10-11' })).toEqual([])
    expect(await pobierzNajnowszaHistorie()).toEqual([])
    await expect(zapiszLekZDodanymZapasem(lek)).rejects.toThrow('uprawnienia')
  })

  it('powiadomienie nie opuszcza granicy platformy bez uprawnienia; właściciel zachowuje neutralną treść', () => {
    ustawBiezacyDostep(() => false)
    expect(mapujPrzypomnienieNaPowiadomienie(przypomnienie)).toBeUndefined()
    ustawBiezacyDostep(() => true)
    expect(mapujPrzypomnienieNaPowiadomienie(przypomnienie, true)?.tresc).toBe('Przypomnienie dotyczące zdrowia')
  })

  it('Echo pomija medyczne dokumenty i stare notatki sesji również dla właściciela', async () => {
    ustawBiezacyDostep(() => true)
    const wykonawca = new WykonawcaNarzedziEcho(utworzDomyslnyRejestrNarzedziEcho(), undefined, async () => undefined)
    for (const nazwa of ['list_documents', 'list_therapy_entries', 'search_knowledge']) {
      const wynik = await wykonawca.wykonaj({ id: nazwa, nazwa, argumenty: nazwa === 'search_knowledge' ? { fraza: 'Sekret' } : nazwa === 'list_therapy_entries' ? { terapiaId: 'terapia' } : {} })
      expect(wynik.status).toBe('wykonane')
      expect(JSON.stringify(wynik)).not.toContain('Sekret medyczny')
      expect(JSON.stringify(wynik)).not.toContain('Sekret terapeutyczny')
    }
  })

  it('backup wymaga właściciela, a jawny eksport ustawień nie zawiera psychiatrycznych definicji', async () => {
    ustawBiezacyDostep(() => false)
    await expect(utworzBackup(['zdrowie'])).rejects.toThrow('uprawnienia')
    ustawBiezacyDostep(() => true)
    await repozytoriumUstawien.zapisz({ ...await repozytoriumUstawien.wczytaj(), samopoczucie: domyslneUstawieniaSamopoczucia })
    expect(JSON.stringify(await utworzEksportUstawien())).not.toContain('samopoczucie')
    expect((await utworzBackup(['zdrowie'])).payload.zdrowie?.wpisyTerapii).toEqual([sesja])
  })

  it('starsza kolejka nie wysyła również nieoznaczonych notatek terapeutycznych', async () => {
    await baza.tabela('kolejkaSynchronizacji').put({ ...utworzMetadane('stara-zmiana'), tabela: 'wpisyTerapii', rekordId: sesja.id, rekord: sesja, operacja: 'utworzenie', liczbaProb: 0 })
    expect(await pobierzKolejkeSynchronizacji()).toEqual([])
    expect(await baza.tabela('wpisyTerapii').get(sesja.id)).toEqual(sesja)
  })

  it.each(['sesja', 'wynik'] as const)('utrwala klasyfikację dokumentu powiązanego ze źródłem %s, aktualizuje starą kolejkę i chroni po odpięciu', async (zrodlo) => {
    const zwykly = (await baza.tabela('dokumenty').get('zwykly'))!
    await pobierzRepozytorium('dokumenty').zapisz(zwykly)
    const staraZmiana = (await pobierzKolejkeSynchronizacji())[0]
    const zmianaDanych = vi.fn()
    const zakonczNasluchiwanie = nasluchujZmianDanych(zmianaDanych)
    try {
      if (zrodlo === 'sesja') {
        await zapiszSesje({ ...sesja, id: 'nowa-sesja', terapiaId: '', psychoterapia: { dokumentyIds: ['zwykly'] } }, { sesje: () => true, dziennik: () => true, zadania: () => true, zrodla: () => true })
      } else {
        await zapiszWynikBadania({ ...utworzMetadane('wynik'), parametr: 'Prywatny parametr', dataPobrania: '2026-10-11', oryginalnyWynik: '5', kwalifikator: 'rowne', dokumentId: 'zwykly' }, () => true, () => true)
      }
      const wymagane = zrodlo === 'sesja' ? ['dokumentacja', 'psychoterapia'] : ['dokumentacja']
      expect((await baza.tabela('dokumenty').get('zwykly'))?.sekcjePrywatnosci).toEqual(wymagane)
      expect(zmianaDanych).toHaveBeenCalledWith('dokumenty')
      const kolejka = await pobierzKolejkeSynchronizacji()
      expect(kolejka).toHaveLength(1)
      expect(kolejka[0].rekord).toMatchObject({ id: 'zwykly', sekcjePrywatnosci: wymagane })
      expect(kolejka[0].bazowyUpdatedAt).toBe(staraZmiana.bazowyUpdatedAt)
      expect(JSON.stringify(kolejka)).not.toContain('Prywatny parametr')
      expect(JSON.stringify(kolejka)).not.toContain('Sekret terapeutyczny')
      if (zrodlo === 'sesja') {
        const zapisana = (await baza.tabela('wpisyTerapii').get('nowa-sesja'))!
        await zapiszSesje({ ...zapisana, psychoterapia: {} }, { sesje: () => true, dziennik: () => true, zadania: () => true })
      } else {
        const zapisany = (await baza.tabela('wynikiBadan').get('wynik'))!
        await pobierzRepozytorium('wynikiBadan', () => true).zapisz({ ...zapisany, dokumentId: 'dokument' })
      }
      const chroniony = (await baza.tabela('dokumenty').get('zwykly'))!
      await expect(pobierzRepozytorium('dokumenty').zapisz({ ...chroniony, sekcjePrywatnosci: [] })).rejects.toThrow('ochrony')
      await expect(pobierzRepozytorium('dokumenty').zapiszWiele([{ ...chroniony, id: 'nowy' }, { ...chroniony, id: 'nowy', sekcjePrywatnosci: [] }])).rejects.toThrow('ochrony')
      expect(await baza.tabela('dokumenty').get('nowy')).toBeUndefined()
      ustawBiezacyDostep((_modul, _operacja, sekcja) => !sekcja)
      expect(await pobierzRepozytorium('dokumenty').pobierz('zwykly')).toBeUndefined()
    } finally { zakonczNasluchiwanie() }
  })

  it('migruje dawną relację i wysyła tylko klasyfikację na zdalnej wersji przed konfliktem treści', async () => {
    const dawny = (await baza.tabela('dokumenty').get('zwykly'))!
    await baza.tabela('wpisyTerapii').put({ ...sesja, psychoterapia: { dokumentyIds: ['zwykly'] } })
    await baza.tabela('stanSynchronizacji').update('glowny', { kolejkaZmigrowana: true })
    const zdalny = { ...dawny, nazwa: 'Nowsza nazwa serwera', updatedAt: '2099-01-01T00:00:00.000Z' }
    const wyslijZmiany = vi.fn(async (_zmiany: ZmianaSynchronizacji[]) => undefined)
    const silnik = new SyncEngine({ czyOnline: () => true, installationId: () => 'lokalna', opoznieniePonowieniaMs: 0 })
    const wynik = await silnik.synchronizuj({ pobierzZmiany: async () => [{ tabela: 'dokumenty', rekord: zdalny, installationId: 'inna' }], wyslijZmiany })
    expect(wynik.konflikty).toBe(1)
    expect(wyslijZmiany.mock.calls[0][0]).toEqual([{ tabela: 'dokumenty', rekord: { ...zdalny, sekcjePrywatnosci: ['dokumentacja', 'psychoterapia'] }, bazowyUpdatedAt: zdalny.updatedAt, installationId: 'lokalna' }])
    await silnik.rozstrzygnijKonflikt('dokumenty:zwykly', { typ: 'zdalny' })
    expect((await baza.tabela('dokumenty').get('zwykly'))?.sekcjePrywatnosci).toEqual(['dokumentacja', 'psychoterapia'])
    expect(await baza.tabela('wpisyTerapii').get(sesja.id)).toMatchObject({ tresc: sesja.tresc })
  })

  it('bez kontekstu blokuje chroniony zapis, jawny tryb lokalny i właściciel działają, a wyłączenie kontekstu odmawia', async () => {
    ustawBiezacyDostep(undefined)
    await expect(pobierzRepozytorium('dokumenty').zapisz(dokument)).rejects.toThrow('uprawnienia')
    ustawBiezacyDostep(() => true)
    await pobierzRepozytorium('dokumenty').zapisz(dokument)
    ustawBiezacyDostep(undefined)
    localStorage.setItem('ogarniacz-konto-offline', JSON.stringify({ zalogowany: true, rola: 'wlasciciel', wlascicielId: 'pierwszy' }))
    expect(await pobierzRepozytorium('dokumenty').pobierz(dokument.id)).toBeDefined()
    ustawBiezacyDostep(() => false)
    await expect(pobierzRepozytorium('dokumenty').zapisz(dokument)).rejects.toThrow('uprawnienia')
    expect(await pobierzRepozytorium('dokumenty').pobierz(dokument.id)).toBeUndefined()
  })

  it('inne konto właściciela nie przejmuje lokalnego zdrowia ani eksportu; powrót przywraca dostęp', async () => {
    ustawBiezacyDostep(() => true)
    localStorage.setItem('ogarniacz-wlasciciel-danych', 'pierwszy')
    localStorage.setItem('ogarniacz-konto-offline', JSON.stringify({ zalogowany: true, rola: 'wlasciciel', wlascicielId: 'drugi' }))
    expect(czyKontoZgodneZDanymiLokalnymi()).toBe(false)
    expect(await pobierzRepozytorium('leki').pobierz(lek.id)).toBeUndefined()
    await expect(utworzBackup(['leki'])).rejects.toThrow('uprawnienia')
    localStorage.setItem('ogarniacz-konto-offline', JSON.stringify({ zalogowany: true, rola: 'wlasciciel', wlascicielId: 'pierwszy' }))
    expect(await pobierzRepozytorium('leki').pobierz(lek.id)).toEqual(lek)
  })

  it('zmiana właściciela podczas pull zatrzymuje transfer i nie podmienia lokalnego zdrowia', async () => {
    localStorage.setItem('ogarniacz-wlasciciel-danych', 'pierwszy')
    localStorage.setItem('ogarniacz-konto-offline', JSON.stringify({ zalogowany: true, rola: 'wlasciciel', wlascicielId: 'pierwszy' }))
    await pobierzRepozytorium('leki').zapisz(lek)
    const wyslijZmiany = vi.fn(async () => undefined)
    const silnik = new SyncEngine({ czyOnline: () => true, installationId: () => 'lokalna', opoznieniePonowieniaMs: 0 })
    await expect(silnik.synchronizuj({
      trwale: false,
      wyslijZmiany,
      pobierzZmiany: async () => {
        localStorage.setItem('ogarniacz-konto-offline', JSON.stringify({ zalogowany: true, rola: 'wlasciciel', wlascicielId: 'drugi' }))
        return [{ tabela: 'leki', rekord: { ...lek, nazwa: 'Dane innego konta' }, installationId: 'inna' }]
      },
    })).rejects.toThrow('Konto zmieniło się')
    expect(wyslijZmiany).not.toHaveBeenCalled()
    expect((await baza.tabela('leki').get(lek.id))?.nazwa).toBe(lek.nazwa)
  })

  it('aktualizacja zachowuje pierwszą istniejącą sesję offline bez przepisywania zdrowia', () => {
    localStorage.setItem('ogarniacz-konto-offline', JSON.stringify({ zalogowany: true, rola: 'wlasciciel', wlascicielId: 'pierwszy' }))
    expect(czyKontoZgodneZDanymiLokalnymi()).toBe(true)
    expect(localStorage.getItem('ogarniacz-wlasciciel-danych')).toBe('pierwszy')
  })
})
