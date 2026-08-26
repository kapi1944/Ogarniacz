import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { eksportujKopie, importujKopie, walidujKopie } from './BackupService'
import { utworzZadanie } from './ZadaniaService'

describe.sequential('backup', () => {
  beforeEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
  })

  it('eksportuje wszystkie tabele i ustawienia', async () => {
    await pobierzRepozytorium('zadania').zapisz(utworzZadanie({ tytul: 'Kopia', opis: '', priorytet: 'normalny' }))
    const kopia = await eksportujKopie()
    expect(kopia.dane.zadania).toHaveLength(1)
    expect(kopia.dane.ustawienia).toHaveLength(1)
  })

  it('importuje prawidłową kopię przez scalanie', async () => {
    const zadanie = utworzZadanie({ tytul: 'Do importu', opis: '', priorytet: 'normalny' })
    const kopia = await eksportujKopie()
    kopia.dane.zadania = [zadanie as unknown as Record<string, unknown>]
    await importujKopie(kopia, 'scal')
    expect((await pobierzRepozytorium('zadania').lista())[0]?.tytul).toBe('Do importu')
  })

  it('odrzuca błędną wersję formatu danych', () => {
    expect(() => walidujKopie({ format: 'ogarniacz-backup', wersja: 99, wersjaBazy: 2, wyeksportowanoAt: new Date().toISOString(), dane: {} })).toThrow()
  })
})
