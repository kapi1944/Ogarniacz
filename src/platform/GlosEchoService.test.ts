import { afterEach, describe, expect, it, vi } from 'vitest'
import { utworzUslugeGlosuEcho } from './GlosEchoService'

afterEach(() => vi.unstubAllGlobals())

describe('utworzUslugeGlosuEcho — synteza przeglądarkowa', () => {
  it('kończy mow() po zatrzymaniu syntezy', async () => {
    const wypowiedzi: { onend: (() => void) | null; onerror: (() => void) | null }[] = []
    const anuluj = vi.fn()
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      lang = ''
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor() { wypowiedzi.push(this) }
    })
    vi.stubGlobal('speechSynthesis', { cancel: anuluj, speak: vi.fn() })

    const glos = utworzUslugeGlosuEcho(false)
    const odczyt = glos.mow('Próba')
    await glos.zatrzymajMowienie()

    await expect(odczyt).resolves.toBeUndefined()
    expect(anuluj).toHaveBeenCalledTimes(2)
    wypowiedzi[0].onend?.()
  })

  it('nie pozostawia starej obietnicy aktywnej po rozpoczęciu kolejnego odczytu', async () => {
    const wypowiedzi: { onend: (() => void) | null; onerror: (() => void) | null }[] = []
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      lang = ''
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor() { wypowiedzi.push(this) }
    })
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn() })

    const glos = utworzUslugeGlosuEcho(false)
    const pierwszy = glos.mow('Pierwszy')
    const drugi = glos.mow('Drugi')
    await expect(pierwszy).resolves.toBeUndefined()
    wypowiedzi[1].onend?.()
    await expect(drugi).resolves.toBeUndefined()
  })
})
