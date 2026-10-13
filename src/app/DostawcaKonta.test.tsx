import { cleanup as wyczysc, fireEvent as zdarzenie, render, screen } from '@testing-library/react'
import { afterEach as poKazdym, beforeEach as przedKazdym, describe, expect, it, vi } from 'vitest'
import {
  BladKonta,
  czyBootstrapDostepny,
  pobierzKontoOffline,
  pobierzSesjeKonta,
  pobierzListeSesji,
  zmienHaslo,
  wyloguj,
  type KontoUzytkownika,
} from '../services/KontaService'
import { DostawcaKonta } from './DostawcaKonta'

vi.mock('../services/KonfiguracjaSynchronizacji', () => ({
  pobierzKonfiguracjeSynchronizacji: () => ({ adresApi: 'https://serwer.example.test' }),
}))

vi.mock('../services/KontaService', async (importujOryginal) => {
  const oryginal = await importujOryginal<typeof import('../services/KontaService')>()
  return {
    ...oryginal,
    czyBootstrapDostepny: vi.fn(),
    pobierzKontoOffline: vi.fn(),
    pobierzSesjeKonta: vi.fn(),
    pobierzListeSesji: vi.fn(),
    zmienHaslo: vi.fn(),
    wyloguj: vi.fn(),
  }
})

const konto: KontoUzytkownika = {
  zalogowany: true,
  uzytkownikId: 'wlasciciel',
  wlascicielId: 'wlasciciel',
  email: 'owner@example.test',
  rola: 'wlasciciel',
  granty: [],
  edytorzy: [],
}

przedKazdym(() => {
  vi.mocked(pobierzKontoOffline).mockReturnValue(undefined)
  vi.mocked(czyBootstrapDostepny).mockResolvedValue(false)
  window.history.replaceState({}, '', '/')
  localStorage.clear()
  sessionStorage.clear()
})

poKazdym(() => {
  wyczysc()
  vi.clearAllMocks()
})

describe('onboarding konta', () => {
  it('zmienia hasło w panelu konta i czyści pola bez wylogowania bieżącej sesji', async () => {
    vi.mocked(pobierzSesjeKonta).mockResolvedValue(konto)
    vi.mocked(zmienHaslo).mockResolvedValue(undefined)
    render(<DostawcaKonta><div>Aplikacja działa</div></DostawcaKonta>)
    zdarzenie.click(await screen.findByRole('button', { name: 'Właściciel' }))
    zdarzenie.change(screen.getByLabelText('Aktualne hasło'), { target: { value: 'Stare-haslo' } })
    zdarzenie.change(screen.getByLabelText('Nowe hasło'), { target: { value: 'Nowe-haslo' } })
    zdarzenie.change(screen.getByLabelText('Powtórz nowe hasło'), { target: { value: 'Nowe-haslo' } })
    zdarzenie.click(screen.getByRole('button', { name: 'Zmień hasło' }))
    expect(await screen.findByText('Hasło zmienione. Pozostałe sesje zostały wylogowane.')).toBeInTheDocument()
    expect(zmienHaslo).toHaveBeenCalledWith('Stare-haslo', 'Nowe-haslo')
    expect(screen.getByLabelText('Aktualne hasło')).toHaveValue('')
    expect(screen.getByLabelText('Nowe hasło')).toHaveValue('')
    expect(wyloguj).not.toHaveBeenCalled()
  })

  it('pokazuje błędy listy sesji i wylogowania, zachowując panel i konto', async () => {
    vi.mocked(pobierzSesjeKonta).mockResolvedValue(konto)
    vi.mocked(pobierzListeSesji).mockRejectedValue(new Error('Lista sesji jest niedostępna.'))
    vi.mocked(wyloguj).mockRejectedValue(new Error('Nie udało się unieważnić sesji.'))
    render(<DostawcaKonta><div>Aplikacja działa</div></DostawcaKonta>)
    zdarzenie.click(await screen.findByRole('button', { name: 'Właściciel' }))
    zdarzenie.click(screen.getByRole('button', { name: 'Pokaż aktywne sesje' }))
    expect(await screen.findByText('Lista sesji jest niedostępna.')).toBeInTheDocument()
    zdarzenie.click(screen.getByRole('button', { name: 'Wyloguj bieżącą sesję' }))
    expect(await screen.findByText('Nie udało się unieważnić sesji.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hasło i sesje' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Zaloguj się' })).not.toBeInTheDocument()
  })

  it('istniejąca sesja omija onboarding', async () => {
    vi.mocked(pobierzSesjeKonta).mockResolvedValue(konto)

    render(<DostawcaKonta><div>Aplikacja działa</div></DostawcaKonta>)

    expect(await screen.findByText('Aplikacja działa')).toBeInTheDocument()
    expect(screen.queryByText('Pierwsze konto Właściciela')).not.toBeInTheDocument()
    expect(czyBootstrapDostepny).not.toHaveBeenCalled()
  })

  it('wygasła sesja prowadzi do logowania zamiast bootstrapu', async () => {
    vi.mocked(pobierzKontoOffline).mockReturnValue(konto)
    vi.mocked(pobierzSesjeKonta).mockRejectedValue(new BladKonta(401, 'Sesja wygasła.'))

    render(<DostawcaKonta><div>Aplikacja działa</div></DostawcaKonta>)

    expect(await screen.findByRole('heading', { name: 'Zaloguj się' })).toBeInTheDocument()
    expect(screen.queryByText('Pierwsze konto Właściciela')).not.toBeInTheDocument()
    expect(czyBootstrapDostepny).toHaveBeenCalledOnce()
  })

  it('pokazuje pierwszy bootstrap dopiero po potwierdzeniu serwera', async () => {
    vi.mocked(pobierzSesjeKonta).mockRejectedValue(new BladKonta(401, 'Brak sesji.'))
    vi.mocked(czyBootstrapDostepny).mockResolvedValue(true)

    render(<DostawcaKonta><div>Aplikacja działa</div></DostawcaKonta>)

    expect(await screen.findByRole('heading', { name: 'Pierwsze konto Właściciela' })).toBeInTheDocument()
  })
})
