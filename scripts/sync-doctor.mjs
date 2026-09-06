import dns from 'node:dns/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { pobierzDozwoloneNaglowkiSynchronizacji, pobierzKonfiguracjeSynchronizacji, pobierzPochodzenieCapacitor, sprawdzAdresSynchronizacji } from './synchronizacja-wspolne.mjs'

const katalogRepozytorium = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const opcje = Object.fromEntries(process.argv.slice(2).filter((argument) => argument.startsWith('--')).map((argument) => {
  const [nazwa, wartosc] = argument.slice(2).split('=', 2)
  return [nazwa, wartosc ?? true]
}))
const konfiguracja = pobierzKonfiguracjeSynchronizacji(katalogRepozytorium)
const adresTekstowy = typeof opcje.url === 'string' ? opcje.url : konfiguracja.adresApi
const kluczDostepu = konfiguracja.kluczDostepu
let blad

function wynik(nazwa, stan, szczegoly) {
  console.log(`${nazwa.padEnd(20, '.')} ${stan}${szczegoly ? ` — ${szczegoly}` : ''}`)
  if (stan !== 'OK' && stan !== 'POMINIĘTO') blad = true
}

async function pobierz(url, opcjeZadania) {
  const kontroler = new AbortController()
  const limit = setTimeout(() => kontroler.abort(), 15_000)
  try {
    return await fetch(url, { ...opcjeZadania, signal: kontroler.signal })
  } finally {
    clearTimeout(limit)
  }
}

try {
  const adres = sprawdzAdresSynchronizacji(adresTekstowy)
  wynik('Server URL', 'OK', adres.toString())
  try {
    const rekordy = await dns.lookup(adres.hostname, { all: true })
    wynik('DNS/IP', 'OK', rekordy.map((rekord) => rekord.address).join(', '))
  } catch (bladDns) {
    wynik('DNS/IP', 'BŁĄD', bladDns instanceof Error ? bladDns.message : 'nie udało się rozwiązać hosta')
  }

  const health = await pobierz(new URL('/health', adres), { headers: { Accept: 'application/json' } })
  wynik('TCP/HTTP', health.ok ? 'OK' : 'BŁĄD', `HTTP ${health.status}`)
  let daneHealth
  try { daneHealth = await health.json() } catch {}
  wynik('Health', health.ok && daneHealth?.status === 'ok' ? 'OK' : 'BŁĄD', health.ok ? 'odpowiedź serwera Ogarniacza' : `HTTP ${health.status}`)

  const origin = pobierzPochodzenieCapacitor()
  const wymaganeNaglowki = pobierzDozwoloneNaglowkiSynchronizacji()
  const preflight = await pobierz(new URL('/api/sync/changes', adres), {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': wymaganeNaglowki.join(', ').toLowerCase(),
    },
  })
  wynik('OPTIONS', preflight.status === 204 ? 'OK' : 'BŁĄD', `HTTP ${preflight.status}`)
  const naglowki = (preflight.headers.get('access-control-allow-headers') ?? '').toLowerCase()
  const corsPoprawny = preflight.headers.get('access-control-allow-origin') === origin
    && wymaganeNaglowki.every((naglowek) => naglowki.includes(naglowek.toLowerCase()))
  wynik('CORS origin', preflight.headers.get('access-control-allow-origin') === origin ? 'OK' : 'BŁĄD', origin)
  wynik('CORS headers', corsPoprawny ? 'OK' : 'BŁĄD', wymaganeNaglowki.join(', '))

  if (!kluczDostepu) {
    wynik('Sync API', 'BŁĄD', 'brak VITE_SYNC_ACCESS_KEY; nie wykonano uwierzytelnionego GET')
  } else {
    const odpowiedzSync = await pobierz(new URL('/api/sync/changes?od=1970-01-01T00%3A00%3A00.000Z', adres), {
      headers: {
        Authorization: `Bearer ${kluczDostepu}`,
        'X-Ogarniacz-Installation-Id': 'sync-doctor-diagnostyka',
      },
    })
    wynik('Sync API', odpowiedzSync.ok ? 'OK' : 'BŁĄD', `HTTP ${odpowiedzSync.status}`)
  }
} catch (wyjatek) {
  wynik('Server URL', 'BŁĄD', wyjatek instanceof Error ? wyjatek.message : 'nieznany błąd konfiguracji')
}

process.exitCode = blad ? 1 : 0
