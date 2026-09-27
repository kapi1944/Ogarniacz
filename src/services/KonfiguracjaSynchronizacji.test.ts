import { describe, expect, it } from 'vitest'
import { pobierzKonfiguracjeSynchronizacji } from './KonfiguracjaSynchronizacji'

describe('KonfiguracjaSynchronizacji', () => {
  it('akceptuje jeden poprawny origin endpointu', () => {
    expect(pobierzKonfiguracjeSynchronizacji({
      VITE_SYNC_API_URL: 'https://serwer.tailnet.ts.net/',
    })).toEqual({ adresApi: 'https://serwer.tailnet.ts.net' })
  })

  it('nie inicjuje synchronizacji dla niepełnej lub błędnej konfiguracji', () => {
    expect(pobierzKonfiguracjeSynchronizacji({ VITE_SYNC_API_URL: 'http://serwer.local/api' }).blad).toBeTruthy()
    expect(pobierzKonfiguracjeSynchronizacji({ VITE_SYNC_API_URL: 'http://serwer.local' }).blad).toBeTruthy()
  })
})
