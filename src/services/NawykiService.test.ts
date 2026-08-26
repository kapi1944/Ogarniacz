import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { DziennikNawyku, Nawyk } from '../domain/typy'
import { czyNawykNaDzien, statystykaNawyku } from './NawykiService'

const nawyk = (zmiany: Partial<Nawyk> = {}): Nawyk => ({ ...utworzMetadane(), nazwa: 'Spacer', czestotliwosc: 'codziennie', dniTygodnia: [], minimalnaWersja: '5 minut', aktywny: true, ...zmiany })

describe('nawyki', () => {
  it('obsługuje częstotliwość dni roboczych i wybranych dni', () => {
    expect(czyNawykNaDzien(nawyk({ czestotliwosc: 'dni_robocze' }), '2026-08-17')).toBe(true)
    expect(czyNawykNaDzien(nawyk({ czestotliwosc: 'wybrane_dni', dniTygodnia: [1, 3] }), '2026-08-18')).toBe(false)
  })

  it('minimalna wersja liczy się jako realizacja', () => {
    const element = nawyk()
    const wpis: DziennikNawyku = { ...utworzMetadane(), nawykId: element.id, data: '2026-08-14', status: 'minimalna' }
    expect(statystykaNawyku(element, [wpis], '2026-08-14', 1).regularnosc).toBe(100)
  })

  it('wylicza historię regularności bez zerowania serii karą', () => {
    const element = nawyk()
    const wpisy: DziennikNawyku[] = [{ ...utworzMetadane(), nawykId: element.id, data: '2026-08-14', status: 'pelna' }]
    expect(statystykaNawyku(element, wpisy, '2026-08-14', 2)).toEqual({ planowane: 2, zrealizowane: 1, regularnosc: 50 })
  })
})
