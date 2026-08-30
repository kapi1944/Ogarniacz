import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { utworzMetadane } from '../domain/fabryki'
import type { KonfiguracjaKafelkaPulpitu, Pojazd } from '../domain/typy'
import { elementyDlaKafelka } from '../modules/pulpit/logikaKafelkow'
import { DostawcaSamochoduPulpitu } from './DostawcaSamochoduPulpitu'

const zrodlo = <Encja>(dane: () => Encja[]) => ({ lista: async () => dane() })

function pojazd(zmiany: Partial<Pojazd> = {}): Pojazd {
  return {
    ...utworzMetadane('auto-1'),
    nazwa: 'Auto',
    ocDo: '2026-10-15',
    przegladDo: '2026-09-20',
    ...zmiany,
  }
}

describe('Dostawca Samochodu Pulpitu', () => {
  beforeEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
  })

  it('sortuje najbliższy termin, nie tworzy godziny i zachowuje sourceRef', async () => {
    const dostawca = new DostawcaSamochoduPulpitu(zrodlo(() => [pojazd()]))
    const elementy = await dostawca.pobierzElementy({ od: '2026-08-28', do: '2027-01-01' })

    expect(elementy[0]).toMatchObject({
      id: 'samochod:auto-1:przeglad',
      data: '2026-09-20',
      godzina: undefined,
      trybTerminu: 'bez_godziny',
      referencjaZrodla: { modul: 'samochod', encjaId: 'auto-1', wystapienieId: 'przeglad' },
    })
  })

  it('pokazuje najbliższy termin dalszy niż siedem dni, gdy bieżący zakres jest pusty', async () => {
    const elementy = await new DostawcaSamochoduPulpitu(zrodlo(() => [pojazd()]))
      .pobierzElementy({ od: '2026-08-28', do: '2030-01-01' })
    const kafelek: KonfiguracjaKafelkaPulpitu = {
      id: 'pulpit-samochod', typ: 'samochod', widoczny: true, kolejnosc: 0, rozmiar: 'medium', zakresCzasu: '7d', limit: 4,
    }

    expect(elementyDlaKafelka(kafelek, elementy, new Date('2026-08-28T12:00:00'))[0]?.data).toBe('2026-09-20')
  })

  it('po zmianie źródła i ponownym query pokazuje nowy termin', async () => {
    let pojazdy = [pojazd()]
    const dostawca = new DostawcaSamochoduPulpitu(zrodlo(() => pojazdy))
    expect((await dostawca.pobierzElementy({ od: '2026-08-28', do: '2027-01-01' }))[0]?.data).toBe('2026-09-20')

    pojazdy = [pojazd({ przegladDo: '2026-09-01' })]

    expect((await dostawca.pobierzElementy({ od: '2026-08-28', do: '2027-01-01' }))[0]?.data).toBe('2026-09-01')
  })

  it('utrwala, odczytuje, aktualizuje i usuwa pojazd w prawdziwym repository', async () => {
    const repozytorium = pobierzRepozytorium('pojazdy')
    const rekord = pojazd()
    await repozytorium.zapisz(rekord)
    expect(await repozytorium.pobierz(rekord.id)).toMatchObject({ nazwa: 'Auto', przegladDo: '2026-09-20' })

    await repozytorium.zapisz({ ...rekord, przebieg: 123_000 })
    expect(await repozytorium.pobierz(rekord.id)).toMatchObject({ przebieg: 123_000 })

    await repozytorium.usun(rekord.id)
    expect(await repozytorium.pobierz(rekord.id)).toBeUndefined()
  })
})
