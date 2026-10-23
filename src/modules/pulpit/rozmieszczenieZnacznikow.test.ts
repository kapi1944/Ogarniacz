import { expect, it } from 'vitest'
import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import { rozmiescZnaczniki } from './rozmieszczenieZnacznikow'

it('rozsuwa kolidujące znaczniki, utrzymuje kolejność i mieści etykiety przy obu granicach doby', () => {
  const elementy: ElementOgarniacza[] = ['00:00', '08:00', '08:00', '08:01', '08:02', '23:59'].map((godzina, indeks) => ({ id: String(indeks), typ: 'zadanie', tytul: 'Termin', godzina, createdAt: '', updatedAt: '' }))
  const wynik = rozmiescZnaczniki(elementy, { od: '22:30', do: '06:30', skala: .25 })
  expect(new Set(wynik.slice(1, 5).map((znacznik) => znacznik.wiersz)).size).toBe(4)
  expect(wynik.every((znacznik) => znacznik.lewa >= 0 && znacznik.lewa <= 76)).toBe(true)
  expect(rozmiescZnaczniki([...elementy].reverse(), { od: '22:30', do: '06:30', skala: .25 })).toEqual(wynik)
})
