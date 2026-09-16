import type { EncjaBazowa } from './typy'

let licznikId = 0

// Identyfikatory rekordów, nie tokeny uwierzytelnienia ani klucze kryptograficzne.
export function noweId(): string {
  const kryptografia = globalThis.crypto
  if (typeof kryptografia?.randomUUID === 'function') return kryptografia.randomUUID()
  const bajty = new Uint8Array(16)
  if (typeof kryptografia?.getRandomValues === 'function') {
    kryptografia.getRandomValues(bajty)
  } else {
    // Awaryjne środowiska bez Web Crypto: czas i licznik uzupełniają losowość.
    let znacznik = (BigInt(Date.now()) << 32n) | BigInt(++licznikId)
    for (let indeks = 0; indeks < bajty.length; indeks++) {
      bajty[indeks] = Math.floor(Math.random() * 256) ^ Number(znacznik & 255n)
      znacznik >>= 8n
    }
  }
  bajty[6] = (bajty[6] & 15) | 64
  bajty[8] = (bajty[8] & 63) | 128
  const zapis = Array.from(bajty, (bajt) => bajt.toString(16).padStart(2, '0')).join('')
  return `${zapis.slice(0, 8)}-${zapis.slice(8, 12)}-${zapis.slice(12, 16)}-${zapis.slice(16, 20)}-${zapis.slice(20)}`
}

export function terazIso(): string {
  return new Date().toISOString()
}

export function utworzMetadane(id = noweId()): EncjaBazowa {
  const teraz = terazIso()
  return { id, createdAt: teraz, updatedAt: teraz }
}

export function zAktualizacja<T extends EncjaBazowa>(encja: T, zmiany: Partial<T>): T {
  return { ...encja, ...zmiany, updatedAt: terazIso() }
}

export function dzisiajIso(data = new Date()): string {
  const rok = data.getFullYear()
  const miesiac = String(data.getMonth() + 1).padStart(2, '0')
  const dzien = String(data.getDate()).padStart(2, '0')
  return `${rok}-${miesiac}-${dzien}`
}
