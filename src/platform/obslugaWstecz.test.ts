import { describe, expect, it, vi } from 'vitest'
import { obsluzWstecz, zarejestrujObslugeWstecz } from './obslugaWstecz'

describe('priorytety Android Back', () => {
  it('zamyka modal przed nakładką i trasą', () => {
    const trasa = vi.fn(() => true)
    const nakladka = vi.fn(() => true)
    const modal = vi.fn(() => true)
    const wyrejestruj = [
      zarejestrujObslugeWstecz(trasa, 10),
      zarejestrujObslugeWstecz(nakladka, 80),
      zarejestrujObslugeWstecz(modal, 100),
    ]

    expect(obsluzWstecz()).toBe(true)
    expect(modal).toHaveBeenCalledOnce()
    expect(nakladka).not.toHaveBeenCalled()
    expect(trasa).not.toHaveBeenCalled()
    wyrejestruj.forEach((zakoncz) => zakoncz())
  })
})
