import { afterEach, expect, it, vi } from 'vitest'
import { App } from '@capacitor/app'
import { CapacitorHttp } from '@capacitor/core'
import { utworzUslugeAktualizacji } from './AktualizacjeService'

const { pobierzApk, usunNasluchiwanie } = vi.hoisted(() => ({ pobierzApk: vi.fn(), usunNasluchiwanie: vi.fn(async () => undefined) }))

vi.mock('../services/RuntimeConfigService', () => ({
  pobierzKonfiguracjeRuntime: () => ({ androidUpdateManifestUrl: 'https://github.com/kapi1944/Ogarniacz/releases/latest/download/latest.json' }),
  pobierzDiagnostykeRuntime: () => '',
}))
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })

it('wykrywa 1.0.12 na 1.0.11 i rozwiązuje względny URL publicznego APK', async () => {
  vi.spyOn(App, 'getInfo').mockResolvedValue({ id: 'pl.ogarniacz.app', name: 'Ogarniacz', version: '1.0.11', build: '1000011' })
  vi.spyOn(CapacitorHttp, 'get').mockResolvedValue({ status: 200, headers: {}, url: '', data: JSON.stringify({ versionName: '1.0.12', versionCode: 1000012, apkUrl: 'Ogarniacz-1.0.12-release.apk', sha256: 'a'.repeat(64), size: 55155125 }) })
  await expect(utworzUslugeAktualizacji(true).sprawdz()).resolves.toMatchObject({ czyNowsza: true, adresApk: 'https://github.com/kapi1944/Ogarniacz/releases/latest/download/Ogarniacz-1.0.12-release.apk' })
})

it('nie udaje dostępności APK po błędzie serwera manifestu', async () => {
  vi.spyOn(CapacitorHttp, 'get').mockResolvedValue({ status: 503, headers: {}, url: '', data: {} })
  await expect(utworzUslugeAktualizacji(true).sprawdz()).rejects.toThrow('503')
})

it('śledzi przekierowania GitHub i przypina względny APK do wersji manifestu zamiast ruchomego latest lub CDN', async () => {
  vi.spyOn(App, 'getInfo').mockResolvedValue({ id: 'pl.ogarniacz.app', name: 'Ogarniacz', version: '1.0.23', build: '1000023' })
  const zadanie = vi.spyOn(CapacitorHttp, 'get')
    .mockResolvedValueOnce({ status: 302, headers: { Location: '/kapi1944/Ogarniacz/releases/download/v1.1.0/latest.json' }, url: '', data: '' })
    .mockResolvedValueOnce({ status: 302, headers: { location: 'https://release-assets.githubusercontent.com/manifest?token=ukryty' }, url: '', data: '' })
    .mockResolvedValueOnce({ status: 200, headers: {}, url: '', data: { versionName: '1.1.0', versionCode: 1001000, apkUrl: 'Ogarniacz-1.1.0-release.apk', sha256: 'a'.repeat(64) } })
  await expect(utworzUslugeAktualizacji(true).sprawdz()).resolves.toMatchObject({ czyNowsza: true, adresApk: 'https://github.com/kapi1944/Ogarniacz/releases/download/v1.1.0/Ogarniacz-1.1.0-release.apk' })
  expect(zadanie).toHaveBeenCalledTimes(3)
  expect(zadanie.mock.calls.every(([opcje]) => opcje.disableRedirects === true)).toBe(true)
})

it.each(['http://example.test/latest.json', 'https://login:sekret@example.test/latest.json'])('odrzuca niebezpieczne przekierowanie manifestu %s', async (cel) => {
  const zadanie = vi.spyOn(CapacitorHttp, 'get').mockResolvedValue({ status: 302, headers: { location: cel }, url: '', data: '' })
  await expect(utworzUslugeAktualizacji(true).sprawdz()).rejects.toThrow('HTTPS bez danych logowania')
  expect(zadanie).toHaveBeenCalledTimes(1)
})

it('przerywa pętlę przekierowań manifestu', async () => {
  const zadanie = vi.spyOn(CapacitorHttp, 'get').mockResolvedValue({ status: 307, headers: { location: '/latest.json' }, url: '', data: '' })
  await expect(utworzUslugeAktualizacji(true).sprawdz()).rejects.toThrow('limit przekierowań')
  expect(zadanie).toHaveBeenCalledTimes(6)
})

it('komunikat o błędzie sieci manifestu nie ujawnia adresu CDN ani jego tokenu', async () => {
  vi.spyOn(CapacitorHttp, 'get').mockRejectedValue(new Error('https://cdn.example.test?token=sekret'))
  await expect(utworzUslugeAktualizacji(true).sprawdz()).rejects.toThrow('Konto i Raspberry Pi nie są wymagane')
})

it('zgłasza nieprawidłowy JSON zamiast technicznego wyjątku parsera', async () => {
  vi.spyOn(CapacitorHttp, 'get').mockResolvedValue({ status: 200, headers: {}, url: '', data: '<html>przerwa</html>' })
  await expect(utworzUslugeAktualizacji(true).sprawdz()).rejects.toThrow('prawidłowego latest.json')
})

it('nie zastępuje nieznanego natywnego versionCode numerem wyliczonym z versionName', async () => {
  vi.spyOn(App, 'getInfo').mockResolvedValue({ id: 'pl.ogarniacz.app', name: 'Ogarniacz', version: '1.0.11', build: 'brak' })
  await expect(utworzUslugeAktualizacji(true).pobierzInformacje()).rejects.toThrow('versionCode')
})

it('przekazuje liczby manifestu do pluginu, zachowuje diagnostykę i sprząta nasłuchiwanie przed ręcznym ponowieniem', async () => {
  const manifest = { versionName: '1.0.18', versionCode: 1000018, apkUrl: 'Ogarniacz-1.0.18-release.apk', sha256: 'a'.repeat(64), size: 55241786 }
  const adres = 'https://github.com/kapi1944/Ogarniacz/releases/latest/download/Ogarniacz-1.0.18-release.apk'
  const blad = { code: 'BLAD_HTTP', data: { http: 403, proba: 1 } }
  const wynik = { nazwaPliku: manifest.apkUrl, sha256: manifest.sha256 }
  pobierzApk.mockRejectedValueOnce(blad).mockResolvedValueOnce(wynik)
  const usluga = utworzUslugeAktualizacji(true)
  await expect(usluga.pobierz(manifest, adres, vi.fn())).rejects.toBe(blad)
  expect(pobierzApk).toHaveBeenCalledTimes(1)
  expect(usunNasluchiwanie).toHaveBeenCalledTimes(1)
  await expect(usluga.pobierz(manifest, adres, vi.fn())).resolves.toEqual(wynik)
  expect(pobierzApk).toHaveBeenLastCalledWith({
    adres, sha256: manifest.sha256, nazwaPliku: manifest.apkUrl, wersjaDocelowa: '1.0.18', versionCodeDocelowy: 1000018, rozmiar: 55241786,
  })
  expect(pobierzApk).toHaveBeenCalledTimes(2)
  expect(usunNasluchiwanie).toHaveBeenCalledTimes(2)
})

vi.mock('@capacitor/core', async (oryginal) => ({
  ...await oryginal<typeof import('@capacitor/core')>(),
  CapacitorHttp: { get: vi.fn() },
  registerPlugin: () => ({ pobierzApk, addListener: async () => ({ remove: usunNasluchiwanie }) }),
}))
vi.mock('@capacitor/app', () => ({ App: { getInfo: vi.fn() } }))
