export interface KonfiguracjaSynchronizacji {
  adresApi?: string
  kluczDostepu?: string
  blad?: string
}

function sprawdzAdresApi(adresApi: string): string | undefined {
  try {
    const adres = new URL(adresApi)
    if (!['http:', 'https:'].includes(adres.protocol) || adres.pathname !== '/' || adres.search || adres.hash) return undefined
    return adres.toString().replace(/\/$/, '')
  } catch {
    return undefined
  }
}

export function pobierzKonfiguracjeSynchronizacji(
  zmienne: Record<string, string | undefined> = import.meta.env,
): KonfiguracjaSynchronizacji {
  const adresApi = zmienne.VITE_SYNC_API_URL?.trim()
  const kluczDostepu = zmienne.VITE_SYNC_ACCESS_KEY?.trim()
  if (!adresApi && !kluczDostepu) return {}
  const poprawnyAdres = adresApi ? sprawdzAdresApi(adresApi) : undefined
  if (!poprawnyAdres) {
    return { blad: 'Konfiguracja endpointu synchronizacji jest niepełna lub nieprawidłowa.' }
  }
  return { adresApi: poprawnyAdres, kluczDostepu }
}
