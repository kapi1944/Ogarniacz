import { describe, expect, it } from 'vitest'
import { czteryTygodnie, datyZakresu, zakresHoryzontu, zakresTygodnia } from './logikaHoryzontu'

describe('kalendarzowy horyzont dnia', () => {
  it('zaczyna tydzień w poniedziałek także dla daty w środku tygodnia', () => {
    expect(zakresTygodnia('2026-10-09')).toEqual({ od: '2026-10-05', do: '2026-10-11' })
    expect(zakresTygodnia('2026-10-05').od).toBe('2026-10-05')
  })
  it('niedziela kończy bieżący tydzień', () => {
    expect(zakresTygodnia('2026-10-11')).toEqual({ od: '2026-10-05', do: '2026-10-11' })
  })
  it('przechodzi przez koniec miesiąca', () => {
    expect(datyZakresu(zakresTygodnia('2026-09-30'))).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  })
  it('przechodzi przez koniec roku', () => {
    expect(zakresTygodnia('2027-01-01')).toEqual({ od: '2026-12-28', do: '2027-01-03' })
  })
  it('generuje cztery kolejne pełne tygodnie i dokładnie 28 różnych dat', () => {
    expect(czteryTygodnie('2026-12-31')).toEqual([
      { od: '2026-12-28', do: '2027-01-03' }, { od: '2027-01-04', do: '2027-01-10' },
      { od: '2027-01-11', do: '2027-01-17' }, { od: '2027-01-18', do: '2027-01-24' },
    ])
    const dni = datyZakresu(zakresHoryzontu('2026-12-31'))
    expect(dni).toHaveLength(28)
    expect(new Set(dni).size).toBe(28)
    expect(dni.at(-1)).toBe('2027-01-24')
  })
  it('nie gubi dat podczas zmiany czasu', () => {
    expect(datyZakresu(zakresHoryzontu('2026-10-25'))).toHaveLength(28)
    expect(datyZakresu(zakresTygodnia('2026-03-29'))).toHaveLength(7)
  })
})
