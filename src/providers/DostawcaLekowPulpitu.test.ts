import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { DziennikLeku, Lek, Przypomnienie } from '../domain/typy'
import { generujDawkiDnia, wyznaczNastepnaDawke, zapiszStatusDawki } from '../services/LekiService'
import { DostawcaLekowPulpitu } from './DostawcaLekowPulpitu'

const lek: Lek = {
  ...utworzMetadane('lek-1'),
  nazwa: 'Lek testowy',
  dawkaInstrukcja: '1 tabletka',
  godziny: ['08:00', '20:00'],
  aktywny: true,
}

const zrodlo = <Encja>(dane: () => Encja[]) => ({ lista: async () => dane() })

describe('Dostawca Leków Pulpitu', () => {
  it('tworzy stabilne wystąpienia z godziną, statusem i sourceRef rekordu źródłowego', async () => {
    const dostawca = new DostawcaLekowPulpitu(zrodlo(() => [lek]), zrodlo<DziennikLeku>(() => []), zrodlo<Przypomnienie>(() => []))
    const elementy = await dostawca.pobierzElementy({ od: '2026-08-28', do: '2026-08-28' })

    expect(elementy.map((element) => element.id)).toEqual([
      'lek:lek-1:2026-08-28:08:00',
      'lek:lek-1:2026-08-28:20:00',
    ])
    expect(elementy[1]).toMatchObject({
      data: '2026-08-28',
      godzina: '20:00',
      status: 'otwarty',
      referencjaZrodla: { modul: 'leki', encjaId: 'lek-1', wystapienieId: 'lek-1:2026-08-28:20:00' },
      dane: { statusDawki: 'oczekuje' },
    })
  })

  it('po ponownym query pokazuje status zażytej dawki bez tworzenia drugiego elementu', async () => {
    let wpisy: DziennikLeku[] = []
    const dostawca = new DostawcaLekowPulpitu(zrodlo(() => [lek]), zrodlo(() => wpisy), zrodlo<Przypomnienie>(() => []))
    const przed = await dostawca.pobierzElementy({ od: '2026-08-28', do: '2026-08-28' })
    wpisy = [zapiszStatusDawki(generujDawkiDnia([lek], [], '2026-08-28')[0]!, 'zazyte')]
    const po = await dostawca.pobierzElementy({ od: '2026-08-28', do: '2026-08-28' })

    expect(po[0]).toMatchObject({ id: przed[0]?.id, status: 'wykonany', dane: { statusDawki: 'zazyte' } })
  })

  it('wystawia jeden sygnał źródłowy, gdy zapas kończy się w ciągu tygodnia', async () => {
    const niskiZapas = { ...lek, zapasJednostek: 4, zuzycieNaDawke: 1 }
    const dostawca = new DostawcaLekowPulpitu(zrodlo(() => [niskiZapas]), zrodlo<DziennikLeku>(() => []), zrodlo<Przypomnienie>(() => []))

    const elementy = await dostawca.pobierzElementy({ od: '2026-08-28', do: '2026-08-28' })

    expect(elementy.filter((x) => x.dane?.rodzaj === 'zapas')).toMatchObject([{ id: 'lek-zapas:lek-1', data: '2026-08-29', referencjaZrodla: { modul: 'leki', encjaId: 'lek-1' } }])
  })

  it('wyznacza deterministycznie najbliższą przyszłą oczekującą dawkę', () => {
    const dawki = [
      ...generujDawkiDnia([lek], [], '2026-08-28'),
      ...generujDawkiDnia([lek], [], '2026-08-29'),
    ]

    expect(wyznaczNastepnaDawke(dawki, new Date('2026-08-28T12:00:00'))?.idWystapienia)
      .toBe('lek-1:2026-08-28:20:00')
  })
  it('uwzględnia czas odroczenia przy wyborze następnej dawki', () => {
    const dawki = generujDawkiDnia([lek], [], '2026-08-28')
    const odroczona = zapiszStatusDawki(dawki[0]!, 'odroczone', '2026-08-28T21:00:00')
    const odswiezone = generujDawkiDnia([lek], [odroczona], '2026-08-28')

    expect(wyznaczNastepnaDawke(odswiezone, new Date('2026-08-28T12:00:00'))?.idWystapienia)
      .toBe('lek-1:2026-08-28:20:00')
  })
})
