import { cleanup as wyczysc, fireEvent as zdarzenie, render as pokaz, screen as ekran, waitFor as poczekaj } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WidokSamopoczucia from './WidokSamopoczucia'
import { zapiszWpisSamopoczucia } from '../../services/SamopoczucieService'
import type { WpisSamopoczucia } from '../../domain/samopoczucie'

const stan = vi.hoisted(() => ({ dostep: true, wpisy: [] as WpisSamopoczucia[] }))
vi.mock('../../app/KontekstAplikacji', () => ({ useAplikacja: () => ({ moze: () => stan.dostep, ustawienia: {}, zapiszUstawienia: vi.fn() }) }))
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => stan.wpisy }))
vi.mock('../../services/SamopoczucieService', async (oryginal) => ({ ...await oryginal<typeof import('../../services/SamopoczucieService')>(), zapiszWpisSamopoczucia: vi.fn(async () => {}) }))
afterEach(wyczysc)
beforeEach(() => { vi.clearAllMocks(); stan.dostep = true; stan.wpisy = [] })
function otworz() { pokaz(<MemoryRouter><WidokSamopoczucia /></MemoryRouter>); zdarzenie.click(ekran.getByRole('button', { name: 'Jak się czujesz? Dodaj wpis' })) }

describe('Formularz dziennika', () => {
  it('nie zapisuje wartości domyślnych suwaków ani nie otwiera klawiatury autofocus', async () => {
    otworz()
    expect(ekran.getAllByText('Brak obserwacji — suwak nie jest jeszcze zapisem.')).toHaveLength(3)
    expect(document.querySelector('[autofocus]')).toBeNull()
    zdarzenie.change(ekran.getByLabelText('Krótka notatka (opcjonalna)'), { target: { value: 'Testowa notatka' } })
    zdarzenie.click(ekran.getByRole('button', { name: 'Zapisz obserwację' }))
    await poczekaj(() => expect(zapiszWpisSamopoczucia).toHaveBeenCalledWith(expect.objectContaining({ wskazniki: [], notatka: 'Testowa notatka' }), expect.any(Function)))
  })
  it('zapisuje tylko świadomie wybrane zero', async () => {
    otworz(); zdarzenie.click(ekran.getAllByRole('button', { name: 'Wybierz 0' })[0])
    zdarzenie.click(ekran.getByRole('button', { name: 'Zapisz obserwację' }))
    await poczekaj(() => expect(zapiszWpisSamopoczucia).toHaveBeenCalledWith(expect.objectContaining({ wskazniki: [expect.objectContaining({ wartosc: 0 })] }), expect.any(Function)))
  })
  it('nie pokazuje dziennika bez uprawnienia do odczytu', () => {
    stan.dostep = false; pokaz(<MemoryRouter><WidokSamopoczucia /></MemoryRouter>)
    expect(ekran.getByText('Brak uprawnienia do dziennika samopoczucia.')).toBeInTheDocument()
    expect(ekran.queryByRole('button', { name: 'Jak się czujesz? Dodaj wpis' })).toBeNull()
  })
  it('grupuje wiele wpisów jednego dnia i filtruje datę oraz znacznik terapeutyczny', () => {
    const podstawa = { createdAt: '2026-10-11T10:00:00Z', updatedAt: '2026-10-11T10:00:00Z', strefaCzasowa: 'Europe/Warsaw', wskazniki: [], godzinaObserwacji: '12:00' }
    stan.wpisy = [
      { ...podstawa, id: 'pierwszy', dataObserwacji: '2026-10-11', czasObserwacji: '2026-10-11T10:00:00Z', doOmowienia: true, notatka: 'Do rozmowy' },
      { ...podstawa, id: 'drugi', dataObserwacji: '2026-10-11', czasObserwacji: '2026-10-11T11:00:00Z', doOmowienia: false, notatka: 'Drugi zapis' },
      { ...podstawa, id: 'starszy', dataObserwacji: '2026-10-10', czasObserwacji: '2026-10-10T10:00:00Z', doOmowienia: true, notatka: 'Starszy zapis' },
    ]
    pokaz(<MemoryRouter><WidokSamopoczucia /></MemoryRouter>)
    expect(document.querySelectorAll('.samopoczucie-wpis')).toHaveLength(3)
    zdarzenie.change(ekran.getByLabelText('Obserwacje od'), { target: { value: '2026-10-11' } })
    expect(document.querySelectorAll('.samopoczucie-wpis')).toHaveLength(2)
    zdarzenie.click(ekran.getByLabelText('Tylko do omówienia na terapii'))
    expect(document.querySelectorAll('.samopoczucie-wpis')).toHaveLength(1)
    expect(ekran.getByText('Notatka: Do rozmowy')).toBeInTheDocument()
  })
})
