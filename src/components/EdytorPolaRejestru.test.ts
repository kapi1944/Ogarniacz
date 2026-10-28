import { expect, it } from 'vitest'
import { normalizujStarePolaRejestru } from './EdytorPolaRejestru'

it('przekazuje zależnościom pól klucze domenowe po migracji na techniczne ID', () => {
  const [pole] = normalizujStarePolaRejestru([{ klucz: 'kontoDoceloweId', etykieta: 'Konto docelowe', widoczne: (formularz) => formularz.rodzaj === 'transfer' }])
  expect(pole.widoczne?.({ 'system:rodzaj': 'transfer' })).toBe(true)
  expect(pole.widoczne?.({ 'system:rodzaj': 'wydatek' })).toBe(false)
})

it('przekazuje zależnym podpowiedziom klucze domenowe bez zmiany wartości formularza', () => {
  const [pole] = normalizujStarePolaRejestru([{ klucz: 'model', etykieta: 'Model', podpowiedzi: (formularz) => formularz.marka === 'Toyota' ? ['Corolla'] : ['Octavia'] }])
  expect(typeof pole.podpowiedzi).toBe('function')
  if (typeof pole.podpowiedzi !== 'function') throw new Error('Brak zależnych podpowiedzi')
  expect(pole.podpowiedzi({ 'system:marka': 'Toyota', 'system:model': 'Własny' })).toEqual(['Corolla'])
  expect(pole.podpowiedzi({ 'system:marka': 'Škoda' })).toEqual(['Octavia'])
})
