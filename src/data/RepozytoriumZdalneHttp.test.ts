import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CapacitorHttp } from '@capacitor/core'
import { BladKonta, pobierzCsrfKonta, pobierzKontoOffline, pobierzSesjeKonta } from '../services/KontaService'
import { RepozytoriumZdalneHttp } from './RepozytoriumZdalneHttp'
import { TABELE_FINANSOW_WSPOLNYCH, ustawBiezacyDostep } from '../services/UprawnieniaService'

const kasa = { id: 'k', createdAt: '2026-10-29T12:00:00.000Z', updatedAt: '2026-10-29T12:00:00.000Z', nazwa: 'Test', opis: '', ikona: '', kolor: '', waluta: 'PLN', saldoPoczatkoweGrosze: 0, status: 'aktywna' }
const zmianaFinansowa = { tabela: 'wspolneKasy' as const, rekord: kasa, installationId: 'instalacja-testowa' }

vi.mock('@capacitor/core', async (oryginal) => ({
  ...await oryginal<typeof import('@capacitor/core')>(),
  CapacitorHttp: { get: vi.fn(), post: vi.fn() },
}))

vi.mock('../services/KontaService', async (importujOryginal) => ({
  ...await importujOryginal<typeof import('../services/KontaService')>(),
  pobierzCsrfKonta: vi.fn(),
  pobierzKontoOffline: vi.fn(),
  pobierzSesjeKonta: vi.fn(),
}))

const odpowiedz = (status: number, data: unknown = {}) => ({ status, data, headers: {}, url: '' })

beforeEach(() => {
  vi.mocked(pobierzCsrfKonta).mockReturnValue('csrf-testowy')
  vi.mocked(pobierzKontoOffline).mockReturnValue(undefined)
})

afterEach(() => {
  vi.resetAllMocks()
})

describe('RepozytoriumZdalneHttp przez sesję', () => {
  it('odmawia wysyłki finansów przed negocjacją oraz po odpowiedzi starego backendu', async () => {
    const repo = new RepozytoriumZdalneHttp('https://example.test', () => 'instalacja-testowa')
    await expect(repo.wyslijZmiany([zmianaFinansowa])).rejects.toThrow('nie obsługuje')
    vi.mocked(CapacitorHttp.get).mockResolvedValue(odpowiedz(200, { zmiany: [] }))
    await repo.pobierzZmiany('1970-01-01')
    await expect(repo.wyslijZmiany([zmianaFinansowa])).rejects.toThrow('nie obsługuje')
    expect(CapacitorHttp.post).not.toHaveBeenCalled()
  })

  it('wysyła nowe tabele dopiero po potwierdzeniu całego kontraktu i odmawia pominiętych rekordów', async () => {
    const repo = new RepozytoriumZdalneHttp('https://example.test', () => 'instalacja-testowa')
    vi.mocked(CapacitorHttp.get).mockResolvedValue(odpowiedz(200, { zmiany: [], obslugiwaneTabeleFinansowe: TABELE_FINANSOW_WSPOLNYCH, liczbaRekordowFinansowych: 0 }))
    await repo.pobierzZmiany('1970-01-01')
    vi.mocked(CapacitorHttp.post).mockResolvedValue(odpowiedz(200, { zapisano: 1 }))
    await repo.wyslijZmiany([zmianaFinansowa])
    expect(CapacitorHttp.post).toHaveBeenCalledTimes(1)
    vi.mocked(CapacitorHttp.post).mockResolvedValue(odpowiedz(200, { zapisano: 0, pominiete: [{ tabela: 'wspolneKasy' }] }))
    await expect(repo.wyslijZmiany([zmianaFinansowa])).rejects.toThrow('pominął')
  })

  it('nie przyjmuje niepełnego obrazu finansów ani nie przesuwa jego kursora', async () => {
    const repo = new RepozytoriumZdalneHttp('https://example.test', () => 'instalacja-testowa')
    vi.mocked(CapacitorHttp.get).mockResolvedValue(odpowiedz(200, { zmiany: [zmianaFinansowa], obslugiwaneTabeleFinansowe: TABELE_FINANSOW_WSPOLNYCH, liczbaRekordowFinansowych: 2, synchronizowanoDo: '2026-10-29T13:00:00.000Z' }))
    await expect(repo.pobierzZmiany('1970-01-01')).rejects.toThrow('Niepełna')
    expect(repo.pobierzKursor()).toBeUndefined()
  })

  it('blokuje finansowy odczyt i zapis Edytora także przy bezpośrednim wywołaniu transportu', async () => {
    ustawBiezacyDostep((modul) => modul === 'finanse')
    vi.mocked(pobierzKontoOffline).mockReturnValue({ rola: 'edytor', granty: [{ modul: 'finanse', odczyt: true, edycja: true, status: 'aktywne' }] } as never)
    const repo = new RepozytoriumZdalneHttp('https://example.test', () => 'instalacja-testowa')
    vi.mocked(CapacitorHttp.get).mockResolvedValue(odpowiedz(200, { zmiany: [zmianaFinansowa], obslugiwaneTabeleFinansowe: TABELE_FINANSOW_WSPOLNYCH, liczbaRekordowFinansowych: 1 }))
    await expect(repo.pobierzZmiany('1970-01-01')).rejects.toThrow('właściciela')
    await expect(repo.wyslijZmiany([zmianaFinansowa])).rejects.toThrow('właściciela')
    expect(CapacitorHttp.post).not.toHaveBeenCalled()
  })
  it('wykonuje sync GET przez cookie bez Bearera i z credentials', async () => {
    vi.mocked(CapacitorHttp.get).mockResolvedValue(odpowiedz(200, { zmiany: [], synchronizowanoDo: '2026-09-16T00:00:00Z' }))
    const repo = new RepozytoriumZdalneHttp('https://raspberrypi.tailb0bcf2.ts.net', () => 'instalacja-testowa')

    await expect(repo.pobierzZmiany('1970-01-01')).resolves.toEqual([])

    expect(CapacitorHttp.get).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://raspberrypi.tailb0bcf2.ts.net/api/sync/changes?od=1970-01-01&finanseWspolne=1',
      connectTimeout: 15000,
      readTimeout: 15000,
      webFetchExtra: { credentials: 'include' },
      headers: {
        'x-ogarniacz-installation-id': 'instalacja-testowa',
      },
    }))
    expect(CapacitorHttp.get).not.toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({ authorization: expect.any(String) }),
    }))
    expect(repo.pobierzKursor()).toBe('2026-09-16T00:00:00Z')
  })

  it('wykonuje sync POST przez cookie, credentials i CSRF bez Bearera', async () => {
    vi.mocked(CapacitorHttp.post).mockResolvedValue(odpowiedz(200, { zapisano: 0 }))
    const repo = new RepozytoriumZdalneHttp('https://raspberrypi.tailb0bcf2.ts.net', () => 'instalacja-testowa')

    await repo.wyslijZmiany([])

    expect(CapacitorHttp.post).toHaveBeenCalledWith(expect.objectContaining({
      webFetchExtra: { credentials: 'include' },
      headers: {
        'content-type': 'application/json',
        'x-ogarniacz-csrf': 'csrf-testowy',
        'x-ogarniacz-installation-id': 'instalacja-testowa',
      },
    }))
  })

  it('odtwarza sesję i CSRF przed synchronizacją po restarcie aplikacji', async () => {
    vi.mocked(pobierzCsrfKonta).mockReturnValue(undefined)
    vi.mocked(pobierzKontoOffline).mockReturnValue({ zalogowany: true } as never)
    vi.mocked(pobierzSesjeKonta).mockResolvedValue({ zalogowany: true, csrf: 'nowy-csrf' } as never)
    vi.mocked(CapacitorHttp.get).mockResolvedValue(odpowiedz(200, { zmiany: [] }))
    const repo = new RepozytoriumZdalneHttp('https://raspberrypi.tailb0bcf2.ts.net', () => 'instalacja-testowa')

    await repo.pobierzZmiany('1970-01-01')

    expect(pobierzSesjeKonta).toHaveBeenCalledOnce()
    expect(CapacitorHttp.get).toHaveBeenCalledOnce()
  })

  it('rozróżnia brak sesji od sesji wygasłej przy 401', async () => {
    vi.mocked(pobierzCsrfKonta).mockReturnValue(undefined)
    vi.mocked(pobierzSesjeKonta).mockRejectedValue(new BladKonta(401, 'Brak sesji.'))
    const repoBezSesji = new RepozytoriumZdalneHttp('https://raspberrypi.tailb0bcf2.ts.net')

    await expect(repoBezSesji.pobierzZmiany('1970-01-01')).rejects.toMatchObject({ rodzaj: 'brak_sesji' })

    vi.mocked(pobierzKontoOffline).mockReturnValue({ zalogowany: true } as never)
    const repoZWygaslaSesja = new RepozytoriumZdalneHttp('https://raspberrypi.tailb0bcf2.ts.net')
    await expect(repoZWygaslaSesja.pobierzZmiany('1970-01-01')).rejects.toMatchObject({ rodzaj: 'sesja_wygasla' })
  })

  it('traktuje 401 z API synchronizacji jako wygasłą sesję bez fallbacku Bearer', async () => {
    vi.mocked(CapacitorHttp.get).mockResolvedValue(odpowiedz(401, { error: 'Brak dostępu do synchronizacji.' }))
    const repo = new RepozytoriumZdalneHttp('https://raspberrypi.tailb0bcf2.ts.net', () => 'instalacja-testowa')

    await expect(repo.pobierzZmiany('1970-01-01')).rejects.toMatchObject({ rodzaj: 'sesja_wygasla' })
    expect(CapacitorHttp.get).not.toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({ authorization: expect.any(String) }),
    }))
  })

  it('po 403 CSRF odświeża sesję i ponawia zapis bez Bearera', async () => {
    vi.mocked(pobierzCsrfKonta)
      .mockReturnValueOnce('csrf-stary')
      .mockReturnValueOnce('csrf-stary')
      .mockReturnValue('csrf-nowy')
    vi.mocked(pobierzSesjeKonta).mockResolvedValue({ zalogowany: true, csrf: 'csrf-nowy' } as never)
    vi.mocked(CapacitorHttp.post)
      .mockResolvedValueOnce(odpowiedz(403, { error: 'Sesja wymaga odświeżenia.' }))
      .mockResolvedValueOnce(odpowiedz(200, { zapisano: 0 }))
    const repo = new RepozytoriumZdalneHttp('https://raspberrypi.tailb0bcf2.ts.net', () => 'instalacja-testowa')

    await repo.wyslijZmiany([])

    expect(pobierzSesjeKonta).toHaveBeenCalledOnce()
    expect(CapacitorHttp.post).toHaveBeenCalledTimes(2)
    expect(vi.mocked(CapacitorHttp.post).mock.calls[1][0].headers).toMatchObject({ 'x-ogarniacz-csrf': 'csrf-nowy' })
    expect(vi.mocked(CapacitorHttp.post).mock.calls.flatMap(([opcje]) => Object.keys(opcje.headers ?? {}))).not.toContain('authorization')
  })

  it('rozpoznaje błąd DNS jako brak połączenia i wskazuje Tailscale', async () => {
    vi.mocked(CapacitorHttp.get).mockRejectedValue({ message: 'Unable to resolve host raspberrypi.tailb0bcf2.ts.net' })
    const repo = new RepozytoriumZdalneHttp('https://raspberrypi.tailb0bcf2.ts.net', () => 'instalacja-testowa')

    await expect(repo.pobierzZmiany('1970-01-01')).rejects.toMatchObject({
      rodzaj: 'brak_polaczenia',
      message: expect.stringContaining('Tailscale'),
    })
  })
})
