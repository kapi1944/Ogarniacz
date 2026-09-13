import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { DziennikLeku, Lek } from '../domain/typy'
import { dawkiZaplanowaneNaDzien, generujDawkiDnia, proponujGodzinyDawek, przewidywanaDataWyczerpania, zapiszStatusDawki } from './LekiService'

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

  it('generuje dawkowanie co X godzin również przez noc', () => {
    const interwalowy: Lek = {
      ...lek,
      id: 'lek-interwalowy',
      trybDawkowania: 'co_x_godzin',
      dataOd: '2026-08-14',
      interwalGodzin: 6,
      pierwszaGodzina: '20:00',
      dawki: [{ id: 'interwal', godzina: '20:00', ilosc: 1 }],
    }
    expect(dawkiZaplanowaneNaDzien(interwalowy, '2026-08-15').map((dawka) => dawka.godzina)).toEqual(['02:00', '08:00', '14:00', '20:00'])
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
