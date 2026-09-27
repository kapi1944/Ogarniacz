import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const pochodzenieCapacitor = 'https://localhost'
const dozwoloneNaglowkiSynchronizacji = ['Content-Type', 'X-Ogarniacz-Installation-Id', 'X-Ogarniacz-CSRF']

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

export function pobierzKonfiguracjeSynchronizacji(katalogRepozytorium, env = process.env) {
  return { adresApi: odczytajWartoscEnv('VITE_SYNC_API_URL', katalogRepozytorium, env) }
}

export function pobierzProdukcyjnaKonfiguracjeSynchronizacji(env = process.env) {
  return { adresApi: env.VITE_SYNC_API_URL?.trim() }
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
  if (adres.protocol !== 'https:') throw new Error('VITE_SYNC_API_URL musi używać HTTPS.')
  return adres
}

export function sprawdzProdukcyjnyAdresSynchronizacji(adresApi) {
  const adres = sprawdzAdresSynchronizacji(adresApi)
  return adres
}

export function utworzKonfiguracjeBezpieczenstwaSieci() {
  return '<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n    <base-config cleartextTrafficPermitted="false" />\n</network-security-config>\n'
}

export function pobierzPochodzenieCapacitor() {
  return pochodzenieCapacitor
}

export function pobierzDozwoloneNaglowkiSynchronizacji() {
  return [...dozwoloneNaglowkiSynchronizacji]
}
