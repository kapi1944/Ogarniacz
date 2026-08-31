import Dexie from 'dexie'
// Vitest uruchamia test w JSDOM, a fake-indexeddb potrzebuje natywnego Blob z Node.
// @ts-expect-error Projekt przeglądarkowy celowo nie dołącza globalnych typów Node.
import { Blob as BlobWezla } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze, WERSJA_SCHEMATU_BAZY } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { repozytoriumUstawien } from '../data/RepozytoriumUstawien'
import { utworzMetadane } from '../domain/fabryki'
import type { Dokument, ElementSkrzynki, Lek, ListaZakupow, Notatka, Pojazd, PozycjaZakupow, Projekt, Przypomnienie, Rachunek, Wizyta, Zadanie } from '../domain/typy'
import { utworzZadanie } from './ZadaniaService'
import { pobierzInstallationId } from './InstallationService'
import {
  checksumJestPoprawny,
  obliczChecksum,
  PODSTAWOWE_SEKCJE_BACKUPU,
  przygotujBackupDoPrzywracania,
  przywrocBackup,
  utworzBackup,
  WERSJA_FORMATU_BACKUPU,
  type OgarniaczBackup,
} from './BackupService'

const STALA_DATA = '2026-08-30T10:00:00.000Z'

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
    const poczekalnia: ElementSkrzynki = { ...utworzMetadane('recovery-poczekalnia'), tresc: 'Do rozpatrzenia', zrodlo: 'tekst', status: 'nowe' }
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
