import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Notatka } from '../domain/typy'
import { DostawcaNotatekPulpitu } from './DostawcaNotatekPulpitu'

const zrodlo = <Encja>(dane: () => Encja[]) => ({ lista: async () => dane() })
const notatka = (zmiany: Partial<Notatka> = {}): Notatka => ({
  ...utworzMetadane('notatka-1'),
  tytul: 'Notatka',
  tresc: 'Treść',
  tagi: [],
  powiazania: [],
  ...zmiany,
})

describe('Dostawca Notatek Pulpitu', () => {
  it('nie używa createdAt ani updatedAt jako terminu zwykłej notatki', async () => {
    const element = (await new DostawcaNotatekPulpitu(zrodlo(() => [notatka({
      createdAt: '2026-08-30T10:00:00.000Z',
      updatedAt: '2026-08-30T12:00:00.000Z',
    })])).pobierzElementy({ od: '2026-08-30', do: '2026-08-30' }))[0]

    expect(element).toMatchObject({ data: undefined, godzina: undefined, trybTerminu: undefined })
  })

  it('wystawia prawdziwe date+time i sourceRef notatki', async () => {
    const element = (await new DostawcaNotatekPulpitu(zrodlo(() => [notatka({ data: '2026-08-30', godzina: '14:30' })]))
      .pobierzElementy({ od: '2026-08-30', do: '2026-08-30' }))[0]

    expect(element).toMatchObject({
      id: 'notatka:notatka-1',
      data: '2026-08-30',
      godzina: '14:30',
      trybTerminu: 'o_godzinie',
      referencjaZrodla: { modul: 'notatki', encjaId: 'notatka-1' },
    })
  })

  it('po zmianie źródła i ponownym query aktualizuje reprezentację', async () => {
    let notatki = [notatka()]
    const dostawca = new DostawcaNotatekPulpitu(zrodlo(() => notatki))
    expect((await dostawca.pobierzElementy({ od: '2026-08-30', do: '2026-08-30' }))[0]?.tytul).toBe('Notatka')
    notatki = [notatka({ tytul: 'Zmieniona', data: '2026-08-30' })]
    expect((await dostawca.pobierzElementy({ od: '2026-08-30', do: '2026-08-30' }))[0]).toMatchObject({ tytul: 'Zmieniona', godzina: undefined })
  })
})
