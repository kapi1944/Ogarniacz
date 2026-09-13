import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Urlop } from '../domain/typy'
import { czyPolskieSwieto, dataWielkanocy, pobierzPolskieSwieto } from './PolskieSwietaService'
import { ustalDostepnoscDniaPracy } from './KalendarzPracyService'
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

describe('dostępność dnia pracy', () => {
  const urlop: Urlop = {
    ...utworzMetadane('urlop-l4'),
    dataOd: '2026-09-14',
    dataDo: '2026-09-16',
    typ: 'chorobowe',
    status: 'potwierdzony',
  }

  it('pozostawia standardowy dzień pracy bez wolnego', () => {
    expect(ustalDostepnoscDniaPracy('2026-09-14', true, undefined, [])).toMatchObject({ pracuje: true, powod: 'grafik' })
  })

  it('wyłącza pracę przez potwierdzone L4 także w środku zakresu', () => {
    expect(ustalDostepnoscDniaPracy('2026-09-15', true, undefined, [urlop])).toMatchObject({ pracuje: false, powod: 'urlop' })
  })

  it('wyłącza pracę przez urlop wypoczynkowy, ale ignoruje anulowany', () => {
    expect(ustalDostepnoscDniaPracy('2026-09-14', true, undefined, [{ ...urlop, typ: 'wypoczynkowy' }]).pracuje).toBe(false)
    expect(ustalDostepnoscDniaPracy('2026-09-14', true, undefined, [{ ...urlop, status: 'anulowany' }]).pracuje).toBe(true)
  })

  it('wyłącza pracę w polskie święto', () => {
    expect(ustalDostepnoscDniaPracy('2026-11-11', true, undefined, [])).toMatchObject({ pracuje: false, powod: 'swieto' })
  })

  it('nadaje jawnej zmianie grafiku najwyższy priorytet', () => {
    const wyjatek = { ...utworzMetadane('wyjatek-praca'), data: '2026-09-14', pracuje: true }
    expect(ustalDostepnoscDniaPracy('2026-09-14', false, wyjatek, [urlop])).toMatchObject({ pracuje: true, powod: 'wyjatek' })
    expect(ustalDostepnoscDniaPracy('2026-11-11', false, { ...wyjatek, data: '2026-11-11' }, [])).toMatchObject({ pracuje: true, powod: 'wyjatek' })
    expect(ustalDostepnoscDniaPracy('2026-09-14', true, { ...wyjatek, pracuje: false }, [])).toMatchObject({ pracuje: false, powod: 'wyjatek' })
  })
})
