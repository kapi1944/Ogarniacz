import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Przypomnienie, Wizyta } from '../domain/typy'
import { DostawcaWizytPulpitu } from './DostawcaWizytPulpitu'

const zrodlo = <Encja>(dane: () => Encja[]) => ({ lista: async () => dane() })

function wizyta(zmiany: Partial<Wizyta> = {}): Wizyta {
  return {
    ...utworzMetadane('wizyta-1'),
    nazwa: 'Dentysta',
    status: 'umowiona',
    data: '2026-08-30',
    godzina: '15:30',
    miejsce: 'Przychodnia',
    lekarzPlacowka: 'Gabinet A',
    notatka: 'Zabrać dokumenty',
    pytania: [],
    dokumentyIds: [],
    checklista: ['Dowód'],
    ...zmiany,
  }
}

describe('Dostawca Wizyt Pulpitu', () => {
  it('zwraca termin, metadata, przypomnienie i sourceRef wizyty', async () => {
    const przypomnienie: Przypomnienie = {
      ...utworzMetadane('przypomnienie-1'),
      tytul: 'Dentysta',
      zrodlo: { typ: 'wizyty', id: 'wizyta-1' },
      typ: 'wzgledne',
      czas: '2026-08-30T15:30:00',
      przesuniecieMin: 60,
      priorytet: 'wysoki',
      stan: 'nowe',
      eskalacja: false,
    }
    const dostawca = new DostawcaWizytPulpitu(zrodlo(() => [wizyta()]), zrodlo(() => [przypomnienie]))
    const [element] = await dostawca.pobierzElementy({ od: '2026-08-28', do: '2026-09-03' })

    expect(element).toMatchObject({
      id: 'wizyta:wizyta-1',
      data: '2026-08-30',
      godzina: '15:30',
      trybTerminu: 'o_godzinie',
      referencjaZrodla: { modul: 'wizyty', encjaId: 'wizyta-1' },
      przypomnienia: [{ id: 'przypomnienie-1', aktywne: true }],
      dane: { miejsce: 'Przychodnia', lekarzPlacowka: 'Gabinet A', liczbaElementowChecklisty: 1 },
    })
  })

  it('po update i requery pokazuje nową godzinę bez starej kopii', async () => {
    let wizyty = [wizyta()]
    const dostawca = new DostawcaWizytPulpitu(zrodlo(() => wizyty), zrodlo<Przypomnienie>(() => []))
    const przed = await dostawca.pobierzElementy({ od: '2026-08-30', do: '2026-08-30' })
    wizyty = [wizyta({ godzina: '16:00', updatedAt: '2026-08-29T10:00:00.000Z' })]
    const po = await dostawca.pobierzElementy({ od: '2026-08-30', do: '2026-08-30' })

    expect(przed.map((element) => element.godzina)).toEqual(['15:30'])
    expect(po.map((element) => element.godzina)).toEqual(['16:00'])
    expect(po[0]?.id).toBe(przed[0]?.id)
  })

  it('nie wymyśla godziny dla wizyty posiadającej wyłącznie datę', async () => {
    const dostawca = new DostawcaWizytPulpitu(zrodlo(() => [wizyta({ godzina: undefined })]), zrodlo<Przypomnienie>(() => []))
    const [element] = await dostawca.pobierzElementy({ od: '2026-08-30', do: '2026-08-30' })

    expect(element).toMatchObject({ godzina: undefined, trybTerminu: 'bez_godziny' })
  })
})
