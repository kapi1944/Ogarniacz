import { cleanup as wyczysc, fireEvent as zdarzenie, render as pokaz, screen as ekran, waitFor as poczekaj } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { utworzMetadane } from '../../domain/fabryki'
import type { Dokument } from '../../domain/typy'
import type { WynikBadania } from '../../domain/badania'
import { zapiszWynikBadania, zapiszDokumentMedyczny } from '../../services/BadaniaService'
import BadaniaDokumenty from './BadaniaDokumenty'

const stan = vi.hoisted(() => ({ dostep: true, dokumenty: [] as Dokument[], wyniki: [] as WynikBadania[] }))
const moze = () => stan.dostep
vi.mock('../../app/KontekstAplikacji', () => ({ useAplikacja: () => ({ moze }) }))
vi.mock('../../hooks/useRepozytorium', () => ({ useRepozytorium: () => ({ dane: stan.wyniki }) }))
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => ({ dokumenty: stan.dokumenty, wizyty: [], skierowania: [], terapie: [], recepty: [], kontakty: [], miejsca: [] }) }))
vi.mock('../../services/BadaniaService', async (oryginal) => ({ ...await oryginal<typeof import('../../services/BadaniaService')>(), zapiszWynikBadania: vi.fn(async () => {}), zapiszDokumentMedyczny: vi.fn(async () => {}) }))

afterEach(wyczysc)
beforeEach(() => {
  vi.clearAllMocks(); stan.dostep = true; stan.wyniki = []
  stan.dokumenty = ['pierwszy', 'drugi'].map((id) => ({ ...utworzMetadane(id), nazwa: 'Ta sama nazwa', powiazania: [] }))
})
function otworz() { pokaz(<MemoryRouter><BadaniaDokumenty /></MemoryRouter>) }

describe('Badania i dokumenty — formularze', () => {
  it('wybiera dokument po ID, zachowuje polski zapis i tworzy grupę bez autofocus', async () => {
    otworz(); zdarzenie.click(ekran.getByRole('button', { name: 'Dodaj wynik' }))
    expect(document.querySelector('[autofocus]')).toBeNull()
    expect(ekran.getByLabelText('Filtruj parametry')).not.toHaveFocus()
    zdarzenie.change(ekran.getByLabelText('Parametr *'), { target: { value: 'Hemoglobina' } })
    zdarzenie.change(ekran.getByLabelText('Oryginalny zapis wyniku *'), { target: { value: '< 5,2' } })
    zdarzenie.change(ekran.getByLabelText('Dokument źródłowy *'), { target: { value: 'drugi' } })
    zdarzenie.change(ekran.getByLabelText('Nowa grupa (opcjonalnie)'), { target: { value: 'Morfologia' } })
    zdarzenie.click(ekran.getByRole('button', { name: 'Zapisz wynik' }))
    await poczekaj(() => expect(zapiszWynikBadania).toHaveBeenCalledWith(expect.objectContaining({ dokumentId: 'drugi', oryginalnyWynik: '< 5,2', grupaId: expect.any(String), nazwaGrupy: 'Morfologia' }), expect.any(Function), expect.any(Function)))
  })

  it('zachowuje plik i ID istniejącego dokumentu przy dodaniu metadanych', async () => {
    otworz(); zdarzenie.click(ekran.getByRole('button', { name: 'Dokumenty' }))
    zdarzenie.change(ekran.getByLabelText('Istniejący dokument'), { target: { value: 'drugi' } })
    expect(document.querySelector('[autofocus]')).toBeNull()
    expect(ekran.getByLabelText('Nazwa *')).not.toHaveFocus()
    zdarzenie.change(ekran.getByLabelText('Placówka'), { target: { value: 'Placówka testowa' } })
    zdarzenie.click(ekran.getByRole('button', { name: 'Zapisz dokument' }))
    await poczekaj(() => expect(zapiszDokumentMedyczny).toHaveBeenCalledWith(expect.objectContaining({ id: 'drugi', medyczne: expect.objectContaining({ placowka: 'Placówka testowa' }) }), expect.any(Function)))
  })

  it('pokazuje brak źródła bez utraty wyniku, filtruje parametry i blokuje brak uprawnień', () => {
    stan.wyniki = [{ ...utworzMetadane('wynik'), parametr: 'Hemoglobina', dataPobrania: '2026-10-11', oryginalnyWynik: '5,2', kwalifikator: 'rowne', wartoscLiczbowa: 5.2, dokumentId: 'usunięty' }]
    otworz()
    expect(ekran.getByText(/Dokument źródłowy niedostępny/)).toBeInTheDocument()
    zdarzenie.change(ekran.getByLabelText('Filtruj parametry'), { target: { value: 'leukocyty' } })
    expect(ekran.getByText('Brak wyników')).toBeInTheDocument()
    wyczysc(); stan.dostep = false; otworz()
    expect(ekran.getByText('Brak uprawnienia do badań.')).toBeInTheDocument()
    expect(ekran.queryByRole('button', { name: 'Dodaj wynik' })).not.toBeInTheDocument()
    expect(ekran.queryByText('Hemoglobina')).not.toBeInTheDocument()
  })
})
