import { describe, expect, it } from 'vitest'
import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import type { KonfiguracjaKafelkaPulpitu } from '../../domain/typy'
import {
  adresReferencjiZrodla,
  alertyKonfliktowTerminow,
  alertyLekow,
  alertyWizyt,
  deduplikujAlerty,
  elementyDlaKafelka,
  klasaRozmiaruKafelka,
  ograniczAlerty,
  poziomSmartSygnalu,
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

function dawka(status: ElementOgarniacza['status'] = 'otwarty'): ElementOgarniacza {
  return {
    id: 'lek:lek-1:2026-08-28:08:00',
    typ: 'lek',
    tytul: 'Lek',
    data: '2026-08-28',
    godzina: '08:00',
    status,
    referencjaZrodla: { modul: 'leki', encjaId: 'lek-1', wystapienieId: 'lek-1:2026-08-28:08:00' },
    dane: { lekId: 'lek-1', statusDawki: status === 'wykonany' ? 'zazyte' : 'oczekuje' },
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  }
}

function wizyta(): ElementOgarniacza {
  return {
    id: 'wizyta:wizyta-1',
    typ: 'wizyta',
    tytul: 'Dentysta',
    data: '2026-08-29',
    godzina: '10:00',
    status: 'otwarty',
    referencjaZrodla: { modul: 'wizyty', encjaId: 'wizyta-1' },
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  }
}
function alert(id: string, typ: AlertPulpitu['typ'], termin?: string, severity: AlertPulpitu['severity'] = 'warning', modul: AlertPulpitu['sourceRef']['modul'] = 'zadania'): AlertPulpitu {
  return {
    id,
    typ,
    severity,
    tytul: id,
    termin,
    sourceRef: { modul, encjaId: id },
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

  it('utrzymuje jeden deterministyczny ranking dla Zadania, Leku, Wizyty, Finansów, Samochodu i Zakupów', () => {
    const alerty = [
      alert('zadanie', 'near', '2026-08-29', 'warning', 'zadania'),
      alert('lek', 'near', '2026-08-29', 'warning', 'leki'),
      alert('wizyta', 'near', '2026-08-29', 'warning', 'wizyty'),
      alert('finanse', 'near', '2026-08-29', 'warning', 'rachunki'),
      alert('samochod', 'near', '2026-08-29', 'warning', 'samochod'),
      alert('zakupy', 'near', '2026-08-29', 'warning', 'zakupy'),
    ]

    const pierwszy = rangujAlerty(alerty)
    const drugi = rangujAlerty(alerty)
    expect(pierwszy.map((pozycja) => pozycja.id)).toEqual(['finanse', 'lek', 'samochod', 'wizyta', 'zadanie', 'zakupy'])
    expect(drugi).toEqual(pierwszy)
    expect(new Set(pierwszy.map((pozycja) => pozycja.sourceRef.modul))).toEqual(new Set(['zadania', 'leki', 'wizyty', 'rachunki', 'samochod', 'zakupy']))
  })

  it('deduplikuje sygnały jednego problemu źródłowego', () => {
    const pierwszy = alert('pierwszy', 'overdue')
    const duplikat = { ...alert('duplikat', 'overdue'), sourceRef: pierwszy.sourceRef }
    const innyProblem = { ...alert('asap', 'asap'), sourceRef: pierwszy.sourceRef }

    expect(deduplikujAlerty([pierwszy, duplikat])).toHaveLength(1)
    expect(deduplikujAlerty([pierwszy, innyProblem]).map((pozycja) => pozycja.typ)).toEqual(['asap'])
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

  it('udostępnia realne dane kafelków Leków i Wizyt z zachowaniem limitu', () => {
    expect(rozwiazDaneKafelka(kafelek({ typ: 'leki', zakresCzasu: 'today', limit: 1 }), [dawka(), wizyta()], dataReferencyjna)).toMatchObject({
      stan: 'dostepny',
      elementy: [{ typ: 'lek' }],
    })
    expect(rozwiazDaneKafelka(kafelek({ typ: 'wizyty', zakresCzasu: '3d', limit: 1 }), [dawka(), wizyta()], dataReferencyjna)).toMatchObject({
      stan: 'dostepny',
      elementy: [{ typ: 'wizyta' }],
    })
  })

  it('usuwa alert dawki po zmianie statusu na zażyta', () => {
    expect(alertyLekow([dawka()], dataReferencyjna)).toHaveLength(1)
    expect(alertyLekow([dawka('wykonany')], dataReferencyjna)).toHaveLength(0)
  })

  it('tworzy alert tylko dla bliskiej wizyty albo aktywnego przypomnienia', () => {
    expect(alertyWizyt([wizyta()], dataReferencyjna)).toHaveLength(1)
    expect(alertyWizyt([{ ...wizyta(), data: '2026-09-10' }], dataReferencyjna)).toHaveLength(0)
  })

  it('buduje adres źródłowy rekordu i konkretnego wystąpienia dawki', () => {
    expect(adresReferencjiZrodla(dawka().referencjaZrodla!))
      .toBe('/zdrowie/leki?element=lek-1&wystapienie=lek-1%3A2026-08-28%3A08%3A00')
    expect(adresReferencjiZrodla(wizyta().referencjaZrodla!)).toBe('/zdrowie/wizyty?element=wizyta-1')
    expect(adresReferencjiZrodla({ modul: 'rachunki', encjaId: 'rachunek-1' })).toBe('/rachunki?element=rachunek-1')
    expect(adresReferencjiZrodla({ modul: 'samochod', encjaId: 'auto-1' })).toBe('/samochod?element=auto-1')
    expect(adresReferencjiZrodla({ modul: 'zakupy', encjaId: 'lista-1' })).toBe('/zakupy?element=lista-1')
    expect(adresReferencjiZrodla({ modul: 'notatki', encjaId: 'notatka-1' })).toBe('/notatki?element=notatka-1')
    expect(adresReferencjiZrodla({ modul: 'skrzynka', encjaId: 'wpis-1' })).toBe('/skrzynka?element=wpis-1')
  })

  it('rozwiązuje klasy wszystkich rozmiarów kafelka', () => {
    expect(klasaRozmiaruKafelka('small')).toBe('strefa-pulpitu--small')
    expect(klasaRozmiaruKafelka('medium')).toBe('strefa-pulpitu--medium')
    expect(klasaRozmiaruKafelka('large')).toBe('strefa-pulpitu--large')
  })
  it('klasyfikuje poziom Smart Signals i wykrywa tylko nakładające się bloki z czasem trwania', () => {
    expect(poziomSmartSygnalu(alert('zalegle', 'overdue', undefined, 'critical'))).toBe('pilne')
    expect(poziomSmartSygnalu(alert('bliskie', 'near', undefined, 'warning'))).toBe('wazne')
    const [konflikt] = alertyKonfliktowTerminow([
      { ...element('pierwsze', '2026-08-28'), godzina: '10:00', czasTrwaniaMinuty: 60 },
      { ...element('drugie', '2026-08-28'), godzina: '10:30', czasTrwaniaMinuty: 30 },
      { ...element('pozniejsze', '2026-08-28'), godzina: '11:30', czasTrwaniaMinuty: 30 },
    ])
    expect(konflikt).toMatchObject({ typ: 'asap', severity: 'warning', opis: 'Nakłada się z: drugie' })
  })
})
