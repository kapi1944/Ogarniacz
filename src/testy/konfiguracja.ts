import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { beforeEach } from 'vitest'
import { ustawBiezacyDostep } from '../services/UprawnieniaService'
import { baza } from '../data/BazaOgarniacza'

// Testy usług działają w jawnym kontekście lokalnego właściciela.
beforeEach(async () => {
  ustawBiezacyDostep(() => true)
  await baza.open()
})

if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => `test-${Math.random().toString(16).slice(2)}` },
  })
}
