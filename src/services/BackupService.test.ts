import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { utworzMetadane } from '../domain/fabryki'
import type { Notatka, Zadanie } from '../domain/typy'
import { utworzZadanie } from './ZadaniaService'
import {
  checksumJestPoprawny,
  obliczChecksum,
  SEKCJE_BACKUPU,
  utworzBackup,
  WERSJA_FORMATU_BACKUPU,
  type ManifestBackupu,
} from './BackupService'

const STALA_DATA = '2026-08-30T10:00:00.000Z'

function utworzNotatke(tytul: string): Notatka {
  return { ...utworzMetadane(), tytul, tresc: 'Treść', tagi: [], powiazania: [] }
}

describe.sequential('wersjonowany backup', () => {
  beforeEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
  })

  it('buduje kompletny manifest formatu', async () => {
    const backup = await utworzBackup(['ustawienia', 'zadania'], () => STALA_DATA)

    expect(backup.manifest).toMatchObject({
      formatVersion: WERSJA_FORMATU_BACKUPU,
      createdAt: STALA_DATA,
      appVersion: '1.0.0',
      sections: ['ustawienia', 'zadania'],
      recordCounts: { ustawienia: 1, zadania: 0 },
      schemaVersions: { ustawienia: 1, zadania: 1 },
    })
    expect(backup.manifest.checksum).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('wylicza deterministyczny checksum niezależnie od kolejności kluczy JSON', async () => {
    const wspolnyManifest: Omit<ManifestBackupu, 'checksum'> = {
      formatVersion: 1,
      createdAt: STALA_DATA,
      appVersion: '1.0.0',
      sections: ['zadania'],
      recordCounts: { zadania: 1 },
      schemaVersions: { zadania: 1 },
    }
    const checksumA = await obliczChecksum({
      manifest: wspolnyManifest,
      payload: { zadania: { zadania: [{ id: '1', tytul: 'Test' }] } },
    })
    const checksumB = await obliczChecksum({
      manifest: { ...wspolnyManifest, schemaVersions: { zadania: 1 }, recordCounts: { zadania: 1 } },
      payload: { zadania: { zadania: [{ tytul: 'Test', id: '1' }] } },
    })

    expect(checksumB).toBe(checksumA)
  })

  it('wykrywa zmianę payloadu', async () => {
    await pobierzRepozytorium('zadania').zapisz(utworzZadanie({ tytul: 'Chronione', opis: '', priorytet: 'normalny' }))
    const backup = await utworzBackup(['zadania'], () => STALA_DATA)
    const zmieniony = structuredClone(backup)
    zmieniony.payload.zadania!.zadania[0].tytul = 'Zmienione'

    expect(await checksumJestPoprawny(backup)).toBe(true)
    expect(await checksumJestPoprawny(zmieniony)).toBe(false)
  })

  it('pełny backup zawiera rekordy rzeczywistych repozytoriów', async () => {
    await pobierzRepozytorium('zadania').zapisz(utworzZadanie({ tytul: 'Zadanie źródłowe', opis: '', priorytet: 'normalny' }))
    await pobierzRepozytorium('notatki').zapisz(utworzNotatke('Notatka źródłowa'))
    const backup = await utworzBackup(undefined, () => STALA_DATA)

    expect(backup.manifest.sections).toEqual(SEKCJE_BACKUPU.map(({ nazwa }) => nazwa))
    expect(backup.payload.zadania?.zadania).toEqual(expect.arrayContaining([expect.objectContaining({ tytul: 'Zadanie źródłowe' })]))
    expect(backup.payload.notatki?.notatki).toEqual(expect.arrayContaining([expect.objectContaining({ tytul: 'Notatka źródłowa' })]))
  })

  it('selektywny backup nie zawiera niewybranych sekcji', async () => {
    await pobierzRepozytorium('notatki').zapisz(utworzNotatke('Nie eksportuj'))
    const backup = await utworzBackup(['zadania'], () => STALA_DATA)

    expect(backup.manifest.sections).toEqual(['zadania'])
    expect(backup.payload).toHaveProperty('zadania')
    expect(backup.payload).not.toHaveProperty('notatki')
    expect(backup.manifest.recordCounts).not.toHaveProperty('notatki')
  })

  it('pomija tokeny, sekrety sesji i dane logowania', async () => {
    const zadanie = {
      ...utworzZadanie({ tytul: 'Bez sekretów', opis: '', priorytet: 'normalny' }),
      token: 'token-testowy',
      szczegoly: { secret: 'sekret-testowy', session: 'sesja-testowa', bezpieczne: 'zostaje' },
    } as Zadanie
    await pobierzRepozytorium('zadania').zapisz(zadanie)
    const backup = await utworzBackup(['zadania'], () => STALA_DATA)
    const json = JSON.stringify(backup)

    expect(json).not.toContain('token-testowy')
    expect(json).not.toContain('sekret-testowy')
    expect(json).not.toContain('sesja-testowa')
    expect(json).toContain('zostaje')
  })

  it('generowanie backupu nie zmienia repozytoriów', async () => {
    const repozytoriumZadan = pobierzRepozytorium('zadania')
    const repozytoriumNotatek = pobierzRepozytorium('notatki')
    await repozytoriumZadan.zapisz(utworzZadanie({ tytul: 'Niezmienione', opis: '', priorytet: 'normalny' }))
    await repozytoriumNotatek.zapisz(utworzNotatke('Też niezmieniona'))
    const przed = {
      zadania: await repozytoriumZadan.lista(),
      notatki: await repozytoriumNotatek.lista(),
    }

    await utworzBackup(undefined, () => STALA_DATA)

    expect(await repozytoriumZadan.lista()).toEqual(przed.zadania)
    expect(await repozytoriumNotatek.lista()).toEqual(przed.notatki)
  })
})
