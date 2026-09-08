import { describe, expect, it, vi } from 'vitest'
import { KontrolerWakeWordEcho } from './KontrolerWakeWordEcho'
import type { SilnikWakeWordEcho, ZdarzeniaSilnikaWakeWordEcho } from './SilnikWakeWordEcho'

describe('KontrolerWakeWordEcho', () => {
  it('uruchamia pełne STT dopiero po wykryciu frazy przez osobny silnik', async () => {
    let zdarzenia: ZdarzeniaSilnikaWakeWordEcho | undefined
    const silnik: SilnikWakeWordEcho = {
      uruchom: vi.fn(async (noweZdarzenia) => { zdarzenia = noweZdarzenia; noweZdarzenia.zmienStan('gotowy') }),
      zatrzymaj: vi.fn(async () => undefined),
    }
    const rozpocznij = vi.fn(async () => undefined)
    const kontroler = new KontrolerWakeWordEcho(silnik, { rozpocznij }, {
      pobierzStan: vi.fn(async () => 'aktywny' as const),
      nasluchuj: vi.fn(async () => () => undefined),
    })

    await kontroler.uruchom()

    expect(rozpocznij).not.toHaveBeenCalled()
    expect(kontroler.pobierzStan()).toBe('gotowy')
    zdarzenia?.wykrytoFraze()
    expect(rozpocznij).toHaveBeenCalledOnce()
  })
})
