import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Budzet, Rachunek, Wydatek } from '../domain/typy'
import { alertyFinansow } from '../modules/pulpit/logikaKafelkow'
import { DostawcaFinansowPulpitu } from './DostawcaFinansowPulpitu'

const zrodlo = <Encja>(dane: () => Encja[]) => ({ lista: async () => dane() })
const brakWydatkow = zrodlo<Wydatek>(() => [])
const brakBudzetow = zrodlo<Budzet>(() => [])

function rachunek(zmiany: Partial<Rachunek> = {}): Rachunek {
  return {
    ...utworzMetadane('rachunek-1'),
    nazwa: 'Internet',
    kwota: 80,
    termin: '2026-08-27',
    status: 'niezaplacony',
    ...zmiany,
  }
}

describe('Dostawca Finansów Pulpitu', () => {
  it('nie wystawia zwykłego wydatku bez terminu płatności na oś', async () => {
    const wydatek: Wydatek = { ...utworzMetadane('wydatek-1'), kwota: 20, data: '2026-08-28', kategoria: 'Dom', opis: 'Zakup' }
    const dostawca = new DostawcaFinansowPulpitu(zrodlo<Rachunek>(() => []), zrodlo(() => [wydatek]), brakBudzetow)

    expect(await dostawca.pobierzElementy({ od: '2026-08-28', do: '2026-08-28' })).toEqual([])
  })

  it('generuje alert zaległej nieopłaconej płatności i zachowuje sourceRef', async () => {
    const dostawca = new DostawcaFinansowPulpitu(zrodlo(() => [rachunek()]), brakWydatkow, brakBudzetow)
    const elementy = await dostawca.pobierzElementy({ od: '2026-08-01', do: '2026-08-28' })
    const alerty = alertyFinansow(elementy, new Date('2026-08-28T12:00:00'))

    expect(elementy[0]).toMatchObject({
      id: 'platnosc:rachunek-1',
      godzina: undefined,
      referencjaZrodla: { modul: 'rachunki', encjaId: 'rachunek-1' },
    })
    expect(alerty).toMatchObject([{ typ: 'overdue', sourceRef: { modul: 'rachunki', encjaId: 'rachunek-1' } }])
  })

  it('nie generuje overdue alertu dla opłaconej płatności', async () => {
    const dostawca = new DostawcaFinansowPulpitu(zrodlo(() => [rachunek({ status: 'zaplacony' })]), brakWydatkow, brakBudzetow)
    const elementy = await dostawca.pobierzElementy({ od: '2026-08-01', do: '2026-08-28' })

    expect(alertyFinansow(elementy, new Date('2026-08-28T12:00:00'))).toEqual([])
  })

  it('po zmianie źródła i ponownym query usuwa reprezentację opłaconego rachunku', async () => {
    let rachunki = [rachunek()]
    const dostawca = new DostawcaFinansowPulpitu(zrodlo(() => rachunki), brakWydatkow, brakBudzetow)
    expect(await dostawca.pobierzElementy({ od: '2026-08-01', do: '2026-08-28' })).toHaveLength(1)

    rachunki = [rachunek({ status: 'zaplacony', updatedAt: '2026-08-28T13:00:00.000Z' })]
    expect(await dostawca.pobierzElementy({ od: '2026-08-01', do: '2026-08-28' })).toHaveLength(0)
  })

  it('używa wspólnego wykorzystania budżetu i alarmuje tylko dla bieżącego przekroczonego okresu', async () => {
    const wydatki: Wydatek[] = [{ ...utworzMetadane('wydatek-1'), kwota: 120, data: '2026-08-10', kategoria: 'Dom', opis: 'Zakup' }]
    const budzety: Budzet[] = [
      { ...utworzMetadane('budzet-1'), nazwa: 'Dom', kategoria: 'Dom', okres: '2026-08', limit: 100 },
      { ...utworzMetadane('budzet-stary'), nazwa: 'Stary', okres: '2026-07', limit: 1 },
    ]
    const dostawca = new DostawcaFinansowPulpitu(zrodlo<Rachunek>(() => []), zrodlo(() => wydatki), zrodlo(() => budzety))
    const elementy = await dostawca.pobierzElementy({ od: '2026-07-01', do: '2026-08-31' })

    expect(elementy.find((element) => element.id === 'budzet:budzet-1:2026-08')).toMatchObject({
      dane: { rodzaj: 'budzet', limit: 100, wydano: 120 },
      referencjaZrodla: { modul: 'finanse', encjaId: 'budzet-1' },
    })
    expect(alertyFinansow(elementy, new Date('2026-08-28T12:00:00')).map((alert) => alert.id))
      .toEqual(['budzet:budzet-1:2026-08-budget'])
  })
})
