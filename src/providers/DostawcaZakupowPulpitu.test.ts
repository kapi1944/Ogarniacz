import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { ListaZakupow, PozycjaZakupow } from '../domain/typy'
import { DostawcaZakupowPulpitu } from './DostawcaZakupowPulpitu'

const zrodlo = <Encja>(dane: () => Encja[]) => ({ lista: async () => dane() })

function lista(zmiany: Partial<ListaZakupow> = {}): ListaZakupow {
  return { ...utworzMetadane('lista-1'), nazwa: 'Spożywcze', aktywna: true, ...zmiany }
}

function pozycja(id: string, kupione: boolean): PozycjaZakupow {
  return { ...utworzMetadane(id), listaId: 'lista-1', nazwa: id, ilosc: '1', kupione }
}

describe('Dostawca Zakupów Pulpitu', () => {
  it('zwraca aktywną listę bez daty bez sztucznej godziny i z sourceRef', async () => {
    const dostawca = new DostawcaZakupowPulpitu(zrodlo(() => [lista()]), zrodlo<PozycjaZakupow>(() => []))
    const elementy = await dostawca.pobierzElementy({ od: '2026-08-28', do: '2026-09-03' })

    expect(elementy).toMatchObject([{
      id: 'zakupy:lista-1',
      data: undefined,
      godzina: undefined,
      referencjaZrodla: { modul: 'zakupy', encjaId: 'lista-1' },
    }])
  })

  it('lista tylko z datą nie dostaje sztucznego 00:00', async () => {
    const dostawca = new DostawcaZakupowPulpitu(zrodlo(() => [lista({ planowanaData: '2026-08-30' })]), zrodlo<PozycjaZakupow>(() => []))

    expect((await dostawca.pobierzElementy({ od: '2026-08-28', do: '2026-09-03' }))[0])
      .toMatchObject({ data: '2026-08-30', godzina: undefined, trybTerminu: 'bez_godziny' })
  })

  it('agreguje pozycje w jedną listę i liczy kupione oraz pozostałe', async () => {
    const pozycje = [pozycja('mleko', true), pozycja('chleb', false), pozycja('kawa', false)]
    const dostawca = new DostawcaZakupowPulpitu(zrodlo(() => [lista()]), zrodlo(() => pozycje))
    const elementy = await dostawca.pobierzElementy({ od: '2026-08-28', do: '2026-09-03' })

    expect(elementy).toHaveLength(1)
    expect(elementy[0]?.dane).toEqual({ listaId: 'lista-1', liczbaPozycji: 3, kupione: 1, pozostalo: 2 })
  })

  it('po zmianie pozycji i ponownym query aktualizuje licznik bez tworzenia kopii listy', async () => {
    let pozycje = [pozycja('mleko', false)]
    const dostawca = new DostawcaZakupowPulpitu(zrodlo(() => [lista()]), zrodlo(() => pozycje))
    expect((await dostawca.pobierzElementy({ od: '2026-08-28', do: '2026-09-03' }))[0]?.dane?.pozostalo).toBe(1)

    pozycje = [pozycja('mleko', true)]
    const poZmianie = await dostawca.pobierzElementy({ od: '2026-08-28', do: '2026-09-03' })
    expect(poZmianie).toHaveLength(1)
    expect(poZmianie[0]?.dane).toMatchObject({ kupione: 1, pozostalo: 0 })
  })
})
