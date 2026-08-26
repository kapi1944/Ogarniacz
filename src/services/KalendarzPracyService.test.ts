import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Urlop } from '../domain/typy'
import { czyPolskieSwieto, dataWielkanocy, pobierzPolskieSwieto } from './PolskieSwietaService'
import { czyDataWUrlopie, czyZakresySieNakladaja } from './UrlopyService'

describe('polskie święta', () => {
  it('wylicza święta ruchome dla 2026 roku', () => {
    expect(dataWielkanocy(2026)).toBe('2026-04-05')
    expect(pobierzPolskieSwieto('2026-04-06')?.nazwa).toBe('Poniedziałek Wielkanocny')
    expect(pobierzPolskieSwieto('2026-05-24')?.nazwa).toContain('Zielone Świątki')
    expect(pobierzPolskieSwieto('2026-06-04')?.nazwa).toBe('Boże Ciało')
  })

  it('uwzględnia Wigilię od 2025 roku', () => {
    expect(czyPolskieSwieto('2024-12-24')).toBe(false)
    expect(pobierzPolskieSwieto('2026-12-24')?.nazwa).toBe('Wigilia Bożego Narodzenia')
  })

  it('używa polskich nazw świąt', () => {
    expect(pobierzPolskieSwieto('2026-11-11')?.nazwa).toBe('Narodowe Święto Niepodległości')
  })
})

describe('urlopy', () => {
  const urlop: Urlop = {
    ...utworzMetadane('urlop-test'),
    dataOd: '2026-08-17',
    dataDo: '2026-08-21',
    typ: 'wypoczynkowy',
    status: 'potwierdzony',
    opis: 'Test',
  }

  it('rozpoznaje datę w zakresie urlopu', () => {
    expect(czyDataWUrlopie(urlop, '2026-08-19')).toBe(true)
    expect(czyDataWUrlopie(urlop, '2026-08-22')).toBe(false)
  })

  it('ignoruje urlop anulowany', () => {
    expect(czyDataWUrlopie({ ...urlop, status: 'anulowany' }, '2026-08-19')).toBe(false)
  })

  it('wykrywa nakładające się zakresy', () => {
    expect(czyZakresySieNakladaja(urlop, { dataOd: '2026-08-21', dataDo: '2026-08-25' })).toBe(true)
    expect(czyZakresySieNakladaja(urlop, { dataOd: '2026-08-22', dataDo: '2026-08-25' })).toBe(false)
  })
})
