import { cleanup as wyczysc, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KonfliktSynchronizacji } from '../../domain/typy'
import { KartaKonfliktuSynchronizacji } from './KonfliktSynchronizacji'

afterEach(wyczysc)

function utworzKonflikt(): KonfliktSynchronizacji {
  return {
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
}

describe('prezentacja konfliktu synchronizacji', () => {
  it('pokazuje tylko rzeczywiste różnice i czeka z rozstrzygnięciem na zatwierdzenie', () => {
    const konflikt = utworzKonflikt()
    const rozstrzygnij = vi.fn()

    render(<KartaKonfliktuSynchronizacji konflikt={konflikt} rozstrzygnij={rozstrzygnij} />)

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

    const zatwierdz = screen.getByRole('button', { name: 'Zatwierdź rozwiązanie' })
    expect(zatwierdz).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Wybierz wersję z tego urządzenia' }))
    expect(rozstrzygnij).not.toHaveBeenCalled()
    fireEvent.click(zatwierdz)
    expect(rozstrzygnij).toHaveBeenCalledWith(konflikt.id, { typ: 'lokalny' })
  })

  it('pozwala wybrać wersję serwerową i zatwierdzić ją osobno', () => {
    const konflikt = utworzKonflikt()
    const rozstrzygnij = vi.fn()
    render(<KartaKonfliktuSynchronizacji konflikt={konflikt} rozstrzygnij={rozstrzygnij} />)

    fireEvent.click(screen.getByRole('button', { name: 'Wybierz wersję z serwera' }))
    expect(rozstrzygnij).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Zatwierdź rozwiązanie' }))
    expect(rozstrzygnij).toHaveBeenCalledWith(konflikt.id, { typ: 'zdalny' })
  })

  it('pozwala ręcznie połączyć proste pola', () => {
    const konflikt = utworzKonflikt()
    const rozstrzygnij = vi.fn()
    render(<KartaKonfliktuSynchronizacji konflikt={konflikt} rozstrzygnij={rozstrzygnij} />)

    fireEvent.click(screen.getByRole('button', { name: 'Połącz pola ręcznie' }))
    const wierszTytulu = screen.getByRole('row', { name: /Tytuł/ })
    fireEvent.click(within(wierszTytulu).getByRole('radio', { name: 'Raport dla zarządu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zatwierdź rozwiązanie' }))

    expect(rozstrzygnij).toHaveBeenCalledWith(konflikt.id, {
      typ: 'reczny',
      pola: { opis: 'lokalny', tytul: 'zdalny' },
    })
  })

  it('nie oferuje ręcznego łączenia usunięcia z edycją', () => {
    const konflikt = utworzKonflikt()
    konflikt.zdalny.usunietoAt = '2026-09-01T10:01:00.000Z'
    render(<KartaKonfliktuSynchronizacji konflikt={konflikt} rozstrzygnij={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Połącz pola ręcznie' })).not.toBeInTheDocument()
    expect(screen.getByText(/rekord usunięty/)).toBeInTheDocument()
  })
})
