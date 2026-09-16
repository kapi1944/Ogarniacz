import { cleanup as wyczysc, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KonfliktSynchronizacji } from '../../domain/typy'
import { KartaKonfliktuSynchronizacji } from './KonfliktSynchronizacji'

afterEach(wyczysc)

describe('prezentacja konfliktu synchronizacji', () => {
  it('pokazuje nazwę rekordu, czasy wersji i rzeczywistą różnicę zamiast technicznego ID', () => {
    const konflikt: KonfliktSynchronizacji = {
      id: 'zadania:techniczne-id-rekordu',
      createdAt: '2026-09-01T10:02:00.000Z',
      updatedAt: '2026-09-01T10:02:00.000Z',
      tabela: 'zadania',
      rekordId: 'techniczne-id-rekordu',
      wykrytoAt: '2026-09-01T10:02:00.000Z',
      lokalnaInstallationId: 'instalacja-lokalna',
      zdalnaInstallationId: 'instalacja-zdalna',
      lokalny: {
        id: 'techniczne-id-rekordu',
        createdAt: '2026-08-20T08:00:00.000Z',
        updatedAt: '2026-09-01T10:00:00.000Z',
        tytul: 'Raport kwartalny',
        opis: 'Wersja zapisana na telefonie',
      } as KonfliktSynchronizacji['lokalny'],
      zdalny: {
        id: 'techniczne-id-rekordu',
        createdAt: '2026-08-20T08:00:00.000Z',
        updatedAt: '2026-09-01T10:01:00.000Z',
        tytul: 'Raport dla zarządu',
        opis: 'Wersja zapisana na komputerze',
      } as KonfliktSynchronizacji['zdalny'],
    }

    render(<KartaKonfliktuSynchronizacji konflikt={konflikt} rozstrzygnij={vi.fn()} />)

    expect(screen.getByText('Zadanie')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Raport kwartalny' })).toBeInTheDocument()
    const tabela = screen.getByRole('table')
    expect(within(tabela).getByText('Tytuł')).toBeInTheDocument()
    expect(within(tabela).getByText('Raport kwartalny')).toBeInTheDocument()
    expect(within(tabela).getByText('Raport dla zarządu')).toBeInTheDocument()
    expect(within(tabela).getByText('Wersja zapisana na telefonie')).toBeInTheDocument()
    expect(within(tabela).getByText('Wersja zapisana na komputerze')).toBeInTheDocument()
    expect(screen.getByText('Wersja z tego urządzenia').nextSibling).toHaveAttribute('datetime', konflikt.lokalny.updatedAt)
    expect(screen.getByText('Wersja z serwera').nextSibling).toHaveAttribute('datetime', konflikt.zdalny.updatedAt)
    expect(screen.queryByText('techniczne-id-rekordu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zachowaj wersję z tego urządzenia' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Użyj wersji z serwera' })).toBeInTheDocument()
  })
})
