import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CapacitorHttp } from '@capacitor/core'
import { pobierzCsrfKonta, pobierzSesjeKonta, uruchomAktualizacjeRaspberry, zaloguj } from './KontaService'

vi.mock('@capacitor/core', async (oryginal) => ({
  ...await oryginal<typeof import('@capacitor/core')>(),
  CapacitorHttp: { request: vi.fn() },
}))

vi.mock('./KonfiguracjaSynchronizacji', () => ({
  pobierzKonfiguracjeSynchronizacji: () => ({ adresApi: 'https://raspberrypi.tailnet.ts.net' }),
}))

const konto = {
  zalogowany: true as const,
  uzytkownikId: 'wlasciciel',
  wlascicielId: 'wlasciciel',
  email: 'owner@example.test',
  rola: 'wlasciciel' as const,
  csrf: 'csrf-testowy',
  granty: [],
  edytorzy: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

describe('KontaService', () => {
  it('logowanie tworzy sesję przez API z credentials i zapisuje wyłącznie CSRF', async () => {
    vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 200, data: konto, headers: {}, url: '' })

    await expect(zaloguj('owner@example.test', 'tajne-haslo')).resolves.toMatchObject({ zalogowany: true })

    expect(CapacitorHttp.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://raspberrypi.tailnet.ts.net/api/auth/login',
      webFetchExtra: { credentials: 'include' },
      headers: { 'content-type': 'application/json' },
    }))
    expect(pobierzCsrfKonta()).toBe('csrf-testowy')
    expect(localStorage.getItem('ogarniacz-konto-offline')).not.toContain('csrf-testowy')
  })

  it('współdzieli równoległe odtworzenie trwałej sesji po restarcie', async () => {
    vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 200, data: konto, headers: {}, url: '' })

    const [pierwsza, druga] = await Promise.all([pobierzSesjeKonta(), pobierzSesjeKonta()])

    expect(pierwsza).toEqual(druga)
    expect(CapacitorHttp.request).toHaveBeenCalledOnce()
    expect(CapacitorHttp.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: 'https://raspberrypi.tailnet.ts.net/api/auth/session',
      webFetchExtra: { credentials: 'include' },
    }))
  })

  it('wysyła istniejący CSRF przy akcji aktualizatora Raspberry', async () => {
    sessionStorage.setItem('ogarniacz-csrf', 'csrf-testowy')
    vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 202, data: { status: 'przyjeto' }, headers: {}, url: '' })

    await uruchomAktualizacjeRaspberry('start')

    expect(CapacitorHttp.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://raspberrypi.tailnet.ts.net/api/rpi-update/start',
      headers: { 'content-type': 'application/json', 'x-ogarniacz-csrf': 'csrf-testowy' },
      webFetchExtra: { credentials: 'include' },
    }))
  })
})
