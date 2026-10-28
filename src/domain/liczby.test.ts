import { expect, it } from 'vitest'
import { bladLiczby, liczbaDoModelu, liczbaDoTekstu } from './liczby'

it.each([['5', 5], ['125430,5', 125430.5], ['42.75', 42.75], ['82,4', 82.4], ['-12,5', -12.5], ['0', 0], ['00012,5000', 12.5]])('konwertuje %s bez zmiany wartości', (tekst, liczba) => {
  expect(liczbaDoModelu(tekst as string)).toBe(liczba)
})

it.each(['12abc', '12,5,6', 'NaN', 'Infinity', '1e3', '12,', '-', '.', '9007199254740993', '0.1234567890123456789'])('odrzuca nieprawidłową lub niedokładną liczbę %s', (tekst) => {
  expect(() => liczbaDoModelu(tekst)).toThrow()
})

it('pilnuje granic, liczb całkowitych oraz dokładnego kroku od minimum', () => {
  expect(bladLiczby('-0,15', { min: -0.15, max: 1, krok: 0.1 })).toBe('')
  expect(bladLiczby('0,05', { min: -0.15, max: 1, krok: 0.1 })).toBe('')
  expect(bladLiczby('0,06', { min: -0.15, max: 1, krok: 0.1 })).toContain('krokiem')
  expect(bladLiczby('0,3', { min: 0, krok: 0.1 })).toBe('')
  expect(bladLiczby('5,5', { krok: 1 })).toContain('krokiem')
  expect(bladLiczby('-1', { min: 0 })).toContain('mniejsza')
  expect(bladLiczby('101', { max: 100 })).toContain('większa')
})

it('odczytuje historyczne liczby zapisane w notacji wykładniczej', () => {
  expect(liczbaDoTekstu(1e-7)).toBe('0.0000001')
  expect(liczbaDoTekstu(-1.25e-7)).toBe('-0.000000125')
  expect(liczbaDoTekstu(1.25e21)).toBe('1250000000000000000000')
  expect(liczbaDoModelu(liczbaDoTekstu(1e-7))).toBe(1e-7)
  expect(bladLiczby('0.0000003', { min: 1e-7, krok: 1e-7 })).toBe('')
})
