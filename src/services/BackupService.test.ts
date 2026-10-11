import Dexie from 'dexie'
// Vitest uruchamia test w JSDOM, a fake-indexeddb potrzebuje natywnego Blob z Node.
// @ts-expect-error Projekt przeglądarkowy celowo nie dołącza globalnych typów Node.
import { Blob as BlobWezla, Buffer as BuforWezla } from 'node:buffer'
// @ts-expect-error Natywne Web Crypto i niezależny generator pliku są używane tylko w testach.
import { webcrypto as kryptografiaWezla, pbkdf2Sync as wyprowadzKluczWezla, createCipheriv as utworzSzyfrWezla } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze, WERSJA_SCHEMATU_BAZY } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { repozytoriumUstawien } from '../data/RepozytoriumUstawien'
import { utworzMetadane } from '../domain/fabryki'
import type { Dokument, ElementPoczekalni, Lek, ListaZakupow, Notatka, Pojazd, PozycjaZakupow, Projekt, Przypomnienie, Rachunek, Recepta, Skierowanie, Terapia, WpisTerapii, Wizyta, Zadanie } from '../domain/typy'
import { utworzZadanie } from './ZadaniaService'
import { pobierzInstallationId } from './InstallationService'
import { generujDawkiDnia, stanApteczki, zapiszLekZDodanymZapasem, zapiszStatusDawkiZApteczka } from './LekiService'
import {
  checksumJestPoprawny,
  czyBackupZaszyfrowany,
  odszyfrujBackup,
  obliczChecksum,
  PODSTAWOWE_SEKCJE_BACKUPU,
  przygotujBackupDoPrzywracania,
  przywrocBackup,
  szyfrujBackup,
  utworzBackup,
  WERSJA_FORMATU_BACKUPU,
  type OgarniaczBackup,
} from './BackupService'

const STALA_DATA = '2026-08-30T10:00:00.000Z'
const TABELE_ZDROWOTNE = ['skierowania', 'recepty', 'terapie', 'wpisyTerapii'] as const

async function zapiszDaneZdrowotne() {
  const metadane = { createdAt: STALA_DATA, updatedAt: STALA_DATA }
  const skierowanie: Skierowanie = {
    ...metadane, id: 'skierowanie-testowe', nazwa: 'Badanie testowe',
    wystawca: 'Wystawca testowy', dataWystawienia: '2026-08-20',
    typCelu: 'badanie', cel: 'Cel testowy', kod: '1234',
    terminWaznosci: '2026-12-20', placowka: 'Placówka testowa',
    notatka: 'Notatka skierowania', status: 'umowiono', wizytaId: 'wizyta-testowa',
  }
  const recepta: Recepta = {
    ...metadane, id: 'recepta-testowa', kod: '5678', dataWystawienia: '2026-08-20',
    wystawca: 'Wystawca testowy', terminRealizacji: '2026-09-20',
    status: 'czesciowo_zrealizowana', notatka: 'Notatka recepty', wizytaId: 'wizyta-testowa',
    pozycje: [{ id: 'pozycja-testowa', nazwaLeku: 'Lek testowy', lekId: 'lek-testowy',
      ilosc: 2, iloscZrealizowana: 1, dawkowanie: 'Instrukcja źródłowa',
      odplatnosc: 'Testowa', notatka: 'Notatka pozycji' }],
  }
  const terapia: Terapia = {
    ...metadane, id: 'terapia-testowa', nazwa: 'Terapia testowa', rodzaj: 'psychoterapia',
    dataRozpoczecia: '2026-08-01', status: 'aktywna', notatka: 'Notatka terapii',
    polaWlasne: { 'custom:cel': 'Własna informacja' },
  }
  const wpis: WpisTerapii = {
    ...metadane, id: 'wpis-testowy', terapiaId: terapia.id, dataCzas: STALA_DATA,
    tytul: 'Sesja testowa', tresc: 'Treść źródłowa', samopoczucie: 0,
    obserwacje: 'Obserwacje', zalecenia: 'Zapisane zalecenia',
    tematNastepnegoSpotkania: 'Pytania', wizytaId: 'wizyta-testowa',
  }
  await baza.tabela('skierowania').put(skierowanie)
  await baza.tabela('recepty').put(recepta)
  await baza.tabela('terapie').put(terapia)
  await baza.tabela('wpisyTerapii').bulkPut([wpis, {
    ...wpis, id: 'wpis-usuniety', tresc: 'Historyczny wpis', usunietoAt: '2026-08-31T10:00:00.000Z',
  }])
  return odczytajDaneZdrowotne()
}

async function odczytajDaneZdrowotne() {
  return Object.fromEntries(await Promise.all(TABELE_ZDROWOTNE.map(async (tabela) =>
    [tabela, await baza.tabela(tabela).toArray()] as const)))
}

async function przeliczChecksum(backup: OgarniaczBackup): Promise<void> {
  const { checksum: _checksum, ...manifest } = backup.manifest
  backup.manifest.checksum = await obliczChecksum({ manifest, payload: backup.payload })
}

function utworzNotatke(tytul: string): Notatka {
  return { ...utworzMetadane(), tytul, tresc: 'Treść', tagi: [], powiazania: [] }
}

async function przygotuj(backup: OgarniaczBackup): Promise<OgarniaczBackup> {
  return przygotujBackupDoPrzywracania(JSON.stringify(backup))
}

async function odczytajTekstBlobu(blob: Blob): Promise<string> {
  const zTekstem = blob as Blob & { text?: () => Promise<string> }
  if (zTekstem.text) return zTekstem.text()
  return new Promise((rozwiaz, odrzuc) => {
    const czytnik = new FileReader()
    czytnik.onerror = () => odrzuc(czytnik.error)
    czytnik.onload = () => rozwiaz(String(czytnik.result))
    czytnik.readAsText(blob)
  })
}

async function zmienManifest(
  backup: OgarniaczBackup,
  zmiana: (manifest: Record<string, unknown>) => void,
): Promise<Record<string, unknown>> {
  const kopia = structuredClone(backup) as unknown as { manifest: Record<string, unknown>; payload: unknown }
  zmiana(kopia.manifest)
  const { checksum: _checksum, ...manifest } = kopia.manifest
  kopia.manifest.checksum = await obliczChecksum({ manifest, payload: kopia.payload })
  return kopia as unknown as Record<string, unknown>
}

describe.sequential('wersjonowany backup i bezpieczne restore', () => {
  beforeEach(async () => {
    vi.stubGlobal('Blob', BlobWezla)
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  describe('szyfrowanie całej kopii', () => {
    const hasloTestowe = 'Wyłącznie testowe hasło 🐈 2026'
    beforeEach(() => { vi.stubGlobal('crypto', kryptografiaWezla) })

    async function odczytajStanBazy() {
      return Promise.all(baza.tables.map(async (tabela) => [tabela.name, await tabela.toArray()]))
    }

    // Niezależna implementacja Node sprawdza interoperacyjność i pozwala zaszyfrować błędny backup.
    function zaszyfrujZewnetrznie(zawartosc: unknown) {
      const sol = BuforWezla.alloc(16, 7)
      const iv = BuforWezla.alloc(12, 9)
      const naglowek = {
        format: 'ogarniacz-backup-szyfrowany', iv: iv.toString('base64'),
        kdf: { algorytm: 'PBKDF2', hash: 'SHA-256', iteracje: 600_000, sol: sol.toString('base64') },
        szyfr: 'AES-256-GCM', wersja: 1,
      }
      const klucz = wyprowadzKluczWezla(hasloTestowe, sol, 600_000, 32, 'sha256')
      const szyfr = utworzSzyfrWezla('aes-256-gcm', klucz, iv)
      szyfr.setAAD(BuforWezla.from(JSON.stringify(naglowek)))
      const szyfrogram = BuforWezla.concat([szyfr.update(JSON.stringify(zawartosc), 'utf8'), szyfr.final(), szyfr.getAuthTag()]).toString('base64')
      return JSON.stringify({ naglowek, szyfrogram })
    }

    it('szyfruje cały backup, losuje sól i IV oraz przywraca dane z poprawnym hasłem', async () => {
      const dane = await zapiszDaneZdrowotne()
      const backup = await utworzBackup(['zdrowie'])
      const pierwszy = await szyfrujBackup(backup, hasloTestowe)
      const drugi = await szyfrujBackup(backup, hasloTestowe)
      expect(pierwszy.naglowek.kdf.sol).not.toBe(drugi.naglowek.kdf.sol)
      expect(pierwszy.naglowek.iv).not.toBe(drugi.naglowek.iv)
      expect(pierwszy.szyfrogram).not.toBe(drugi.szyfrogram)
      const tresc = JSON.stringify(pierwszy)
      expect(czyBackupZaszyfrowany(tresc)).toBe(true)
      for (const jawne of ['manifest', 'createdAt', 'installationId', 'zdrowie', 'Treść źródłowa', hasloTestowe, backup.manifest.checksum]) {
        expect(tresc).not.toContain(jawne)
      }
      expect(await odszyfrujBackup(tresc, hasloTestowe)).toBe(JSON.stringify(backup))
      await baza.tabela('wpisyTerapii').clear()
      await przywrocBackup(await przygotujBackupDoPrzywracania(tresc, hasloTestowe))
      expect(await odczytajDaneZdrowotne()).toEqual(dane)
      expect(await przygotujBackupDoPrzywracania(zaszyfrujZewnetrznie(backup), hasloTestowe)).toEqual(backup)
    })

    it.each(['brak hasła', 'błędne hasło', 'szyfrogram', 'tag', 'sól', 'IV', 'wersja', 'algorytm', 'iteracje', 'base64', 'dodatkowe pole'])('odrzuca błąd bez zmiany żadnej tabeli: %s', async (przypadek) => {
      await zapiszDaneZdrowotne()
      const zaszyfrowany = await szyfrujBackup(await utworzBackup(['zdrowie']), hasloTestowe)
      const surowy = zaszyfrowany as unknown as { naglowek: Record<string, unknown> & { kdf: Record<string, unknown> }; szyfrogram: string; dodatkowe?: string }
      let haslo: string | undefined = hasloTestowe
      if (przypadek === 'brak hasła') haslo = undefined
      if (przypadek === 'błędne hasło') haslo = 'Niepoprawne hasło'
      if (przypadek === 'szyfrogram') surowy.szyfrogram = (surowy.szyfrogram[0] === 'A' ? 'B' : 'A') + surowy.szyfrogram.slice(1)
      if (przypadek === 'tag') surowy.szyfrogram = surowy.szyfrogram.slice(0, -4) + 'AAAA'
      if (przypadek === 'sól') surowy.naglowek.kdf.sol = 'AAAAAAAAAAAAAAAAAAAAAA=='
      if (przypadek === 'IV') surowy.naglowek.iv = 'AAAAAAAAAAAAAAAA'
      if (przypadek === 'wersja') surowy.naglowek.wersja = 2
      if (przypadek === 'algorytm') surowy.naglowek.szyfr = 'AES-CBC'
      if (przypadek === 'iteracje') surowy.naglowek.kdf.iteracje = 1_000_000_000
      if (przypadek === 'base64') surowy.szyfrogram = '!!!!'
      if (przypadek === 'dodatkowe pole') surowy.dodatkowe = 'nieobsługiwane'
      const stanPrzed = await odczytajStanBazy()
      const stanPamieci = { lokalna: { ...localStorage }, sesji: { ...sessionStorage } }
      const przygotujIPrzywroc = async () => przywrocBackup(await przygotujBackupDoPrzywracania(JSON.stringify(surowy), haslo))
      await expect(przygotujIPrzywroc()).rejects.toMatchObject({ kod: ['brak hasła'].includes(przypadek) ? 'HASLO_WYMAGANE' : przypadek === 'wersja' ? 'WERSJA_SZYFROWANIA' : ['algorytm', 'iteracje', 'base64', 'dodatkowe pole'].includes(przypadek) ? 'FORMAT_SZYFROWANIA' : 'ODSZYFROWANIE' })
      expect(await odczytajStanBazy()).toEqual(stanPrzed)
      expect({ lokalna: { ...localStorage }, sesji: { ...sessionStorage } }).toEqual(stanPamieci)
    })

    it.each(['checksum', 'struktura', 'wersja formatu', 'wersja bazy'])('waliduje odszyfrowany backup przed zapisem: %s', async (przypadek) => {
      await zapiszDaneZdrowotne()
      const backup = await utworzBackup(['zdrowie'])
      if (przypadek === 'checksum') backup.payload.zdrowie!.wpisyTerapii[0].tresc = 'Naruszona treść'
      if (przypadek === 'struktura') backup.payload.zdrowie!.wpisyTerapii[0].terapiaId = 123
      if (przypadek === 'wersja formatu') backup.manifest.formatVersion = 99
      if (przypadek === 'wersja bazy') backup.manifest.dexieSchemaVersion = 99
      if (przypadek !== 'checksum') await przeliczChecksum(backup)
      const stanPrzed = await odczytajStanBazy()
      await expect(przygotujBackupDoPrzywracania(zaszyfrujZewnetrznie(backup), hasloTestowe).then((dane) => przywrocBackup(dane))).rejects.toMatchObject({ kod: { checksum: 'CHECKSUM', struktura: 'MODEL_DANYCH', 'wersja formatu': 'WERSJA_FORMATU', 'wersja bazy': 'WERSJA_SCHEMATU_BAZY' }[przypadek] })
      expect(await odczytajStanBazy()).toEqual(stanPrzed)
    })

    it.each([1, 2, 3])('importuje jawny i zaszyfrowany historyczny format v%i tym samym walidatorem', async (wersja) => {
      const backup = await utworzBackup(['notatki'])
      const stary = await zmienManifest(backup, (manifest) => {
        manifest.formatVersion = wersja
        if (wersja < 3) delete manifest.installationId
        if (wersja === 1) { delete manifest.dexieSchemaVersion; delete manifest.backupType }
      })
      expect(czyBackupZaszyfrowany(JSON.stringify(stary))).toBe(false)
      expect(await przygotujBackupDoPrzywracania(zaszyfrujZewnetrznie(stary), hasloTestowe)).toEqual(await przygotujBackupDoPrzywracania(JSON.stringify(stary)))
    })

    it.each([0, 5 * 1024 * 1024])('przenosi pustą sekcję lub duży backup (%i bajtów treści)', async (rozmiar) => {
      if (rozmiar) await baza.tabela('notatki').put({ ...utworzNotatke('Duża notatka'), tresc: 'a'.repeat(rozmiar) })
      const backup = await utworzBackup(['notatki'])
      const zaszyfrowany = await szyfrujBackup(backup, hasloTestowe)
      expect(await przygotujBackupDoPrzywracania(JSON.stringify(zaszyfrowany), hasloTestowe)).toEqual(backup)
    }, 20_000)

    it('przywraca dokument Blob z szyfrowanej kopii', async () => {
      const dokument: Dokument = { ...utworzMetadane('blob-szyfrowany'), nazwa: 'Plik testowy', nazwaPliku: 'test.txt', mimeType: 'text/plain', rozmiar: 6, powiazania: [], plik: new Blob(['test 🐈'], { type: 'text/plain' }) }
      await baza.tabela('dokumenty').put(dokument)
      const zaszyfrowany = await szyfrujBackup(await utworzBackup(['dokumenty']), hasloTestowe)
      await baza.tabela('dokumenty').clear()
      await przywrocBackup(await przygotujBackupDoPrzywracania(JSON.stringify(zaszyfrowany), hasloTestowe))
      const odtworzony = await baza.tabela('dokumenty').get(dokument.id)
      expect(odtworzony?.plik).toBeInstanceOf(Blob)
      expect(odtworzony?.plik?.type).toBe('text/plain')
      expect(await odczytajTekstBlobu(odtworzony!.plik!)).toBe('test 🐈')
    })

    it('odrzuca puste hasło i brak Web Crypto bez nieszyfrowanego fallbacku', async () => {
      const backup = await utworzBackup(['notatki'])
      await expect(szyfrujBackup(backup, '')).rejects.toMatchObject({ kod: 'HASLO_WYMAGANE' })
      const zaszyfrowany = await szyfrujBackup(backup, hasloTestowe)
      const stanPrzed = await odczytajStanBazy()
      vi.stubGlobal('crypto', undefined)
      await expect(szyfrujBackup(backup, hasloTestowe)).rejects.toMatchObject({ kod: 'BRAK_KRYPTOGRAFII' })
      await expect(przygotujBackupDoPrzywracania(JSON.stringify(zaszyfrowany), hasloTestowe)).rejects.toMatchObject({ kod: 'BRAK_KRYPTOGRAFII' })
      expect(await odczytajStanBazy()).toEqual(stanPrzed)
    })

    it('używa nieeksportowalnego klucza AES-256 i nie zapisuje hasła w bazie', async () => {
      const wyprowadzanie = vi.spyOn(kryptografiaWezla.subtle, 'deriveKey')
      try {
        await szyfrujBackup(await utworzBackup(['notatki']), hasloTestowe)
        const klucz = await wyprowadzanie.mock.results[0].value
        expect(klucz.extractable).toBe(false)
        expect(klucz.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 })
        await expect(kryptografiaWezla.subtle.exportKey('raw', klucz)).rejects.toMatchObject({ name: expect.stringMatching(/^InvalidAccess(Error|Exception)$/) })
        expect(JSON.stringify(await odczytajStanBazy())).not.toContain(hasloTestowe)
      } finally {
        wyprowadzanie.mockRestore()
      }
    })

    it('czytelnie odrzuca niedziałający generator liczb losowych', async () => {
      const backup = await utworzBackup(['notatki'])
      vi.stubGlobal('crypto', { subtle: kryptografiaWezla.subtle, getRandomValues: () => { throw new Error('Błąd generatora') } })
      await expect(szyfrujBackup(backup, hasloTestowe)).rejects.toMatchObject({ kod: 'BRAK_KRYPTOGRAFII' })
    })
  })

  it('przywraca historię schematów, parametry planu i przyjęcia oraz ID i bilans apteczki', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-01T00:00:00'))
    const pierwotny: Lek = { ...utworzMetadane('lek-wersjonowany'), nazwa: 'Lek testowy', dawkaInstrukcja: '', godziny: ['08:00', '20:00'], dawki: [{ id: 'rano', godzina: '08:00', ilosc: 1 }, { id: 'wieczor', godzina: '20:00', ilosc: 1 }], jednostka: 'szt.', aktywny: true }
    await zapiszLekZDodanymZapasem(pierwotny, 20)
    const lek = (await baza.tabela('leki').get(pierwotny.id))!
    const wystapienia = generujDawkiDnia([lek], [], '2026-08-10')
    vi.setSystemTime(new Date('2026-08-10T10:00:00'))
    await zapiszStatusDawkiZApteczka(wystapienia[0], 'zazyte', undefined, { przyjetaIlosc: 0.5, przyjetoAt: '2026-08-10T08:15:00' })
    vi.setSystemTime(new Date('2026-08-15T12:00:00'))
    const obecny = (await baza.tabela('leki').get(lek.id))!
    await zapiszLekZDodanymZapasem({ ...obecny, godziny: ['09:00'], dawki: [{ ...obecny.dawki![0], godzina: '09:00', ilosc: 2 }], dataOd: '2026-08-15', dataDo: '2026-08-20' }, undefined, { notatka: 'Zmiana schematu' })
    const przed = (await baza.tabela('leki').get(lek.id))!
    const dziennik = await baza.tabela('dziennikLekow').toArray()
    const backup = await przygotuj(await utworzBackup(['leki'], () => STALA_DATA))
    await baza.tabela('leki').clear()
    await baza.tabela('dziennikLekow').clear()
    await przywrocBackup(backup)
    baza.close()
    await baza.open()
    const po = (await baza.tabela('leki').get(lek.id))!
    expect(JSON.stringify(po)).toBe(JSON.stringify(przed))
    expect(await baza.tabela('dziennikLekow').toArray()).toEqual(dziennik)
    // Nieobecne w JSON dawnej wersji dataOd/dataDo nie dziedziczą nowych ograniczeń.
    const historia = generujDawkiDnia([po], dziennik, '2026-08-10')
    expect(historia.map((dawka) => dawka.idWystapienia)).toEqual(wystapienia.map((dawka) => dawka.idWystapienia))
    expect(historia.map((dawka) => dawka.dawka.ilosc)).toEqual([1, 1])
    expect(historia[0].wpis?.przyjetaIlosc).toBe(0.5)
    expect(stanApteczki(po)).toBe(19.5)
    await zapiszStatusDawkiZApteczka(historia[0], 'zazyte')
    expect(stanApteczki((await baza.tabela('leki').get(lek.id))!)).toBe(19.5)
  })

  it.each(['powtórzone ID', 'błędna kolejność', 'błędny czas'])('odrzuca uszkodzoną historię schematów przed zapisem: %s', async (przypadek) => {
    const konfiguracja = { dawkaInstrukcja: '', godziny: ['08:00'] }
    const wersje = [{ id: 'pierwsza', obowiazujeOd: '2026-08-01T00:00:00Z', zapisanoAt: STALA_DATA, konfiguracja }, { id: 'druga', obowiazujeOd: '2026-08-15T00:00:00Z', zapisanoAt: STALA_DATA, konfiguracja }]
    await baza.tabela('leki').put({ ...utworzMetadane('lek-historia'), nazwa: 'Lek testowy', ...konfiguracja, aktywny: true, historiaDawkowania: wersje })
    const backup = await utworzBackup(['leki'], () => STALA_DATA)
    const rekord = backup.payload.leki!.leki![0] as unknown as Lek
    if (przypadek === 'powtórzone ID') rekord.historiaDawkowania![1].id = 'pierwsza'
    if (przypadek === 'błędna kolejność') rekord.historiaDawkowania!.reverse()
    if (przypadek === 'błędny czas') rekord.historiaDawkowania![1].obowiazujeOd = 'nieznany'
    await przeliczChecksum(backup)
    await expect(przygotuj(backup)).rejects.toThrow()
    expect((await baza.tabela('leki').get('lek-historia'))?.historiaDawkowania).toEqual(wersje)
  })

  it('zachowuje faktyczne przyjęcie i nierozliczony zapas oraz nie dopisuje ich do historii', async () => {
    const historyczny = { ...utworzMetadane('dawka-stara'), lekId: 'lek-test', data: '2026-08-14', planowanaGodzina: '08:00', status: 'zazyte' as const, reakcjaAt: STALA_DATA }
    const nowy = { ...historyczny, id: 'dawka-nowa', przyjetoAt: '2026-08-14T06:15:00Z', przyjetaIlosc: 3, przyjetaJednostka: 'szt.', nierozliczonaIlosc: 2, rozbieznoscApteczki: 'Niedobór zapasu' }
    await baza.tabela('dziennikLekow').bulkPut([historyczny, nowy])
    const backup = await przygotuj(await utworzBackup(['leki'], () => STALA_DATA))
    await baza.tabela('dziennikLekow').clear()
    await przywrocBackup(backup)
    expect(await baza.tabela('dziennikLekow').get(nowy.id)).toEqual(nowy)
    expect(await baza.tabela('dziennikLekow').get(historyczny.id)).toEqual(historyczny)
  })

  it('eksportuje wszystkie nowe tabele raz w domyślnej i selektywnej kopii', async () => {
    const dane = await zapiszDaneZdrowotne()
    for (const sekcje of [undefined, ['zdrowie', 'zdrowie'] as const]) {
      const backup = await utworzBackup(sekcje, () => STALA_DATA)
      expect(backup.payload.zdrowie).toEqual(dane)
      expect(backup.manifest.sections.filter((sekcja) => sekcja === 'zdrowie')).toHaveLength(1)
      expect(backup.manifest.recordCounts.zdrowie).toBe(5)
      expect(backup.manifest.schemaVersions.zdrowie).toBe(1)
      expect(backup.manifest.formatVersion).toBe(WERSJA_FORMATU_BACKUPU)
      for (const tabela of TABELE_ZDROWOTNE) {
        expect(Object.values(backup.payload).filter((sekcja) => tabela in sekcja!)).toHaveLength(1)
      }
      expect(await checksumJestPoprawny(backup)).toBe(true)
    }
  })

  it('przywraca zdrowie z pełną treścią, datami, powiązaniami i soft-delete bez duplikatów', async () => {
    const dane = await zapiszDaneZdrowotne()
    const lek: Lek = { id: 'lek-testowy', createdAt: STALA_DATA, updatedAt: STALA_DATA,
      nazwa: 'Lek testowy', dawkaInstrukcja: '', godziny: [], aktywny: true }
    const wizyta: Wizyta = { id: 'wizyta-testowa', createdAt: STALA_DATA, updatedAt: STALA_DATA,
      nazwa: 'Wizyta testowa', status: 'odbyta', notatka: '', pytania: [],
      dokumentyIds: [], checklista: [], skierowanieId: 'skierowanie-testowe' }
    await baza.tabela('leki').put(lek)
    await baza.tabela('wizyty').put(wizyta)
    const backup = await przygotuj(await utworzBackup(['zdrowie', 'leki', 'wizyty'], () => STALA_DATA))
    for (const tabela of [...TABELE_ZDROWOTNE, 'leki', 'wizyty'] as const) await baza.tabela(tabela).clear()

    const wynik = await przywrocBackup(backup)
    await przywrocBackup(backup)

    expect(wynik.liczbaRekordow).toBe(7)
    expect(await odczytajDaneZdrowotne()).toEqual(dane)
    expect(await baza.tabela('leki').get(lek.id)).toEqual(lek)
    expect(await baza.tabela('wizyty').get(wizyta.id)).toEqual(wizyta)
  })

  it.each([1, 2, 3])('zachowuje zdrowie przy odtwarzaniu starszej pełnej kopii v%i bez nowej sekcji', async (wersja) => {
    const historyczneSekcje = PODSTAWOWE_SEKCJE_BACKUPU.filter((sekcja) => sekcja !== 'zdrowie')
    const kopia = await utworzBackup(historyczneSekcje, () => STALA_DATA)
    const staraKopia = await zmienManifest(kopia, (manifest) => {
      manifest.formatVersion = wersja
      if (wersja === 1) {
        delete manifest.dexieSchemaVersion
        delete manifest.backupType
        delete manifest.installationId
      } else if (wersja === 2) delete manifest.installationId
    })
    const dane = await zapiszDaneZdrowotne()

    const wynik = await przywrocBackup(await przygotujBackupDoPrzywracania(JSON.stringify(staraKopia)))

    expect(wynik.przywroconeSekcje).toEqual(historyczneSekcje)
    expect(await odczytajDaneZdrowotne()).toEqual(dane)
    expect(wynik.backupPrzedPrzywracaniem.payload.zdrowie).toEqual(dane)
    expect(await checksumJestPoprawny(wynik.backupPrzedPrzywracaniem)).toBe(true)
  })

  it('tworzy kompletną kopię zdrowia before-restore przed zastąpieniem danych', async () => {
    const dane = await zapiszDaneZdrowotne()
    const backup = await przygotuj(await utworzBackup(['zdrowie'], () => STALA_DATA))
    await baza.tabela('wpisyTerapii').update('wpis-testowy', { tresc: 'Bieżąca treść' })
    const przed = await odczytajDaneZdrowotne()

    const wynik = await przywrocBackup(backup)

    expect(wynik.backupPrzedPrzywracaniem.manifest.backupType).toBe('before-restore')
    expect(wynik.backupPrzedPrzywracaniem.manifest.sections).toEqual(PODSTAWOWE_SEKCJE_BACKUPU)
    expect(wynik.backupPrzedPrzywracaniem.payload.zdrowie).toEqual(przed)
    await przygotuj(wynik.backupPrzedPrzywracaniem)
    expect(await odczytajDaneZdrowotne()).toEqual(dane)
  })

  it('czeka na asynchroniczne zabezpieczenie kopii ochronnej przed pierwszym zapisem', async () => {
    const daneZKopii = await zapiszDaneZdrowotne()
    const backup = await przygotuj(await utworzBackup(['zdrowie'], () => STALA_DATA))
    await baza.tabela('wpisyTerapii').update('wpis-testowy', { tresc: 'Bieżąca treść przed zapisem kopii' })
    const przed = await odczytajDaneZdrowotne()
    let zakonczZapis!: () => void
    const oczekiwanieNaZapis = new Promise<void>((rozwiaz) => { zakonczZapis = rozwiaz })
    const zabezpieczKopie = vi.fn(async (kopia: OgarniaczBackup) => {
      expect(kopia.payload.zdrowie).toEqual(przed)
      expect(await checksumJestPoprawny(kopia)).toBe(true)
      await oczekiwanieNaZapis
    })
    const przywracanie = przywrocBackup(backup, ['zdrowie'], { poUtworzeniuKopii: zabezpieczKopie })
    await vi.waitFor(() => expect(zabezpieczKopie).toHaveBeenCalledOnce())
    expect(await odczytajDaneZdrowotne()).toEqual(przed)
    zakonczZapis()
    await przywracanie
    expect(await odczytajDaneZdrowotne()).toEqual(daneZKopii)
  })

  it.each(['błąd szyfrowania', 'błąd zapisu', 'anulowanie'])('odrzucenie asynchronicznej ochrony zatrzymuje restore bez zmian bazy: %s', async (przyczyna) => {
    await zapiszDaneZdrowotne()
    const backup = await przygotuj(await utworzBackup(['zdrowie'], () => STALA_DATA))
    await baza.tabela('wpisyTerapii').update('wpis-testowy', { tresc: 'Chroniona bieżąca treść' })
    const przed = await Promise.all(baza.tables.map(async (tabela) => [tabela.name, await tabela.toArray()]))
    await expect(przywrocBackup(backup, ['zdrowie'], { poUtworzeniuKopii: async () => { await Promise.resolve(); throw new Error(przyczyna) } })).rejects.toThrow(przyczyna)
    expect(await Promise.all(baza.tables.map(async (tabela) => [tabela.name, await tabela.toArray()]))).toEqual(przed)
  })

  it.each(['brak sekcji', 'brak tabeli', 'błędna liczba', 'błędny rekord'] as const)(
    'blokuje restore bez zmian danych, gdy kopia ochronna zdrowia ma problem: %s', async (problem) => {
      await zapiszDaneZdrowotne()
      const backup = await przygotuj(await utworzBackup(['zdrowie'], () => STALA_DATA))
      await baza.tabela('wpisyTerapii').update('wpis-testowy', { tresc: 'Bieżąca treść do ochrony' })
      const przed = await odczytajDaneZdrowotne()
      const kopiaOchronna = await utworzBackup(undefined, () => STALA_DATA, 'before-restore')
      if (problem === 'brak sekcji') {
        kopiaOchronna.manifest.sections = kopiaOchronna.manifest.sections.filter((sekcja) => sekcja !== 'zdrowie')
        delete kopiaOchronna.payload.zdrowie
        delete kopiaOchronna.manifest.recordCounts.zdrowie
        delete kopiaOchronna.manifest.schemaVersions.zdrowie
      } else if (problem === 'brak tabeli') delete kopiaOchronna.payload.zdrowie!.wpisyTerapii
      else if (problem === 'błędna liczba') kopiaOchronna.manifest.recordCounts.zdrowie = 0
      else kopiaOchronna.payload.zdrowie!.wpisyTerapii[0].terapiaId = 123
      await przeliczChecksum(kopiaOchronna)
      const poUtworzeniuKopii = vi.fn()

      await expect(przywrocBackup(backup, undefined, {
        utworzKopiePrzedPrzywracaniem: async () => kopiaOchronna,
        poUtworzeniuKopii,
      })).rejects.toMatchObject({ kod: 'BEFORE_RESTORE' })

      expect(poUtworzeniuKopii).not.toHaveBeenCalled()
      expect(await odczytajDaneZdrowotne()).toEqual(przed)
    },
  )

  it('cofa wcześniejsze czyszczenia i zapisy wszystkich tabel zdrowia po błędzie ostatniej tabeli', async () => {
    await zapiszDaneZdrowotne()
    const backup = await przygotuj(await utworzBackup(['zdrowie'], () => STALA_DATA))
    await baza.tabela('skierowania').update('skierowanie-testowe', { cel: 'Bieżący cel' })
    await baza.tabela('recepty').update('recepta-testowa', { notatka: 'Bieżąca recepta' })
    await baza.tabela('terapie').update('terapia-testowa', { nazwa: 'Bieżąca terapia' })
    await baza.tabela('wpisyTerapii').update('wpis-testowy', { tresc: 'Bieżący wpis' })
    const przed = await odczytajDaneZdrowotne()
    const odrzucZapis = () => { throw new Error('Syntetyczny błąd zapisu wpisu terapii') }
    baza.tabela('wpisyTerapii').hook('creating', odrzucZapis)
    try {
      await expect(przywrocBackup(backup)).rejects.toThrow('Syntetyczny błąd zapisu wpisu terapii')
    } finally {
      baza.tabela('wpisyTerapii').hook('creating').unsubscribe(odrzucZapis)
    }
    expect(await odczytajDaneZdrowotne()).toEqual(przed)
  })

  it.each([
    ['skierowania', { status: 'nieznany' }],
    ['recepty', { pozycje: [{ id: 'pozycja', nazwaLeku: 'Test', ilosc: 'dwie', iloscZrealizowana: 0 }] }],
    ['terapie', { rodzaj: 123 }],
    ['wpisyTerapii', { terapiaId: 123 }],
    ['wpisyTerapii', { psychoterapia: { wpisySamopoczuciaIds: [123] } }],
    ['wpisyTerapii', { psychoterapia: { pytaniaSesjiIds: ['sesja', 'sesja'] } }],
  ] as const)('odrzuca niepoprawny rekord tabeli %s przed zmianą danych', async (tabela, zmiana) => {
    const przed = await zapiszDaneZdrowotne()
    const backup = await utworzBackup(['zdrowie'], () => STALA_DATA)
    Object.assign(backup.payload.zdrowie![tabela][0], zmiana)
    await przeliczChecksum(backup)

    await expect(przywrocBackup(backup)).rejects.toMatchObject({ kod: 'MODEL_DANYCH' })
    expect(await odczytajDaneZdrowotne()).toEqual(przed)
  })

  it('odrzuca powtórzone ID i niepełny zestaw tabel nowej sekcji', async () => {
    const przed = await zapiszDaneZdrowotne()
    const backup = await utworzBackup(['zdrowie'], () => STALA_DATA)
    const duplikat = structuredClone(backup)
    duplikat.payload.zdrowie!.terapie.push(duplikat.payload.zdrowie!.terapie[0])
    duplikat.manifest.recordCounts.zdrowie! += 1
    await przeliczChecksum(duplikat)
    await expect(przygotuj(duplikat)).rejects.toMatchObject({ kod: 'MODEL_DANYCH' })

    delete backup.payload.zdrowie!.skierowania
    await przeliczChecksum(backup)
    await expect(przygotuj(backup)).rejects.toMatchObject({ kod: 'STRUKTURA_SEKCJI' })
    expect(await odczytajDaneZdrowotne()).toEqual(przed)
  })

  it('buduje kompletny manifest aktualnego formatu', async () => {
    const backup = await utworzBackup(['ustawienia', 'zadania'], () => STALA_DATA)

    expect(backup.manifest).toMatchObject({
      formatVersion: WERSJA_FORMATU_BACKUPU,
      createdAt: STALA_DATA,
      appVersion: '1.0.0',
      dexieSchemaVersion: WERSJA_SCHEMATU_BAZY,
      backupType: 'export',
      sections: ['ustawienia', 'zadania'],
      recordCounts: { ustawienia: 1, zadania: 0 },
      schemaVersions: { ustawienia: 1, zadania: 1 },
    })
    expect(backup.manifest.checksum).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('wylicza deterministyczny checksum niezależnie od kolejności kluczy JSON', async () => {
    const checksumA = await obliczChecksum({
      manifest: { formatVersion: 2, sections: ['zadania'], recordCounts: { zadania: 1 } },
      payload: { zadania: { zadania: [{ id: '1', tytul: 'Test' }] } },
    })
    const checksumB = await obliczChecksum({
      manifest: { recordCounts: { zadania: 1 }, sections: ['zadania'], formatVersion: 2 },
      payload: { zadania: { zadania: [{ tytul: 'Test', id: '1' }] } },
    })

    expect(checksumB).toBe(checksumA)
  })

  it('odrzuca uszkodzony JSON bez zmiany danych', async () => {
    const repozytorium = pobierzRepozytorium('zadania')
    await repozytorium.zapisz(utworzZadanie({ tytul: 'Bezpieczne', opis: '', priorytet: 'normalny' }))
    const przed = await repozytorium.lista()

    await expect(przygotujBackupDoPrzywracania('{"manifest":')).rejects.toMatchObject({ kod: 'USZKODZONY_JSON' })

    expect(await repozytorium.lista()).toEqual(przed)
  })

  it('odrzuca zły checksum bez zmiany danych', async () => {
    const repozytorium = pobierzRepozytorium('zadania')
    await repozytorium.zapisz(utworzZadanie({ tytul: 'Oryginał', opis: '', priorytet: 'normalny' }))
    const backup = await utworzBackup(['zadania'], () => STALA_DATA)
    backup.payload.zadania!.zadania[0].tytul = 'Manipulacja'
    const przed = await repozytorium.lista()

    await expect(przygotuj(backup)).rejects.toMatchObject({ kod: 'CHECKSUM' })

    expect(await repozytorium.lista()).toEqual(przed)
  })

  it('ponownie sprawdza checksum bezpośrednio przed restore', async () => {
    const repozytorium = pobierzRepozytorium('zadania')
    await repozytorium.zapisz(utworzZadanie({ tytul: 'Oryginał', opis: '', priorytet: 'normalny' }))
    const backup = await przygotuj(await utworzBackup(['zadania'], () => STALA_DATA))
    backup.payload.zadania!.zadania[0].tytul = 'Zmiana po walidacji'
    const przed = await repozytorium.lista()

    await expect(przywrocBackup(backup)).rejects.toMatchObject({ kod: 'CHECKSUM' })

    expect(await repozytorium.lista()).toEqual(przed)
  })

  it('odrzuca nieobsługiwaną wersję formatu', async () => {
    const backup = await utworzBackup(['zadania'], () => STALA_DATA)
    const przyszly = await zmienManifest(backup, (manifest) => { manifest.formatVersion = 99 })

    await expect(przygotujBackupDoPrzywracania(JSON.stringify(przyszly))).rejects.toMatchObject({ kod: 'WERSJA_FORMATU' })
  })

  it('odrzuca rekord niezgodny z modelem przed restore', async () => {
    const backup = await utworzBackup(['zadania'], () => STALA_DATA)
    backup.payload.zadania!.zadania.push({ id: 'x', createdAt: STALA_DATA, updatedAt: STALA_DATA })
    backup.manifest.recordCounts.zadania = 1
    const { checksum: _checksum, ...manifest } = backup.manifest
    backup.manifest.checksum = await obliczChecksum({ manifest, payload: backup.payload })

    await expect(przygotuj(backup)).rejects.toMatchObject({ kod: 'MODEL_DANYCH' })
  })

  it('tworzy pełny backup before-restore przed pierwszym zapisem', async () => {
    const repozytorium = pobierzRepozytorium('zadania')
    await repozytorium.zapisz(utworzZadanie({ tytul: 'Z backupu', opis: '', priorytet: 'normalny' }))
    const backup = await przygotuj(await utworzBackup(['zadania'], () => STALA_DATA))
    await baza.tabela('zadania').clear()
    await repozytorium.zapisz(utworzZadanie({ tytul: 'Przed restore', opis: '', priorytet: 'normalny' }))

    const wynik = await przywrocBackup(backup)

    expect(wynik.backupPrzedPrzywracaniem.manifest.backupType).toBe('before-restore')
    expect(wynik.backupPrzedPrzywracaniem.manifest.sections).toEqual(PODSTAWOWE_SEKCJE_BACKUPU)
    expect(wynik.backupPrzedPrzywracaniem.payload.zadania?.zadania[0]).toMatchObject({ tytul: 'Przed restore' })
    expect((await repozytorium.lista())[0]).toMatchObject({ tytul: 'Z backupu' })
  })

  it('nie rozpoczyna restore, gdy backup before-restore się nie powiedzie', async () => {
    const repozytorium = pobierzRepozytorium('zadania')
    await repozytorium.zapisz(utworzZadanie({ tytul: 'Docelowe', opis: '', priorytet: 'normalny' }))
    const backup = await przygotuj(await utworzBackup(['zadania'], () => STALA_DATA))
    await baza.tabela('zadania').clear()
    await repozytorium.zapisz(utworzZadanie({ tytul: 'Ma zostać', opis: '', priorytet: 'normalny' }))
    const przed = await repozytorium.lista()

    await expect(przywrocBackup(backup, ['zadania'], {
      utworzKopiePrzedPrzywracaniem: async () => { throw new Error('Brak miejsca') },
    })).rejects.toThrow('Brak miejsca')

    expect(await repozytorium.lista()).toEqual(przed)
  })

  it('restore jednej sekcji nie zmienia pozostałych', async () => {
    const zadania = pobierzRepozytorium('zadania')
    const notatki = pobierzRepozytorium('notatki')
    await zadania.zapisz(utworzZadanie({ tytul: 'Zadanie z backupu', opis: '', priorytet: 'normalny' }))
    await notatki.zapisz(utworzNotatke('Notatka z backupu'))
    const backup = await przygotuj(await utworzBackup(['zadania', 'notatki'], () => STALA_DATA))
    await baza.tabela('zadania').clear()
    await baza.tabela('notatki').clear()
    await zadania.zapisz(utworzZadanie({ tytul: 'Zadanie bieżące', opis: '', priorytet: 'normalny' }))
    await notatki.zapisz(utworzNotatke('Notatka bieżąca'))

    await przywrocBackup(backup, ['zadania'])

    expect((await zadania.lista())[0]).toMatchObject({ tytul: 'Zadanie z backupu' })
    expect((await notatki.lista())[0]).toMatchObject({ tytul: 'Notatka bieżąca' })
  })

  it('zachowuje lokalny installationId podczas importu backupu z innej instalacji', async () => {
    const lokalneInstallationId = pobierzInstallationId()
    const backup = await utworzBackup(['zadania'], () => STALA_DATA)
    const obcyBackup = await zmienManifest(backup, (manifest) => {
      manifest.installationId = 'instalacja-zrodlowa'
    })

    await przywrocBackup(await przygotuj(obcyBackup as unknown as OgarniaczBackup), ['zadania'])

    expect(pobierzInstallationId()).toBe(lokalneInstallationId)
  })

  it('kolejny import tego samego backupu zastępuje sekcję zamiast dublować rekordy', async () => {
    const zadania = pobierzRepozytorium('zadania')
    await zadania.zapisz(utworzZadanie({ tytul: 'Jedno zadanie', opis: '', priorytet: 'normalny' }))
    const backup = await przygotuj(await utworzBackup(['zadania'], () => STALA_DATA))
    await baza.tabela('zadania').clear()

    await przywrocBackup(backup, ['zadania'])
    await przywrocBackup(backup, ['zadania'])

    expect(await zadania.lista()).toHaveLength(1)
  })

  it('przenosi rekordy powiązane z projektami i przypomnieniami bez zmiany ich ID', async () => {
    const projekt: Projekt = { ...utworzMetadane('projekt-transfer'), nazwa: 'Projekt transfer', opis: '', status: 'aktywne', blokady: '' }
    const zadanie = { ...utworzZadanie({ tytul: 'Zadanie transfer', opis: '', priorytet: 'normalny' }), projektId: projekt.id }
    const przypomnienie: Przypomnienie = {
      ...utworzMetadane('przypomnienie-transfer'),
      tytul: 'Przypomnienie transfer',
      zrodlo: { typ: 'zadania', id: zadanie.id },
      typ: 'absolutne',
      priorytet: 'normalny',
      stan: 'nowe',
      eskalacja: false,
    }
    await baza.tabela('projekty').put(projekt)
    await baza.tabela('zadania').put(zadanie)
    await baza.tabela('przypomnienia').put(przypomnienie)

    const backup = await przygotuj(await utworzBackup(['zadania', 'pozostaleDane'], () => STALA_DATA))
    await baza.tabela('projekty').clear()
    await baza.tabela('zadania').clear()
    await baza.tabela('przypomnienia').clear()

    await przywrocBackup(backup, ['zadania', 'pozostaleDane'])

    expect(await baza.tabela('zadania').get(zadanie.id)).toMatchObject({ projektId: projekt.id })
    expect(await baza.tabela('projekty').get(projekt.id)).toMatchObject({ id: projekt.id })
    expect(await baza.tabela('przypomnienia').get(przypomnienie.id)).toMatchObject({
      zrodlo: { typ: 'zadania', id: zadanie.id },
    })
  })

  it('wykonuje scenariusz seed → backup → mutation → restore → requery', async () => {
    const zadania = pobierzRepozytorium('zadania')
    const notatki = pobierzRepozytorium('notatki')
    await zadania.zapisz(utworzZadanie({ tytul: 'Seed zadania', opis: '', priorytet: 'normalny' }))
    await notatki.zapisz(utworzNotatke('Seed notatki'))
    const backup = await przygotuj(await utworzBackup(undefined, () => STALA_DATA))
    await baza.tabela('zadania').clear()
    await baza.tabela('notatki').clear()
    await zadania.zapisz(utworzZadanie({ tytul: 'Mutacja', opis: '', priorytet: 'normalny' }))

    const wynik = await przywrocBackup(backup)

    expect(wynik.przywroconeSekcje).toEqual(backup.manifest.sections)
    expect(await zadania.lista()).toEqual(backup.payload.zadania?.zadania)
    expect(await notatki.lista()).toEqual(backup.payload.notatki?.notatki)
  })

  it('zachowuje polskie znaki oraz datę i godzinę wizyty po round-tripie', async () => {
    const zadanie = utworzZadanie({ tytul: 'Zażółć gęślą jaźń — Łódź, Środa, ąćęłńóśźż', opis: '', priorytet: 'normalny' })
    const wizyta: Wizyta = {
      ...utworzMetadane('wizyta-z-data'),
      nazwa: 'Kontrola',
      status: 'umowiona',
      data: '2026-09-15',
      godzina: '12:30',
      notatka: '',
      pytania: [],
      dokumentyIds: [],
      checklista: [],
    }
    await pobierzRepozytorium('zadania').zapisz(zadanie)
    await pobierzRepozytorium('wizyty').zapisz(wizyta)
    const backup = await przygotuj(await utworzBackup(['zadania', 'wizyty'], () => STALA_DATA))
    await baza.tabela('zadania').clear()
    await baza.tabela('wizyty').clear()

    await przywrocBackup(backup, ['zadania', 'wizyty'])

    expect((await baza.tabela('zadania').get(zadanie.id))?.tytul).toBe(zadanie.tytul)
    expect(await baza.tabela('wizyty').get(wizyta.id)).toMatchObject({ data: wizyta.data, godzina: wizyta.godzina })
  })

  it('usuwa sztuczną ilość zero ze starego backupu leku', async () => {
    const lek: Lek = {
      ...utworzMetadane('lek-backup-v12'),
      nazwa: 'Lek ze starego backupu',
      dawkaInstrukcja: 'Uzupełnij ilość',
      godziny: ['08:00', '20:00'],
      dawki: [
        { id: 'dawka-bez-ilosci', godzina: '08:00', ilosc: 0 },
        { id: 'dawka-z-iloscia', godzina: '20:00', ilosc: 2 },
      ],
      aktywny: true,
    }
    await pobierzRepozytorium('leki').zapisz(lek)
    const backup = await przygotuj(await utworzBackup(['leki'], () => STALA_DATA))
    await baza.tabela('leki').clear()

    await przywrocBackup(backup, ['leki'])

    const przywrocony = await baza.tabela('leki').get(lek.id)
    expect(przywrocony?.dawki?.[0]).not.toHaveProperty('ilosc')
    expect(przywrocony?.dawki?.[1]?.ilosc).toBe(2)
  })

  it('przenosi dokumenty, Bloby i pełne metadane encji bez zapisu Base64 w IndexedDB', async () => {
    const dokument: Dokument = {
      id: 'dokument-1',
      createdAt: '2026-08-01T08:00:00.000Z',
      updatedAt: '2026-08-02T09:00:00.000Z',
      nazwa: 'Instrukcja',
      nazwaPliku: 'instrukcja.txt',
      mimeType: 'text/plain',
      rozmiar: 17,
      plik: new Blob(['Treść dokumentu'], { type: 'text/plain' }),
      powiazania: [],
    }
    const usuniety: Dokument = {
      ...dokument,
      id: 'dokument-usuniety',
      nazwa: 'Usunięty dokument',
      usunietoAt: '2026-08-03T10:00:00.000Z',
    }
    await baza.tabela('dokumenty').bulkPut([dokument, usuniety])

    const backup = await utworzBackup(['dokumenty'], () => STALA_DATA)
    const transportowyPlik = backup.payload.dokumenty?.dokumenty[0].plik as Record<string, unknown>
    expect(transportowyPlik).toMatchObject({ __ogarniaczBlob: true, mimeType: 'text/plain' })
    expect(typeof transportowyPlik.base64).toBe('string')

    await baza.tabela('dokumenty').clear()
    await przywrocBackup(await przygotuj(backup), ['dokumenty'])

    const przywrocony = await baza.tabela('dokumenty').get(dokument.id)
    const przywroconyUsuniety = await baza.tabela('dokumenty').get(usuniety.id)
    expect(przywrocony).toMatchObject({
      id: dokument.id,
      createdAt: dokument.createdAt,
      updatedAt: dokument.updatedAt,
    })
    expect(przywrocony?.plik).toBeInstanceOf(Blob)
    expect(przywrocony?.plik?.type).toBe('text/plain')
    expect(await odczytajTekstBlobu(przywrocony!.plik!)).toBe('Treść dokumentu')
    expect(przywroconyUsuniety).toMatchObject({
      id: usuniety.id,
      createdAt: usuniety.createdAt,
      updatedAt: usuniety.updatedAt,
      usunietoAt: usuniety.usunietoAt,
    })
    expect(przywrocony?.plik).not.toHaveProperty('__ogarniaczBlob')
  })

  it('finalnie odzyskuje krytyczne dane wielu kategorii i tworzy pre-restore backup', async () => {
    const zadanie = utworzZadanie({ tytul: 'Recovery zadanie', opis: '', priorytet: 'wysoki' })
    const notatka = utworzNotatke('Recovery notatka')
    const poczekalnia: ElementPoczekalni = { ...utworzMetadane('recovery-poczekalnia'), tresc: 'Do rozpatrzenia', zrodlo: 'tekst', status: 'nowe' }
    const lek: Lek = { ...utworzMetadane('recovery-lek'), nazwa: 'Recovery lek', dawkaInstrukcja: '1 tabletka', godziny: ['08:00'], aktywny: true }
    const wizyta: Wizyta = { ...utworzMetadane('recovery-wizyta'), nazwa: 'Recovery wizyta', status: 'umowiona', data: '2026-09-15', godzina: '12:00', notatka: '', pytania: [], dokumentyIds: [], checklista: [] }
    const rachunek: Rachunek = { ...utworzMetadane('recovery-rachunek'), nazwa: 'Recovery rachunek', kwota: 150, termin: '2026-09-20', status: 'niezaplacony' }
    const pojazd: Pojazd = { ...utworzMetadane('recovery-pojazd'), nazwa: 'Recovery auto', przebieg: 12345 }
    const lista: ListaZakupow = { ...utworzMetadane('recovery-lista'), nazwa: 'Recovery zakupy', aktywna: true }
    const pozycja: PozycjaZakupow = { ...utworzMetadane('recovery-pozycja'), listaId: lista.id, nazwa: 'Mleko', ilosc: '1', kupione: false }

    await pobierzRepozytorium('zadania').zapisz(zadanie)
    await pobierzRepozytorium('notatki').zapisz(notatka)
    await pobierzRepozytorium('skrzynka').zapisz(poczekalnia)
    await pobierzRepozytorium('leki').zapisz(lek)
    await pobierzRepozytorium('wizyty').zapisz(wizyta)
    await pobierzRepozytorium('rachunki').zapisz(rachunek)
    await pobierzRepozytorium('pojazdy').zapisz(pojazd)
    await pobierzRepozytorium('listyZakupow').zapisz(lista)
    await pobierzRepozytorium('pozycjeZakupow').zapisz(pozycja)
    await repozytoriumUstawien.zapisz({ ...(await repozytoriumUstawien.wczytaj()), powiadomienia: true })

    const backup = await przygotuj(await utworzBackup(undefined, () => STALA_DATA))
    expect(await checksumJestPoprawny(backup)).toBe(true)
    await pobierzRepozytorium('zadania').zapisz({ ...(await pobierzRepozytorium('zadania').pobierz(zadanie.id))!, tytul: 'Mutacja zadania' })
    for (const tabela of ['notatki', 'skrzynka', 'leki', 'wizyty', 'rachunki', 'pojazdy', 'listyZakupow', 'pozycjeZakupow'] as const) {
      await baza.tabela(tabela).clear()
    }
    await repozytoriumUstawien.zapisz({ ...(await repozytoriumUstawien.wczytaj()), powiadomienia: false })

    const wynik = await przywrocBackup(backup)

    expect(await checksumJestPoprawny(wynik.backupPrzedPrzywracaniem)).toBe(true)
    expect(wynik.backupPrzedPrzywracaniem.manifest.backupType).toBe('before-restore')
    expect((await pobierzRepozytorium('zadania').lista())[0]).toMatchObject({ tytul: 'Recovery zadanie' })
    expect((await pobierzRepozytorium('notatki').lista())[0]).toMatchObject({ tytul: 'Recovery notatka' })
    expect((await pobierzRepozytorium('skrzynka').lista())[0]).toMatchObject({ tresc: 'Do rozpatrzenia' })
    expect((await pobierzRepozytorium('leki').lista())[0]).toMatchObject({ nazwa: 'Recovery lek' })
    expect((await pobierzRepozytorium('wizyty').lista())[0]).toMatchObject({ nazwa: 'Recovery wizyta' })
    expect((await pobierzRepozytorium('rachunki').lista())[0]).toMatchObject({ kwota: 150 })
    expect((await pobierzRepozytorium('pojazdy').lista())[0]).toMatchObject({ przebieg: 12345 })
    expect((await pobierzRepozytorium('listyZakupow').lista())[0]).toMatchObject({ nazwa: 'Recovery zakupy' })
    expect((await pobierzRepozytorium('pozycjeZakupow').lista())[0]).toMatchObject({ nazwa: 'Mleko' })
    expect((await repozytoriumUstawien.wczytaj()).powiadomienia).toBe(true)
  })

  it('migruje wspierany backup v1 do aktualnego formatu bez mutacji wejścia', async () => {
    const aktualny = await utworzBackup(['zadania'], () => STALA_DATA)
    const stary = await zmienManifest(aktualny, (manifest) => {
      manifest.formatVersion = 1
      delete manifest.dexieSchemaVersion
      delete manifest.backupType
    })
    const wejscie = JSON.stringify(stary)

    const zmigrowany = await przygotujBackupDoPrzywracania(wejscie)

    expect(JSON.stringify(stary)).toBe(wejscie)
    expect(zmigrowany.manifest).toMatchObject({
      formatVersion: WERSJA_FORMATU_BACKUPU,
      dexieSchemaVersion: WERSJA_SCHEMATU_BAZY,
      backupType: 'export',
    })
    expect(await checksumJestPoprawny(zmigrowany)).toBe(true)
  })

  it('zachowuje zgodność backupu v2 utworzonego na schemacie Dexie v4', async () => {
    const aktualny = await utworzBackup(['zadania'], () => STALA_DATA)
    const zEtapu9B = await zmienManifest(aktualny, (manifest) => {
      manifest.formatVersion = 2
      manifest.dexieSchemaVersion = 4
      delete manifest.installationId
    })

    const przygotowany = await przygotujBackupDoPrzywracania(JSON.stringify(zEtapu9B))

    expect(przygotowany.manifest.formatVersion).toBe(WERSJA_FORMATU_BACKUPU)
    expect(przygotowany.manifest.dexieSchemaVersion).toBe(4)
    expect(przygotowany.manifest.installationId).toMatch(/^legacy-/)
    expect(await checksumJestPoprawny(przygotowany)).toBe(true)
  })

  it('selektywny eksport nie zawiera niewybranych sekcji', async () => {
    const backup = await utworzBackup(['zadania'], () => STALA_DATA)
    expect(backup.manifest.sections).toEqual(['zadania'])
    expect(backup.payload).toHaveProperty('zadania')
    expect(backup.payload).not.toHaveProperty('notatki')
  })

  it('pomija tokeny i sekrety sesji', async () => {
    const zadanie = {
      ...utworzZadanie({ tytul: 'Bez sekretów', opis: '', priorytet: 'normalny' }),
      token: 'token-testowy',
      szczegoly: { secret: 'sekret-testowy', session: 'sesja-testowa', bezpieczne: 'zostaje' },
    } as Zadanie
    await pobierzRepozytorium('zadania').zapisz(zadanie)
    const json = JSON.stringify(await utworzBackup(['zadania'], () => STALA_DATA))

    expect(json).not.toContain('token-testowy')
    expect(json).not.toContain('sekret-testowy')
    expect(json).not.toContain('sesja-testowa')
    expect(json).toContain('zostaje')
  })
})

it('zachowuje checksum backupu bez secure context i Web Crypto', async () => {
  const dane = { manifest: { formatVersion: 1 }, payload: { tekst: 'Zażółć gęślą jaźń' } }
  const oczekiwany = await obliczChecksum(dane as never)
  vi.stubGlobal('crypto', undefined)
  try { expect(await obliczChecksum(dane as never)).toBe(oczekiwany) }
  finally { vi.unstubAllGlobals() }
})
