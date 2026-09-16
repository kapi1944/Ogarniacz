import { expect, it } from 'vitest'
import { normalizujStarePolaRejestru } from './EdytorPolaRejestru'

it('przekazuje zależnościom pól klucze domenowe po migracji na techniczne ID', () => {
  const [pole] = normalizujStarePolaRejestru([{ klucz: 'kontoDoceloweId', etykieta: 'Konto docelowe', widoczne: (formularz) => formularz.rodzaj === 'transfer' }])
  expect(pole.widoczne?.({ 'system:rodzaj': 'transfer' })).toBe(true)
  expect(pole.widoczne?.({ 'system:rodzaj': 'wydatek' })).toBe(false)
})
