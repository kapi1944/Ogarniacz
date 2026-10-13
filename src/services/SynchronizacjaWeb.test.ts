import { CapacitorHttp } from '@capacitor/core'
import { afterEach, expect, it, vi } from 'vitest'
import { inicjalizujRuntimeConfig } from './RuntimeConfigService'
import { pobierzKonfiguracjeSynchronizacji } from './KonfiguracjaSynchronizacji'
import { zaloguj, pobierzSesjeKonta } from './KontaService'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { utworzZadanie } from './ZadaniaService'
import { SyncEngine, pobierzStanSynchronizacji } from './SyncEngine'
import { RepozytoriumZdalneHttp } from '../data/RepozytoriumZdalneHttp'
import { ustawBiezacyDostep } from './UprawnieniaService'

vi.hoisted(() => {
  vi.resetModules()
  vi.stubGlobal('location', new URL('https://serwer.tailnet.ts.net/ustawienia'))
  vi.stubGlobal('__OGARNIACZ_RUNTIME_CONFIG__', undefined)
  vi.stubEnv('VITE_SYNC_API_URL', '')
})
vi.mock('@capacitor/core', async (oryginal) => ({
  ...await oryginal<typeof import('@capacitor/core')>(),
  registerPlugin: vi.fn(() => ({})),
  CapacitorHttp: { request: vi.fn(), get: vi.fn(), post: vi.fn() },
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

it('Web/PWA bez konfiguracji rozpoznaje API, loguje, odtwarza sesję i synchronizuje bez utraty lokalnego rekordu', async () => {
  ustawBiezacyDostep(() => true)
  await inicjalizujBaze()
  const zadanie = utworzZadanie({ tytul: 'Istniejące lokalne zadanie', opis: '', priorytet: 'normalny' })
  await pobierzRepozytorium('zadania').zapisz(zadanie)
  baza.close()
  await baza.open()

  try {
    await inicjalizujRuntimeConfig()
    const { adresApi } = pobierzKonfiguracjeSynchronizacji()
    expect(adresApi).toBe('https://serwer.tailnet.ts.net')
    expect(await baza.tabela('zadania').get(zadanie.id)).toEqual(zadanie)

    const konto = {
      zalogowany: true, uzytkownikId: 'wlasciciel', wlascicielId: 'wlasciciel',
      email: 'owner@example.test', rola: 'wlasciciel', csrf: 'csrf-testowy', granty: [], edytorzy: [],
    }
    vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 200, data: konto, headers: {}, url: '' })
    await zaloguj('owner@example.test', 'haslo-wylacznie-testowe')
    sessionStorage.removeItem('ogarniacz-csrf')
    await pobierzSesjeKonta()
    expect(CapacitorHttp.request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: 'POST', url: `${adresApi}/api/auth/login`, webFetchExtra: { credentials: 'include' },
    }))
    expect(CapacitorHttp.request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: 'GET', url: `${adresApi}/api/auth/session`, webFetchExtra: { credentials: 'include' },
    }))

    vi.mocked(CapacitorHttp.get).mockResolvedValue({
      status: 200, data: { zmiany: [], synchronizowanoDo: new Date().toISOString() }, headers: {}, url: '',
    })
    vi.mocked(CapacitorHttp.post).mockResolvedValue({ status: 200, data: { zapisano: 1 }, headers: {}, url: '' })
    const silnik = new SyncEngine({ czyOnline: () => true, installationId: () => 'instalacja-testowa' })
    await silnik.synchronizuj(new RepozytoriumZdalneHttp(adresApi!, () => 'instalacja-testowa'))
    expect(CapacitorHttp.post).toHaveBeenCalledWith(expect.objectContaining({
      url: `${adresApi}/api/sync/changes`, webFetchExtra: { credentials: 'include' },
      headers: expect.objectContaining({ 'x-ogarniacz-csrf': 'csrf-testowy' }),
      data: expect.objectContaining({ zmiany: expect.arrayContaining([expect.objectContaining({ rekord: zadanie })]) }),
    }))
    baza.close()
    await baza.open()
    expect(await baza.tabela('zadania').get(zadanie.id)).toEqual(zadanie)
    expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(0)
    expect(await pobierzStanSynchronizacji()).toMatchObject({ polaczenie: 'dostepne', sesjaWymagaLogowania: false })
  } finally {
    await baza.delete()
  }
})
