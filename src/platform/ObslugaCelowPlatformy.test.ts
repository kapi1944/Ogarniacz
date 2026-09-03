import { describe, expect, it, vi } from 'vitest'
import { utworzObslugeCelowPlatformy } from './ObslugaCelowPlatformy'

describe('obsługa celów platformy', () => {
  function utworzZaleznosci(pobierzEncje = vi.fn().mockResolvedValue({ id: 'element-1' })) {
    return {
      nawiguj: vi.fn(),
      otworzSzybkieDodawanie: vi.fn(),
      pokazKomunikat: vi.fn(),
      pobierzEncje,
    }
  }

  it('nie nawiguję przy zwykłym cold starcie bez celu', async () => {
    const zaleznosci = utworzZaleznosci()
    utworzObslugeCelowPlatformy(zaleznosci)

    expect(zaleznosci.nawiguj).not.toHaveBeenCalled()
  })

  it('otwiera poprawny cel sourceRef po cold starcie', async () => {
    const zaleznosci = utworzZaleznosci()
    const obsluga = utworzObslugeCelowPlatformy(zaleznosci)

    await obsluga.obsluz('/zadania?element=element-1', { typ: 'zadania', id: 'element-1' })

    expect(zaleznosci.pobierzEncje).toHaveBeenCalledWith({ typ: 'zadania', id: 'element-1' })
    expect(zaleznosci.nawiguj).toHaveBeenCalledWith('/zadania?element=element-1')
  })

  it('używa tego samego resolvera dla kliknięcia powiadomienia przy działającej aplikacji', async () => {
    const zaleznosci = utworzZaleznosci()
    const obsluga = utworzObslugeCelowPlatformy(zaleznosci)

    await obsluga.obsluz('/samochod?element=auto-1', { typ: 'samochod', id: 'auto-1' })

    expect(zaleznosci.pobierzEncje).toHaveBeenCalledWith({ typ: 'samochod', id: 'auto-1' })
    expect(zaleznosci.nawiguj).toHaveBeenCalledWith('/samochod?element=auto-1')
  })

  it('przechodzi do modułu nadrzędnego i pokazuje komunikat po usunięciu encji', async () => {
    const zaleznosci = utworzZaleznosci(vi.fn().mockResolvedValue(undefined))
    const obsluga = utworzObslugeCelowPlatformy(zaleznosci)

    await obsluga.obsluz('/przypomnienia?element=brak', { typ: 'przypomnienia', id: 'brak' })

    expect(zaleznosci.nawiguj).toHaveBeenCalledWith('/przypomnienia')
    expect(zaleznosci.pokazKomunikat).toHaveBeenCalledWith('Ten element nie jest już dostępny.')
  })

  it('nie zmienia trasy bez dostarczonego celu', async () => {
    const zaleznosci = utworzZaleznosci()
    utworzObslugeCelowPlatformy(zaleznosci)

    expect(zaleznosci.nawiguj).not.toHaveBeenCalled()
  })

  it('nie wykonuje podwójnej nawigacji dla tego samego celu', async () => {
    const zaleznosci = utworzZaleznosci()
    const obsluga = utworzObslugeCelowPlatformy(zaleznosci)

    await obsluga.obsluz('/zadania?element=element-1', { typ: 'zadania', id: 'element-1' })
    await obsluga.obsluz('/zadania?element=element-1', { typ: 'zadania', id: 'element-1' })

    expect(zaleznosci.nawiguj).toHaveBeenCalledTimes(1)
  })
})
