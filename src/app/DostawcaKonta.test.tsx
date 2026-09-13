import { cleanup as wyczysc, render, screen } from '@testing-library/react'
import { afterEach as poKazdym, beforeEach as przedKazdym, describe, expect, it, vi } from 'vitest'
import {
  BladKonta,
  czyBootstrapDostepny,
  pobierzKontoOffline,
  pobierzSesjeKonta,
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
