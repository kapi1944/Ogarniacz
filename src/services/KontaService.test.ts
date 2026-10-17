import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CapacitorHttp } from '@capacitor/core'
import { pobierzCsrfKonta, pobierzKontoOffline, pobierzListeSesji, pobierzSesjeKonta, uruchomAktualizacjeRaspberry, wylogujSesje, wylogujWszystkieSesje, zaloguj, zmienHaslo } from './KontaService'
import { resetujHasloUzytkownika, wylogujPozostaleSesje } from './KontaService'
import { pobierzStanDomu, sterujDomem } from './KontaService'
import { poprosOLinkResetowaniaHasla, ustawHasloPrzezLink } from './KontaService'

// Setup uprawnień ładuje usługę kont; usuń ten cache przed zastosowaniem mocków.
vi.hoisted(() => vi.resetModules())

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
  it('wysyła prośbę i reset przez obecny transport kont bez utrwalania sekretów', async () => {
    vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 202, data: { komunikat: 'Neutralny komunikat' }, headers: {}, url: '' })
    expect(await poprosOLinkResetowaniaHasla('konto@example.test')).toBe('Neutralny komunikat')
    expect(CapacitorHttp.request).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://raspberrypi.tailnet.ts.net/api/auth/password/request', data: { email: 'konto@example.test' } }))
    vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 200, data: {}, headers: {}, url: '' })
    await ustawHasloPrzezLink('syntetyczny-token', 'Nowe-haslo')
    expect(CapacitorHttp.request).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://raspberrypi.tailnet.ts.net/api/auth/password/reset', data: { token: 'syntetyczny-token', noweHaslo: 'Nowe-haslo' }, webFetchExtra: { credentials: 'include' } }))
    expect(localStorage.length + sessionStorage.length).toBe(0)
  })
  it('Dom korzysta z istniejącego transportu sesji i CSRF bez utrwalania stanów', async () => {
    sessionStorage.setItem('ogarniacz-csrf', 'csrf-testowy')
    const stan = { skonfigurowany: true, dostepny: true, encje: [] }
    vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 200, data: stan, headers: {}, url: '' })
    expect(await pobierzStanDomu()).toEqual(stan)
    expect(CapacitorHttp.request).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'GET', url: 'https://raspberrypi.tailnet.ts.net/api/dom', webFetchExtra: { credentials: 'include' } }))
    await sterujDomem('light.salon', 'wlacz')
    expect(CapacitorHttp.request).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'POST', url: 'https://raspberrypi.tailnet.ts.net/api/dom/light.salon/wlacz', headers: { 'x-ogarniacz-csrf': 'csrf-testowy' }, data: undefined, webFetchExtra: { credentials: 'include' } }))
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(1)
  })
  it('odwołuje pozostałe sesje z CSRF i nie czyści bieżącego konta', async () => {
    sessionStorage.setItem('ogarniacz-csrf', 'csrf-testowy')
    vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 200, data: konto, headers: {}, url: '' })
    await zaloguj('owner@example.test', 'Fikcyjne-haslo')
    vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 200, data: { wylogowano: true }, headers: {}, url: '' })
    await wylogujPozostaleSesje()
    expect(CapacitorHttp.request).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://raspberrypi.tailnet.ts.net/api/account/sessions/revoke-others', headers: { 'content-type': 'application/json', 'x-ogarniacz-csrf': 'csrf-testowy' } }))
    expect(pobierzKontoOffline()).toBeDefined()
    expect(pobierzCsrfKonta()).toBe('csrf-testowy')
  })
  it('reset administracyjny przekazuje tylko ID i nie zapisuje jednorazowego kodu', async () => {
    sessionStorage.setItem('ogarniacz-csrf', 'csrf-testowy')
    const reset = { kodOdzyskiwania: 'fikcyjny-kod-testowy', wygasaAt: '2099-01-01T00:00:00Z' }
    vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 200, data: reset, headers: {}, url: '' })
    expect(await resetujHasloUzytkownika('konto')).toEqual(reset)
    expect(CapacitorHttp.request).toHaveBeenCalledWith(expect.objectContaining({ data: { id: 'konto' }, headers: { 'content-type': 'application/json', 'x-ogarniacz-csrf': 'csrf-testowy' } }))
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(reset.kodOdzyskiwania)
  })
  it('nie utrwala hasła ani listy sesji i wysyła CSRF przy zmianie hasła', async () => {
    sessionStorage.setItem('ogarniacz-csrf', 'csrf-testowy')
    vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 200, data: { zmieniono: true }, headers: {}, url: '' })
    await zmienHaslo('Aktualne-haslo', 'Nowe-haslo')
    expect(CapacitorHttp.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://raspberrypi.tailnet.ts.net/api/account/password',
      data: { aktualneHaslo: 'Aktualne-haslo', noweHaslo: 'Nowe-haslo' },
      headers: { 'content-type': 'application/json', 'x-ogarniacz-csrf': 'csrf-testowy' },
    }))
    vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 200, data: { sesje: [{ id: 'publiczne-id', biezaca: true }] }, headers: {}, url: '' })
    expect(await pobierzListeSesji()).toEqual([{ id: 'publiczne-id', biezaca: true }])
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(1)
  })

  it('czyści lokalne konto dopiero po potwierdzonym unieważnieniu własnej sesji', async () => {
    vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 200, data: konto, headers: {}, url: '' })
    await zaloguj('owner@example.test', 'tajne-haslo')
    vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 200, data: { biezaca: false }, headers: {}, url: '' })
    expect(await wylogujSesje('inna')).toBe(false)
    expect(pobierzKontoOffline()).toBeDefined()
    vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 403, data: { error: 'Odmowa' }, headers: {}, url: '' })
    await expect(wylogujWszystkieSesje()).rejects.toThrow('Odmowa')
    expect(pobierzKontoOffline()).toBeDefined()
    vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 200, data: { wylogowano: true }, headers: {}, url: '' })
    await wylogujWszystkieSesje()
    expect(pobierzKontoOffline()).toBeUndefined()
    expect(pobierzCsrfKonta()).toBeUndefined()
  })

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
