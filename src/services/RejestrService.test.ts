import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { RepozytoriumZdalneInMemory } from '../data/RepozytoriumZdalneInMemory'
import { utworzMetadane } from '../domain/fabryki'
import type { DefinicjaWlasnegoPolaRejestru } from '../domain/rejestr'
import { utworzZadanie } from './ZadaniaService'
import { obliczChecksum, przygotujBackupDoPrzywracania, przywrocBackup, utworzBackup } from './BackupService'
import { SyncEngine } from './SyncEngine'
import {
  archiwizujWlasnePoleRejestru,
  pobierzAktywneDefinicjePolRejestru,
  pobierzWidokiRejestru,
  utworzWlasnePoleRejestru,
  zapiszWidokRejestru,
  zmienDefinicjeWlasnegoPolaRejestru,
} from './RejestrService'

describe.sequential('trwałe definicje i widoki Rejestru', () => {
  beforeEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
  })

  afterEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
  })

  it('tworzy, zmienia i archiwizuje definicję bez zmiany jej stabilnego ID ani wartości rekordu', async () => {
    const definicja = await utworzWlasnePoleRejestru({ rejestrId: 'wydatki', etykieta: 'Producent', typ: 'tekst' })
    const zadanie = { ...utworzZadanie({ tytul: 'Stare dane', opis: '', priorytet: 'normalny' }), polaWlasne: { [definicja.id]: 'Zachowana wartość' } }
    await pobierzRepozytorium('zadania').zapisz(zadanie)

    const zmieniona = await zmienDefinicjeWlasnegoPolaRejestru(definicja.id, { etykieta: 'Marka', opcje: undefined, rolaSemantyczna: undefined })
    await archiwizujWlasnePoleRejestru(definicja.id)

    expect(zmieniona.id).toBe(definicja.id)
    expect(await pobierzAktywneDefinicjePolRejestru('wydatki')).toEqual([])
    expect((await pobierzRepozytorium('zadania').pobierz(zadanie.id))?.polaWlasne?.[definicja.id]).toBe('Zachowana wartość')
    expect(await pobierzRepozytorium('definicjeWlasnychPolRejestru').pobierz(definicja.id)).toMatchObject({ etykieta: 'Marka', aktywne: false, revision: 3 })
    expect(await baza.tabela('historiaZmian').toArray()).toEqual(expect.arrayContaining([
      expect.objectContaining({ modul: 'rejestr', typEncji: 'definicjeWlasnychPolRejestru', zmienionePola: expect.arrayContaining(['revision', 'aktywne']) }),
    ]))
  })

  it('odrzuca rolę semantyczną niezgodną z typem pola', async () => {
    await expect(utworzWlasnePoleRejestru({
      rejestrId: 'wydatki', etykieta: 'Nieprawidłowe', typ: 'tekst', rolaSemantyczna: 'semantyka:kwota',
    } as never)).rejects.toThrow('Rola semantyczna nie istnieje lub nie jest zgodna z typem pola.')
  })

  it('zapisuje i pobiera widoki dla wybranego rejestru', async () => {
    await zapiszWidokRejestru({ id: 'widok:wydatki:glowny', rejestrId: 'wydatki', nazwa: 'Główny', widocznePolaIds: ['system:nazwa'] })

    await expect(pobierzWidokiRejestru('wydatki')).resolves.toMatchObject([{
      id: 'widok:wydatki:glowny', nazwa: 'Główny', widocznePolaIds: ['system:nazwa'],
    }])
  })

  it('synchronizuje definicję własnego pola i wykrywa jej równoległy konflikt', async () => {
    const repozytorium = pobierzRepozytorium('definicjeWlasnychPolRejestru')
    const lokalna: DefinicjaWlasnegoPolaRejestru = {
      ...utworzMetadane('custom:konflikt'), id: 'custom:konflikt', rejestrId: 'wydatki', etykieta: 'Lokalna', typ: 'tekst', aktywne: true, revision: 1,
    }
    const zdalna = { ...lokalna, etykieta: 'Zdalna', updatedAt: '2026-09-15T12:00:00.000Z' }
    await repozytorium.zapisz(lokalna)
    const zdalne = new RepozytoriumZdalneInMemory()
    const silnik = new SyncEngine({ czyOnline: () => true, installationId: () => 'instalacja-lokalna', opoznieniePonowieniaMs: 0 })

    await expect(silnik.synchronizuj(zdalne)).resolves.toMatchObject({ stan: 'zsynchronizowano' })
    expect((await zdalne.pobierzWszystkie()).find((zmiana) => zmiana.tabela === 'definicjeWlasnychPolRejestru')).toMatchObject({ rekord: { id: lokalna.id } })

    await repozytorium.zapisz({ ...lokalna, etykieta: 'Lokalna po zmianie' })
    await zdalne.ustawZmiany([{ tabela: 'definicjeWlasnychPolRejestru', rekord: zdalna, installationId: 'instalacja-zdalna' }])

    await expect(silnik.synchronizuj(zdalne)).resolves.toMatchObject({ stan: 'konflikt', konflikty: 1 })
    expect(await baza.tabela('konfliktySynchronizacji').get(`definicjeWlasnychPolRejestru:${lokalna.id}`)).toMatchObject({
      lokalny: { etykieta: 'Lokalna po zmianie' }, zdalny: { etykieta: 'Zdalna' },
    })
  })

  it('odtwarza definicje i widoki z backupu v15 bez revision', async () => {
    const definicja = await utworzWlasnePoleRejestru({ rejestrId: 'wydatki', etykieta: 'Producent', typ: 'tekst' })
    await zapiszWidokRejestru({ id: 'widok:wydatki:backup', rejestrId: 'wydatki', nazwa: 'Backup', widocznePolaIds: [definicja.id] })
    const starszyBackup = await utworzBackup(['rejestr'])
    starszyBackup.manifest.dexieSchemaVersion = 15
    delete starszyBackup.payload.rejestr!.definicjeWlasnychPolRejestru[0].revision
    const { checksum: _checksum, ...manifest } = starszyBackup.manifest
    starszyBackup.manifest.checksum = await obliczChecksum({ manifest, payload: starszyBackup.payload })
    const backup = await przygotujBackupDoPrzywracania(JSON.stringify(starszyBackup))
    await baza.tabela('definicjeWlasnychPolRejestru').clear()
    await baza.tabela('widokiRejestru').clear()

    await przywrocBackup(backup, ['rejestr'])

    expect(await pobierzRepozytorium('definicjeWlasnychPolRejestru').pobierz(definicja.id)).toMatchObject({ etykieta: 'Producent', revision: 1 })
    expect(await pobierzWidokiRejestru('wydatki')).toMatchObject([{ id: 'widok:wydatki:backup' }])
  })
})
