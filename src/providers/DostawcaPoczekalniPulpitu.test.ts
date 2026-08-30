import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { ElementSkrzynki } from '../domain/typy'
import { alertyPoczekalni } from '../modules/pulpit/logikaKafelkow'
import { DostawcaPoczekalniPulpitu, PROG_STARZENIA_POCZEKALNI_DNI } from './DostawcaPoczekalniPulpitu'

const zrodlo = <Encja>(dane: () => Encja[]) => ({ lista: async () => dane() })
const wpis = (id: string, status: ElementSkrzynki['status'] = 'nowe', createdAt = '2026-08-20T10:00:00.000Z'): ElementSkrzynki => ({
  ...utworzMetadane(id),
  createdAt,
  updatedAt: createdAt,
  tresc: id,
  zrodlo: 'tekst',
  status,
})

describe('Dostawca Poczekalni Pulpitu', () => {
  it('liczy nieprzetworzone bez agregatów i duplikacji', async () => {
    const elementy = await new DostawcaPoczekalniPulpitu(zrodlo(() => [wpis('a'), wpis('b'), wpis('c', 'przetworzone')]))
      .pobierzElementy({ od: '2026-08-30', do: '2026-08-30' })
    expect(elementy.map((element) => element.id)).toEqual(['poczekalnia:a', 'poczekalnia:b'])
    expect(elementy[0]).toMatchObject({
      dane: { liczbaNieprzetworzonych: 2 },
      referencjaZrodla: { modul: 'skrzynka', encjaId: 'a' },
    })
    expect(elementy[0].data).toBeUndefined()
  })

  it('po przetworzeniu znika przy ponownym query', async () => {
    let elementyZrodla = [wpis('a')]
    const dostawca = new DostawcaPoczekalniPulpitu(zrodlo(() => elementyZrodla))
    expect(await dostawca.pobierzElementy({ od: '2026-08-30', do: '2026-08-30' })).toHaveLength(1)
    elementyZrodla = [wpis('a', 'przetworzone')]
    expect(await dostawca.pobierzElementy({ od: '2026-08-30', do: '2026-08-30' })).toHaveLength(0)
  })

  it('alarmuje dopiero po jawnej regule wieku', async () => {
    const dostawca = new DostawcaPoczekalniPulpitu(zrodlo(() => [
      wpis('stary', 'nowe', '2026-08-20T10:00:00.000Z'),
      wpis('nowy', 'nowe', '2026-08-29T10:00:00.000Z'),
    ]))
    const elementy = await dostawca.pobierzElementy({ od: '2026-08-30', do: '2026-08-30' })
    expect(PROG_STARZENIA_POCZEKALNI_DNI).toBe(7)
    expect(alertyPoczekalni(elementy, new Date('2026-08-30T12:00:00')).map((alert) => alert.sourceRef.encjaId)).toEqual(['stary'])
  })
})
