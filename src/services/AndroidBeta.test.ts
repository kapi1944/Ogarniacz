import { CapacitorHttp } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { afterEach, expect, it, vi } from 'vitest'
import { pobierzKonfiguracjeSynchronizacji } from './KonfiguracjaSynchronizacji'
import { utworzRuntimeConfigService } from './RuntimeConfigService'
import { RepozytoriumZdalneHttp } from '../data/RepozytoriumZdalneHttp'
import { utworzHarmonogramPrzypomnienAndroid } from '../platform/HarmonogramPrzypomnienAndroid'
import { utworzUslugePowiadomien } from '../platform/NotificationService'
import { parsujDeepLink } from '../platform/trasy'

vi.mock('@capacitor/core', async (oryginal) => ({
  ...await oryginal<typeof import('@capacitor/core')>(),
  CapacitorHttp: { get: vi.fn(), post: vi.fn(), request: vi.fn() },
}))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: { schedule: vi.fn() } }))

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
it('Beta ignoruje odziedziczone API, własny HTTPS i natywny endpoint produkcji', async () => {
  vi.stubEnv('VITE_KANAL_BETA', 'true')
  const serwis = utworzRuntimeConfigService({ czyAndroid: true, konfiguracjaWeb: { syncApiUrl: 'https://produkcja.test' }, pochodzenieWeb: 'https://produkcja.test', pobierzKonfiguracjeNatywna: async () => ({ kanalBeta: true, syncApiUrl: 'https://produkcja.test' }) })
  expect(serwis.pobierz().syncApiUrl).toBeUndefined()
  await serwis.inicjalizuj()
  expect(serwis.pobierz().syncApiUrl).toBeUndefined()
  expect(pobierzKonfiguracjeSynchronizacji({ VITE_SYNC_API_URL: 'https://produkcja.test' }).adresApi).toBeUndefined()
})
it('Beta blokuje push/pull również dla repozytorium utworzonego z jawnym adresem', async () => {
  vi.stubEnv('VITE_KANAL_BETA', 'true')
  const pobierz = vi.spyOn(CapacitorHttp, 'get')
  const wyslij = vi.spyOn(CapacitorHttp, 'post')
  const zadanie = vi.spyOn(CapacitorHttp, 'request')
  const repozytorium = new RepozytoriumZdalneHttp('https://produkcja.test')
  await expect(repozytorium.pobierzZmiany('1970-01-01')).rejects.toThrow('Beta')
  await expect(repozytorium.wyslijZmiany([])).rejects.toThrow('Beta')
  expect(pobierz).not.toHaveBeenCalled()
  expect(wyslij).not.toHaveBeenCalled()
  expect(zadanie).not.toHaveBeenCalled()
})
it('Beta nie dostarcza alarmów ani powiadomień i rozdziela linki', async () => {
  vi.stubEnv('VITE_KANAL_BETA', 'true')
  const zaplanuj = vi.spyOn(LocalNotifications, 'schedule')
  const harmonogram = utworzHarmonogramPrzypomnienAndroid(true)
  await harmonogram.zaplanuj([{ id: 1 } as never])
  await harmonogram.przeplanuj([])
  expect(await utworzUslugePowiadomien(true).pokaz({ tytul: 'Test', tresc: 'Test', rodzaj: 'synchronizacja' })).toBe(false)
  expect(zaplanuj).not.toHaveBeenCalled()
  expect(parsujDeepLink('ogarniacz://zadania')).toBeNull()
  expect(parsujDeepLink('ogarniacz-beta://zadania')).toBe('/zadania')
})
