import { afterEach, expect, it, vi } from 'vitest'
import { App } from '@capacitor/app'
import { CapacitorHttp } from '@capacitor/core'
import { utworzUslugeAktualizacji } from './AktualizacjeService'

vi.mock('../services/RuntimeConfigService', () => ({
  pobierzKonfiguracjeRuntime: () => ({ androidUpdateManifestUrl: 'https://github.com/kapi1944/Ogarniacz/releases/latest/download/latest.json' }),
  pobierzDiagnostykeRuntime: () => '',
}))
afterEach(() => vi.restoreAllMocks())

it('wykrywa 1.0.12 na 1.0.11 i rozwiązuje względny URL publicznego APK', async () => {
  vi.spyOn(App, 'getInfo').mockResolvedValue({ id: 'pl.ogarniacz.app', name: 'Ogarniacz', version: '1.0.11', build: '1000011' })
  vi.spyOn(CapacitorHttp, 'get').mockResolvedValue({ status: 200, headers: {}, url: '', data: JSON.stringify({ versionName: '1.0.12', versionCode: 1000012, apkUrl: 'Ogarniacz-1.0.12-release.apk', sha256: 'a'.repeat(64), size: 55155125 }) })
  await expect(utworzUslugeAktualizacji(true).sprawdz()).resolves.toMatchObject({ czyNowsza: true, adresApk: 'https://github.com/kapi1944/Ogarniacz/releases/latest/download/Ogarniacz-1.0.12-release.apk' })
})

it('nie udaje dostępności APK po błędzie serwera manifestu', async () => {
  vi.spyOn(CapacitorHttp, 'get').mockResolvedValue({ status: 503, headers: {}, url: '', data: {} })
  await expect(utworzUslugeAktualizacji(true).sprawdz()).rejects.toThrow('503')
})

vi.mock('@capacitor/core', async (oryginal) => ({ ...await oryginal<typeof import('@capacitor/core')>(), CapacitorHttp: { get: vi.fn() } }))
vi.mock('@capacitor/app', () => ({ App: { getInfo: vi.fn() } }))
