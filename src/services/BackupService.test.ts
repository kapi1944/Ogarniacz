import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { baza, inicjalizujBaze, WERSJA_SCHEMATU_BAZY } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { utworzMetadane } from '../domain/fabryki'
import type { Notatka, Zadanie } from '../domain/typy'
import { utworzZadanie } from './ZadaniaService'
import {
  checksumJestPoprawny,
  obliczChecksum,
  przygotujBackupDoPrzywracania,
  przywrocBackup,
  SEKCJE_BACKUPU,
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
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
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
    expect(wynik.backupPrzedPrzywracaniem.manifest.sections).toEqual(SEKCJE_BACKUPU.map(({ nazwa }) => nazwa))
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
      formatVersion: 2,
      dexieSchemaVersion: WERSJA_SCHEMATU_BAZY,
      backupType: 'export',
    })
    expect(await checksumJestPoprawny(zmigrowany)).toBe(true)
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
