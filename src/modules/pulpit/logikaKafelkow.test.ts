import { describe, expect, it } from 'vitest'
import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import type { KonfiguracjaKafelkaPulpitu } from '../../domain/typy'
import {
  deduplikujAlerty,
  elementyDlaKafelka,
  klasaRozmiaruKafelka,
  ograniczAlerty,
  rangujAlerty,
  rozwiazDaneKafelka,
  rozwiazZakresKafelka,
  sortujKafelki,
  type AlertPulpitu,
} from './logikaKafelkow'

const dataReferencyjna = new Date(2026, 7, 28, 12)

function kafelek(zmiany: Partial<KonfiguracjaKafelkaPulpitu> = {}): KonfiguracjaKafelkaPulpitu {
  return {
    id: 'pulpit-zadania',
    typ: 'zadania',
    widoczny: true,
    kolejnosc: 0,
    rozmiar: 'medium',
    zakresCzasu: '7d',
    limit: 4,
    ...zmiany,
  }
}

function element(id: string, data: string): ElementOgarniacza {
  return {
    id,
    typ: 'zadanie',
    tytul: id,
    data,
    status: 'otwarty',
    referencjaZrodla: { modul: 'zadania', encjaId: id },
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  }
}

function alert(id: string, typ: AlertPulpitu['typ'], termin?: string, severity: AlertPulpitu['severity'] = 'warning'): AlertPulpitu {
  return {
    id,
    typ,
    severity,
    tytul: id,
    termin,
    sourceRef: { modul: 'zadania', encjaId: id },
    createdAt: '2026-08-28T08:00:00.000Z',
  }
}

describe('logika kafelków Pulpitu', () => {
  it.each([
    ['today', '2026-08-28'],
    ['3d', '2026-08-30'],
    ['7d', '2026-09-03'],
    ['30d', '2026-09-26'],
  ] as const)('wyznacza zakres %s względem daty referencyjnej', (zakresCzasu, oczekiwanyKoniec) => {
    expect(rozwiazZakresKafelka(kafelek({ zakresCzasu }), dataReferencyjna)).toEqual({
      od: '2026-08-28',
      do: oczekiwanyKoniec,
    })
  })

  it('nie uzależnia zakresu kafelka od wybranej daty osi', () => {
    const wybranaDataOsi = '2026-09-15'
    const wynik = elementyDlaKafelka(
      kafelek({ zakresCzasu: '7d', limit: 10 }),
      [element('koniec-zakresu', '2026-09-03'), element('data-osi', wybranaDataOsi)],
      dataReferencyjna,
    )

    expect(wynik.map((pozycja) => pozycja.id)).toEqual(['koniec-zakresu'])
  })

  it('rankuje zaległe, ASAP i bliskie terminy deterministycznie', () => {
    const alerty = [
      alert('informacja', 'near', undefined, 'info'),
      alert('pozniejsze-ostrzezenie', 'near', '2026-08-30T12:00:00', 'warning'),
      alert('za-godzine', 'near', '2026-08-28T13:00:00'),
      alert('asap', 'asap', '2026-09-10T12:00:00'),
      alert('zalegle', 'overdue', '2026-08-27T12:00:00', 'critical'),
    ]

    const pierwszyWynik = rangujAlerty(alerty).map((pozycja) => pozycja.id)
    const drugiWynik = rangujAlerty(alerty).map((pozycja) => pozycja.id)

    expect(pierwszyWynik).toEqual(['zalegle', 'asap', 'za-godzine', 'pozniejsze-ostrzezenie', 'informacja'])
    expect(drugiWynik).toEqual(pierwszyWynik)
  })

  it('deduplikuje ten sam problem źródła, ale zachowuje różne typy problemów', () => {
    const pierwszy = alert('pierwszy', 'overdue')
    const duplikat = { ...alert('duplikat', 'overdue'), sourceRef: pierwszy.sourceRef }
    const innyProblem = { ...alert('asap', 'asap'), sourceRef: pierwszy.sourceRef }

    expect(deduplikujAlerty([pierwszy, duplikat])).toHaveLength(1)
    expect(deduplikujAlerty([pierwszy, innyProblem]).map((pozycja) => pozycja.typ)).toEqual(['overdue', 'asap'])
  })

  it('ogranicza alerty bez utraty pełnej listy i udostępnia wszystkie po rozwinięciu', () => {
    const alerty = Array.from({ length: 8 }, (_, indeks) => alert(`alert-${indeks}`, 'near'))
    const zwiniete = ograniczAlerty(alerty, 4, false)
    const rozwiniete = ograniczAlerty(alerty, 4, true)

    expect(zwiniete.widoczne).toHaveLength(4)
    expect(zwiniete.pelnaLista).toHaveLength(8)
    expect(zwiniete.pozostalo).toBe(4)
    expect(rozwiniete.widoczne).toHaveLength(8)
    expect(rozwiniete.pozostalo).toBe(0)
  })

  it('sortuje tylko widoczne kafelki i rozstrzyga duplikaty kolejności stabilnie', () => {
    const konfiguracja = [
      kafelek({ id: 'b', kolejnosc: 1 }),
      kafelek({ id: 'ukryty', kolejnosc: 0, widoczny: false }),
      kafelek({ id: 'pierwszy', typ: 'pilne', kolejnosc: 0 }),
      kafelek({ id: 'a', kolejnosc: 1 }),
    ]

    expect(sortujKafelki(konfiguracja).map((pozycja) => pozycja.id)).toEqual(['pierwszy', 'a', 'b'])
    expect(sortujKafelki(konfiguracja).map((pozycja) => pozycja.id)).toEqual(sortujKafelki(konfiguracja).map((pozycja) => pozycja.id))
  })

  it('zwraca neutralny stan bez danych dla kafelka bez providera', () => {
    expect(() => rozwiazDaneKafelka(kafelek({ typ: 'leki' }), [element('zadanie', '2026-08-28')], dataReferencyjna)).not.toThrow()
    expect(rozwiazDaneKafelka(kafelek({ typ: 'leki' }), [element('zadanie', '2026-08-28')], dataReferencyjna)).toEqual({
      stan: 'niedostepny',
      elementy: [],
    })
  })

  it('rozwiązuje klasy wszystkich rozmiarów kafelka', () => {
    expect(klasaRozmiaruKafelka('small')).toBe('strefa-pulpitu--small')
    expect(klasaRozmiaruKafelka('medium')).toBe('strefa-pulpitu--medium')
    expect(klasaRozmiaruKafelka('large')).toBe('strefa-pulpitu--large')
  })
})
