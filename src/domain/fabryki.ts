import type { EncjaBazowa } from './typy'

export function noweId(): string {
  return crypto.randomUUID()
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
