import { afterEach, describe, expect, it, vi } from 'vitest'
import { noweId } from './fabryki'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('noweId poza secure context', () => {
  it('korzysta z natywnego randomUUID', () => {
    const randomUUID = vi.fn(() => 'natywne-id')
    vi.stubGlobal('crypto', { randomUUID })
    expect(noweId()).toBe('natywne-id')
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  it('tworzy UUID v4 z getRandomValues bez randomUUID', () => {
    const getRandomValues = vi.fn((bajty: Uint8Array) => bajty.fill(255))
    vi.stubGlobal('crypto', { randomUUID: undefined, getRandomValues })
    expect(noweId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
    expect(getRandomValues).toHaveBeenCalledOnce()
  })

  it.each([undefined, {}])('działa bez pełnego crypto: %s', (kryptografia) => {
    vi.stubGlobal('crypto', kryptografia)
    vi.spyOn(Date, 'now').mockReturnValue(123456789)
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const identyfikatory = Array.from({ length: 1000 }, noweId)
    expect(new Set(identyfikatory).size).toBe(1000)
    expect(identyfikatory.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(true)
  })
})
