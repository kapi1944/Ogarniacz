import { expect, it } from 'vitest'
import { kwotaDoModelu, normalizujKwote, sumaKwot, WALUTY } from './kwoty'

it.each(WALUTY.map((waluta) => waluta.kod))('zapisuje dokładną kwotę w %s', (waluta) => {
  expect(normalizujKwote('125,50', waluta)).toBe('125.50')
  expect(normalizujKwote('125.50', waluta)).toBe('125.50')
  expect(normalizujKwote('0,99', waluta)).toBe('0.99')
  expect(kwotaDoModelu('125,50', waluta)).toBe(125.5)
})

it.each(['NaN', 'Infinity', '1e3', '12,345', '12.345', '12,', '1 000', 'abc', '--1', '.5'])('odrzuca %s bez zaokrąglania', (tekst) => {
  expect(() => normalizujKwote(tekst)).toThrow('prawidłową kwotę')
})

it('nie traci cyfr przy konwersji do dotychczasowego modelu liczbowego', () => {
  expect(() => kwotaDoModelu('9007199254740993.01')).toThrow()
  expect(normalizujKwote('9007199254740993,01')).toBe('9007199254740993.01')
  expect(kwotaDoModelu('0')).toBe(0)
  expect(kwotaDoModelu('-0,99')).toBe(-0.99)
  expect(() => normalizujKwote('10', 'XXX')).toThrow('walutę')
})

it('sumuje i odejmuje dziesiętnie bez błędu 0.1 + 0.2', () => {
  expect(sumaKwot([0.1, 0.2])).toBe(0.3)
  expect(sumaKwot([125.5, -125.49])).toBe(0.01)
  expect(sumaKwot([1e-7, 2e-7])).toBe(3e-7)
  expect(sumaKwot([])).toBe(0)
  expect(() => sumaKwot([Infinity])).toThrow()
  expect(() => sumaKwot([9007199254740992, 1])).toThrow('dokładnego zapisu')
})
