import { describe, expect, it } from 'vitest'
import { pobierzKonfiguracjeSynchronizacji } from './KonfiguracjaSynchronizacji'

describe('KonfiguracjaSynchronizacji', () => {
  it('akceptuje jeden poprawny origin endpointu', () => {
    expect(pobierzKonfiguracjeSynchronizacji({
      VITE_SYNC_API_URL: 'http://192.168.0.116:8787/',
      VITE_SYNC_ACCESS_KEY: 'klucz-testowy',
    })).toEqual({ adresApi: 'http://192.168.0.116:8787', kluczDostepu: 'klucz-testowy' })
  })

  it('nie inicjuje synchronizacji dla niepełnej lub błędnej konfiguracji', () => {
    expect(pobierzKonfiguracjeSynchronizacji({ VITE_SYNC_API_URL: 'http://serwer.local/api' }).blad).toBeTruthy()
    expect(pobierzKonfiguracjeSynchronizacji({ VITE_SYNC_ACCESS_KEY: 'klucz-testowy' }).blad).toBeTruthy()
  })
})
