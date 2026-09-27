import { describe, expect, it } from 'vitest'
import { pobierzKonfiguracjeSynchronizacji } from './KonfiguracjaSynchronizacji'

describe('KonfiguracjaSynchronizacji', () => {
  it('akceptuje jeden poprawny origin endpointu', () => {
    expect(pobierzKonfiguracjeSynchronizacji({
      VITE_SYNC_API_URL: 'http://192.168.0.116:8787/',
    })).toEqual({ adresApi: 'http://192.168.0.116:8787' })
  })

  it('nie inicjuje synchronizacji dla niepełnej lub błędnej konfiguracji', () => {
    expect(pobierzKonfiguracjeSynchronizacji({ VITE_SYNC_API_URL: 'http://serwer.local/api' }).blad).toBeTruthy()
  })

  it('ignoruje legacy VITE_SYNC_ACCESS_KEY w bieżącym kliencie', () => {
    expect(pobierzKonfiguracjeSynchronizacji({
      VITE_SYNC_API_URL: 'https://raspberrypi.tailnet.ts.net',
      VITE_SYNC_ACCESS_KEY: 'klucz-starego-apk',
    })).toEqual({ adresApi: 'https://raspberrypi.tailnet.ts.net' })
  })
})
