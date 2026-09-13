import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { DziennikLeku, Lek } from '../domain/typy'
import { dawkiZaplanowaneNaDzien, generujDawkiDnia, graniceLokalnegoDnia, idWystapieniaDawki, proponujGodzinyDawek, przewidywanaDataWyczerpania, zapiszStatusDawki } from './LekiService'

const lek: Lek = {
  ...utworzMetadane('lek-1'),
  nazwa: 'Lek testowy',
  dawkaInstrukcja: '1 tabletka',
  godziny: ['08:00', '20:00'],
  dawki: [
    { id: 'rano', godzina: '08:00', ilosc: 2, instrukcja: '2 tabletki' },
    { id: 'wieczor', godzina: '20:00', ilosc: 1, instrukcja: '1 tabletka' },
  ],
  aktywny: true,
}

describe('leki', () => {
  it('generuje dwie dawki jednego leku z ich własną ilością', () => {
    const dawki = generujDawkiDnia([lek], [], '2026-08-14')
    expect(dawki.map((dawka) => [dawka.planowanaGodzina, dawka.dawka.ilosc])).toEqual([['08:00', 2], ['20:00', 1]])
    expect(dawki.map((dawka) => dawka.dawka.id)).toEqual(['rano', 'wieczor'])
  })

  it('proponuje godziny wyłącznie w aktywnym oknie, bez północy', () => {
    const godziny = proponujGodzinyDawek(3, '07:00', '22:00')
    expect(godziny).toEqual(['07:00', '14:30', '22:00'])
    expect(godziny).not.toContain('00:00')
  })

  it('tworzy i zapisuje niezależne wystąpienia dawkowania co X godzin', () => {
    const interwalowy: Lek = {
      ...lek,
      id: 'lek-interwalowy',
      trybDawkowania: 'co_x_godzin',
      dataOd: '2026-08-14',
      interwalGodzin: 6,
      pierwszaGodzina: '20:00',
      dawki: [{ id: 'interwal', godzina: '20:00', ilosc: 1 }],
    }
    const dawki = generujDawkiDnia([interwalowy], [], '2026-08-15')
    expect(dawki.map((dawka) => dawka.planowanaGodzina)).toEqual(['02:00', '08:00', '14:00', '20:00'])
    expect(dawki).toHaveLength(4)
    expect(new Set(dawki.map((dawka) => dawka.idWystapienia)).size).toBe(4)

    const wpis0800 = zapiszStatusDawki(dawki.find((dawka) => dawka.planowanaGodzina === '08:00')!, 'zazyte')
    const poPierwszymZapisie = generujDawkiDnia([interwalowy], [wpis0800], '2026-08-15')
    expect(poPierwszymZapisie.map((dawka) => [dawka.planowanaGodzina, dawka.status])).toEqual([
      ['02:00', 'oczekuje'], ['08:00', 'zazyte'], ['14:00', 'oczekuje'], ['20:00', 'oczekuje'],
    ])

    const wpis1400 = zapiszStatusDawki(poPierwszymZapisie.find((dawka) => dawka.planowanaGodzina === '14:00')!, 'pominiete')
    expect(wpis1400.id).not.toBe(wpis0800.id)
    expect(generujDawkiDnia([interwalowy], [wpis0800, wpis1400], '2026-08-15').map((dawka) => dawka.status)).toEqual(['oczekuje', 'zazyte', 'pominiete', 'oczekuje'])
  })

  it('wyznacza lokalne granice dnia kalendarzowo podczas zmiany czasu', () => {
    const srodowisko = (globalThis as typeof globalThis & { process: { env: Record<string, string | undefined> } }).process.env
    const poprzedniaStrefa = srodowisko.TZ
    srodowisko.TZ = 'Europe/Warsaw'
    try {
      const granice = graniceLokalnegoDnia('2026-03-29')!
      expect(granice.od.getHours()).toBe(0)
      expect(granice.do.getHours()).toBe(0)
      expect((granice.do.getTime() - granice.od.getTime()) / 3_600_000).toBe(23)

      const interwalowy: Lek = { ...lek, id: 'lek-zmiana-czasu', trybDawkowania: 'co_x_godzin', dataOd: '2026-03-29', interwalGodzin: 6, pierwszaGodzina: '00:00', dawki: [{ id: 'interwal-zmiana-czasu', godzina: '00:00', ilosc: 1 }] }
      expect(dawkiZaplanowaneNaDzien(interwalowy, '2026-03-29').map((dawka) => dawka.godzina)).toEqual(['00:00', '07:00', '13:00', '19:00'])
    } finally {
      if (poprzedniaStrefa === undefined) delete srodowisko.TZ
      else srodowisko.TZ = poprzedniaStrefa
    }
  })

  it('rozdziela dwie dawki 02:00 podczas jesiennej zmiany czasu', () => {
    const srodowisko = (globalThis as typeof globalThis & { process: { env: Record<string, string | undefined> } }).process.env
    const poprzedniaStrefa = srodowisko.TZ
    srodowisko.TZ = 'Europe/Warsaw'
    try {
      const interwalowy: Lek = { ...lek, id: 'lek-jesienna-zmiana-czasu', trybDawkowania: 'co_x_godzin', dataOd: '2026-10-25', interwalGodzin: 1, pierwszaGodzina: '00:00', dawki: [{ id: 'interwal-jesien', godzina: '00:00', ilosc: 1 }] }
      const dawki = generujDawkiDnia([interwalowy], [], '2026-10-25')
      const dawki0200 = dawki.filter((dawka) => dawka.planowanaGodzina === '02:00')
      expect(dawki).toHaveLength(25)
      expect(dawki0200).toHaveLength(2)
      expect(dawki0200[0]!.idWystapienia).not.toBe(dawki0200[1]!.idWystapienia)

      const wpisPierwszej0200 = zapiszStatusDawki(dawki0200[0]!, 'zazyte')
      const poPierwszymZapisie = generujDawkiDnia([interwalowy], [wpisPierwszej0200], '2026-10-25').filter((dawka) => dawka.planowanaGodzina === '02:00')
      expect(poPierwszymZapisie.map((dawka) => dawka.status)).toEqual(['zazyte', 'oczekuje'])

      const wpisDrugiej0200 = zapiszStatusDawki(poPierwszymZapisie[1]!, 'pominiete')
      const statusy = (wpisy: DziennikLeku[]) => generujDawkiDnia([interwalowy], wpisy, '2026-10-25').filter((dawka) => dawka.planowanaGodzina === '02:00').map((dawka) => dawka.status)
      expect(statusy([wpisPierwszej0200, wpisDrugiej0200])).toEqual(['zazyte', 'pominiete'])
      expect(statusy([wpisDrugiej0200, wpisPierwszej0200])).toEqual(['zazyte', 'pominiete'])

      const wpisLegacy: DziennikLeku = { ...utworzMetadane('legacy-0200'), lekId: interwalowy.id, data: '2026-10-25', planowanaGodzina: '02:00', status: 'zazyte' }
      expect(statusy([wpisLegacy]).filter((status) => status === 'zazyte')).toHaveLength(1)

      const wpisWadliwegoModelu: DziennikLeku = { ...utworzMetadane(idWystapieniaDawki(interwalowy.id, '2026-10-25', 'interwal-jesien')), lekId: interwalowy.id, dawkaId: 'interwal-jesien', data: '2026-10-25', planowanaGodzina: '02:00', status: 'pominiete' }
      expect(statusy([wpisWadliwegoModelu]).filter((status) => status === 'pominiete')).toHaveLength(1)
    } finally {
      if (poprzedniaStrefa === undefined) delete srodowisko.TZ
      else srodowisko.TZ = poprzedniaStrefa
    }
  })

  it('liczy zapas z sumy rzeczywistych ilości dawek dnia', () => {
    expect(przewidywanaDataWyczerpania({ ...lek, zapasJednostek: 7 }, '2026-08-14')).toBe('2026-08-16')
  })

  it('odczytuje stary wpis bez dawkaId i zachowuje jego działanie', () => {
    const stary: Lek = { ...utworzMetadane('lek-stary'), nazwa: 'Stary lek', dawkaInstrukcja: '1 tabletka', godziny: ['08:00', '20:00'], zuzycieNaDawke: 1, aktywny: true }
    const wpis: DziennikLeku = { ...utworzMetadane('lek-stary:2026-08-14:08:00'), lekId: stary.id, data: '2026-08-14', planowanaGodzina: '08:00', status: 'zazyte' }
    const dawki = generujDawkiDnia([stary], [wpis], '2026-08-14')
    expect(dawki.map((dawka) => dawka.status)).toEqual(['zazyte', 'oczekuje'])
    expect(przewidywanaDataWyczerpania({ ...stary, zapasJednostek: 4 }, '2026-08-14')).toBe('2026-08-15')

    const bezIlosci = { ...stary, id: 'lek-bez-ilosci', zuzycieNaDawke: undefined }
    expect(generujDawkiDnia([bezIlosci], [], '2026-08-14')[0]?.dawka.ilosc).toBeUndefined()
    expect(przewidywanaDataWyczerpania({ ...bezIlosci, zapasJednostek: 4 }, '2026-08-14')).toBeUndefined()
  })

  it('wiąże historię ze stabilnym id dawki po zmianie przyszłej godziny', () => {
    const pierwsza = generujDawkiDnia([lek], [], '2026-08-14')[0]!
    const wpis = zapiszStatusDawki(pierwsza, 'zazyte')
    const poZmianieGodziny = { ...lek, dawki: [{ ...lek.dawki![0]!, godzina: '09:00' }, lek.dawki![1]!] }
    const odswiezona = generujDawkiDnia([poZmianieGodziny], [wpis], '2026-08-14')[0]!
    expect(odswiezona.planowanaGodzina).toBe('09:00')
    expect(odswiezona.status).toBe('zazyte')
    expect(odswiezona.wpis?.planowanaGodzina).toBe('08:00')
  })
})
