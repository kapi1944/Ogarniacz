import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const pochodzenieCapacitor = 'https://localhost'
const dozwoloneNaglowkiSynchronizacji = ['Authorization', 'Content-Type', 'X-Ogarniacz-Installation-Id']

function odczytajWartoscEnv(nazwa, katalogRepozytorium, env) {
  if (env[nazwa]?.trim()) return env[nazwa].trim()
  let wartosc
  for (const nazwaPliku of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const sciezka = join(katalogRepozytorium, nazwaPliku)
    if (!existsSync(sciezka)) continue
    for (const linia of readFileSync(sciezka, 'utf8').split(/\r?\n/)) {
      const dopasowanie = new RegExp(`^\\s*${nazwa}\\s*=\\s*(.*)$`).exec(linia)
      if (!dopasowanie) continue
      wartosc = dopasowanie[1].trim().replace(/^(['"])(.*)\1$/, '$2').trim()
    }
  }
  return wartosc
}

function czyPrywatnyAdresIpv4(host) {
  const czesci = host.split('.').map(Number)
  if (czesci.length !== 4 || czesci.some((czesc) => !Number.isInteger(czesc) || czesc < 0 || czesc > 255)) return false
  return czesci[0] === 10
    || czesci[0] === 127
    || (czesci[0] === 192 && czesci[1] === 168)
    || (czesci[0] === 172 && czesci[1] >= 16 && czesci[1] <= 31)
}

export function pobierzKonfiguracjeSynchronizacji(katalogRepozytorium, env = process.env) {
  return {
    adresApi: odczytajWartoscEnv('VITE_SYNC_API_URL', katalogRepozytorium, env),
    kluczDostepu: odczytajWartoscEnv('VITE_SYNC_ACCESS_KEY', katalogRepozytorium, env),
  }
}

export function sprawdzAdresSynchronizacji(adresApi) {
  if (!adresApi?.trim()) throw new Error('Brak VITE_SYNC_API_URL.')
  let adres
  try {
    adres = new URL(adresApi)
  } catch {
    throw new Error('VITE_SYNC_API_URL musi być prawidłowym adresem URL.')
  }
  if (adres.pathname !== '/' || adres.search || adres.hash) {
    throw new Error('VITE_SYNC_API_URL musi wskazywać sam origin serwera, bez ścieżki, query i hash.')
  }
  if (adres.protocol === 'https:') return adres
  if (adres.protocol !== 'http:') throw new Error('VITE_SYNC_API_URL musi używać HTTP albo HTTPS.')
  const host = adres.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || czyPrywatnyAdresIpv4(host)) return adres
  throw new Error('HTTP dla synchronizacji jest dozwolony wyłącznie dla localhost, .local albo prywatnego IPv4.')
}

export function utworzKonfiguracjeBezpieczenstwaSieci(adresApi) {
  if (!adresApi?.trim()) return '<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n    <base-config cleartextTrafficPermitted="false" />\n</network-security-config>\n'
  const adres = sprawdzAdresSynchronizacji(adresApi)
  if (adres.protocol === 'https:') return '<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n    <base-config cleartextTrafficPermitted="false" />\n</network-security-config>\n'
  return `<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n    <base-config cleartextTrafficPermitted="false" />\n    <domain-config cleartextTrafficPermitted="true">\n        <domain includeSubdomains="false">${adres.hostname}</domain>\n    </domain-config>\n</network-security-config>\n`
}

export function pobierzPochodzenieCapacitor() {
  return pochodzenieCapacitor
}

export function pobierzDozwoloneNaglowkiSynchronizacji() {
  return [...dozwoloneNaglowkiSynchronizacji]
}
