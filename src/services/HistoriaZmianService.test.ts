import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { utworzMetadane } from '../domain/fabryki'
import type { Lek, Pojazd, Rachunek } from '../domain/typy'
import { DostawcaFinansowPulpitu } from '../providers/DostawcaFinansowPulpitu'
import { checksumJestPoprawny, utworzBackup } from './BackupService'
import { pobierzNajnowszaHistorie } from './HistoriaZmianService'

function utworzRachunek(): Rachunek {
  return { ...utworzMetadane('rachunek-historia'), nazwa: 'Prąd', kwota: 120, termin: '2026-09-10', status: 'niezaplacony' }
}

function utworzLek(): Lek {
  return { ...utworzMetadane('lek-historia'), nazwa: 'Lek', dawkaInstrukcja: '1 tabletka', godziny: ['08:00'], aktywny: true }
}

describe.sequential('historia ważnych zmian', () => {
  beforeEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
  })

  it('create, update i delete ważnego rekordu tworzą właściwe wpisy', async () => {
    const repozytorium = pobierzRepozytorium('rachunki')
    const rachunek = utworzRachunek()
    await repozytorium.zapisz(rachunek)
    await repozytorium.zapisz({ ...rachunek, status: 'zaplacony' })
    await repozytorium.usun(rachunek.id)

    const wpisy = (await baza.tabela('historiaZmian').toArray()).filter((wpis) => wpis.encjaId === rachunek.id)
    expect(wpisy.map((wpis) => wpis.operacja)).toEqual(expect.arrayContaining(['utworzenie', 'aktualizacja', 'usuniecie']))
    expect(wpisy.find((wpis) => wpis.operacja === 'aktualizacja')).toMatchObject({
      zmienionePola: ['status'],
      przed: { status: 'niezaplacony' },
      po: { status: 'zaplacony' },
    })
    expect(wpisy.find((wpis) => wpis.operacja === 'usuniecie')?.zmienionePola).toEqual(['usunietoAt'])
  })

  it('update zapisuje tylko rzeczywiście zmienione pola', async () => {
    const repozytorium = pobierzRepozytorium('pojazdy')
    const pojazd: Pojazd = { ...utworzMetadane('pojazd-historia'), nazwa: 'Auto', przebieg: 1000, ocDo: '2027-01-01' }
    await repozytorium.zapisz(pojazd)
    await repozytorium.zapisz({ ...pojazd, przebieg: 1200 })

    const aktualizacja = (await baza.tabela('historiaZmian').toArray()).find((wpis) => wpis.operacja === 'aktualizacja')
    expect(aktualizacja).toMatchObject({
      zmienionePola: ['przebieg'],
      przed: { przebieg: 1000 },
      po: { przebieg: 1200 },
    })
  })

  it('zwykły read i query providera Pulpitu nie tworzą historii', async () => {
    const repozytorium = pobierzRepozytorium('rachunki')
    await repozytorium.zapisz(utworzRachunek())
    const liczbaPrzed = await baza.tabela('historiaZmian').count()

    await repozytorium.lista()
    await repozytorium.pobierz('rachunek-historia')
    await new DostawcaFinansowPulpitu().pobierzElementy({ od: '2026-09-01', do: '2026-09-30' })

    expect(await baza.tabela('historiaZmian').count()).toBe(liczbaPrzed)
  })

  it('historia nie zawiera sekretów ani blobów', async () => {
    const pojazd = {
      ...utworzMetadane('pojazd-sekrety'),
      nazwa: 'Auto',
      token: 'tajny-token',
      sekret: 'tajny-sekret',
      plik: new Blob(['duże dane']),
    } as Pojazd
    await pobierzRepozytorium('pojazdy').zapisz(pojazd)
    const json = JSON.stringify(await pobierzNajnowszaHistorie())

    expect(json).not.toContain('tajny-token')
    expect(json).not.toContain('tajny-sekret')
    expect(json).not.toContain('duże dane')
  })

  it('limit widoku nie usuwa historii finansowej ani zdrowotnej', async () => {
    await pobierzRepozytorium('rachunki').zapisz(utworzRachunek())
    await pobierzRepozytorium('leki').zapisz(utworzLek())

    expect(await pobierzNajnowszaHistorie(1)).toHaveLength(1)
    const wszystkie = await baza.tabela('historiaZmian').toArray()
    expect(wszystkie).toHaveLength(2)
    expect(wszystkie.map((wpis) => wpis.modul)).toEqual(expect.arrayContaining(['finanse', 'leki']))
  })

  it('historia jest opcjonalną sekcją backupu', async () => {
    await pobierzRepozytorium('rachunki').zapisz(utworzRachunek())

    const podstawowy = await utworzBackup()
    const zHistoria = await utworzBackup(['historia'])

    expect(podstawowy.manifest.sections).not.toContain('historia')
    expect(zHistoria.payload.historia?.historiaZmian).toHaveLength(1)
    expect(await checksumJestPoprawny(zHistoria)).toBe(true)
  })
})
