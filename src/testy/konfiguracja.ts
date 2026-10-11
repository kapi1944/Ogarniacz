import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { beforeEach } from 'vitest'
import { ustawBiezacyDostep } from '../services/UprawnieniaService'

// Testy usług działają w jawnym kontekście lokalnego właściciela.
beforeEach(() => ustawBiezacyDostep(() => true))

if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => `test-${Math.random().toString(16).slice(2)}` },
  })
}
