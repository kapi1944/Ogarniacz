import { it, expect } from 'vitest'
import { baza, ustawBazePrzedUruchomieniem, inicjalizujBaze } from '../data/BazaOgarniacza'
import { RejestrProfili, zarejestrujProfilSesji, otworzBazeProfilu, aktywujProfil } from '../data/ProfileLokalne'
import { utworzBackup, szyfrujBackup, odszyfrujBackup, przygotujBackupDoPrzywracania, przywrocBackup, obliczChecksum } from './BackupService'
import type { KontoUzytkownika } from './KontaService'
import { czyKontoZgodneZDanymiLokalnymi } from './KontaService'
import { pobierzKonfiguracjeRuntime } from './RuntimeConfigService'
import { utworzZadanie } from './ZadaniaService'

const konto = (id: string): KontoUzytkownika => ({ zalogowany: true, uzytkownikId: id, wlascicielId: id, email: id + '@example.test', rola: 'wlasciciel', granty: [], edytorzy: [] })
it('backup A działa w A, jest odrzucany w B i nie ujawnia tożsamości w kopercie szyfrowania', async () => {
  const poprzedniAdres = pobierzKonfiguracjeRuntime().syncApiUrl
  pobierzKonfiguracjeRuntime().syncApiUrl = 'https://serwer.test'
  const rejestr = new RejestrProfili('test-backup-profile-' + crypto.randomUUID())
  const a = await zarejestrujProfilSesji('https://serwer.test', konto('a'), rejestr)
  const b = await zarejestrujProfilSesji('https://serwer.test', konto('b'), rejestr)
  const bazaA = await otworzBazeProfilu(a)
  const bazaB = await otworzBazeProfilu(b)
  try {
    ustawBazePrzedUruchomieniem(bazaA)
    await aktywujProfil(a, rejestr); await inicjalizujBaze()
    await baza.tabela('zadania').put(utworzZadanie({ tytul: 'Prywatne A', opis: '', priorytet: 'normalny' }))
    expect(czyKontoZgodneZDanymiLokalnymi()).toBe(true)
    const kopia = await utworzBackup(['zadania'])
    expect(kopia.manifest.kontekst).toEqual({ serwer: a.serwer, wlascicielId: 'a' })
    const zaszyfrowana = await szyfrujBackup(kopia, 'Haslo-kopii-testowej')
    expect(JSON.stringify(zaszyfrowana)).not.toContain('serwer.test')
    const odczytana = await przygotujBackupDoPrzywracania(await odszyfrujBackup(JSON.stringify(zaszyfrowana), 'Haslo-kopii-testowej'))
    await przywrocBackup(odczytana)
    const stare = structuredClone(odczytana)
    delete stare.manifest.kontekst
    const { checksum: _checksum, ...manifest } = stare.manifest
    stare.manifest.checksum = await obliczChecksum({ manifest, payload: stare.payload })
    await expect(przywrocBackup(stare)).rejects.toMatchObject({ kod: 'MIGRACJA_STARSZEJ_KOPII' })
    await przywrocBackup(stare, stare.manifest.sections, { trybStarszejKopii: 'przypisz-do-aktywnego-profilu' })
    ustawBazePrzedUruchomieniem(bazaB)
    await aktywujProfil(b, rejestr); await inicjalizujBaze()
    const przed = await baza.tabela('zadania').toArray()
    await expect(przywrocBackup(odczytana)).rejects.toMatchObject({ kod: 'KONTEKST_PROFILU' })
    expect(await baza.tabela('zadania').toArray()).toEqual(przed)
    ustawBazePrzedUruchomieniem(await otworzBazeProfilu(a)); await aktywujProfil(a, rejestr)
    const daneAPrzed = await baza.tabela('zadania').toArray()
    await expect(przywrocBackup(odczytana, odczytana.manifest.sections, { poUtworzeniuKopii: async () => { throw new Error('Nie zapisano kopii') } })).rejects.toThrow('Nie zapisano')
    expect(await baza.tabela('zadania').toArray()).toEqual(daneAPrzed)
    await expect(przywrocBackup(odczytana, odczytana.manifest.sections, { poUtworzeniuKopii: async () => {
      ustawBazePrzedUruchomieniem(await otworzBazeProfilu(b)); await aktywujProfil(b, rejestr)
    } })).rejects.toMatchObject({ kod: 'KONTEKST_PROFILU' })
    expect(await baza.tabela('zadania').toArray()).toEqual(przed)
  } finally {
    pobierzKonfiguracjeRuntime().syncApiUrl = poprzedniAdres
    baza.close(); await bazaA.delete(); await bazaB.delete(); await rejestr.delete()
  }
})
