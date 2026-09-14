import { platforma } from '../platform/platforma'
import type { WynikSprawdzeniaAktualizacji, WynikSprawdzeniaAktualizacjiWeb } from '../platform/typy'

const OKRES_AUTOMATYCZNEJ_KONTROLI_MS = 4 * 60 * 60 * 1000
const KLUCZ_OSTATNIEJ_KONTROLI = 'ogarniacz:ostatnia-kontrola-aktualizacji'

export interface StanKontroliAktualizacji {
  wynikApk?: WynikSprawdzeniaAktualizacji
  wynikWeb?: WynikSprawdzeniaAktualizacjiWeb
  bladApk?: string
  bladWeb?: string
  sprawdzono: boolean
}

let stan: StanKontroliAktualizacji = { sprawdzono: false }
let inicjalizacja: Promise<() => void> | undefined
const nasluchujacy = new Set<() => void>()

function powiadom() {
  nasluchujacy.forEach((obsluga) => obsluga())
}

function zapiszStan(nowyStan: Partial<StanKontroliAktualizacji>) {
  stan = { ...stan, ...nowyStan }
  powiadom()
}

function tekstBledu(blad: unknown, domyslny: string) {
  return blad instanceof Error ? blad.message : domyslny
}

function odczytajOstatniaKontrole() {
  try {
    return Number(window.localStorage.getItem(KLUCZ_OSTATNIEJ_KONTROLI)) || 0
  } catch {
    return 0
  }
}

function zapiszOstatniaKontrole() {
  try {
    window.localStorage.setItem(KLUCZ_OSTATNIEJ_KONTROLI, String(Date.now()))
  } catch {
    // Brak dostępu do storage nie może blokować kontroli aktualizacji.
  }
}

function czyWymagaAutomatycznejKontroli() {
  return Date.now() - odczytajOstatniaKontrole() >= OKRES_AUTOMATYCZNEJ_KONTROLI_MS
}

export function pobierzStanKontroliAktualizacji() {
  return stan
}

export function nasluchujKontroliAktualizacji(obsluga: () => void) {
  nasluchujacy.add(obsluga)
  return () => nasluchujacy.delete(obsluga)
}

export async function sprawdzAktualizacjeApk() {
  if (!platforma.aktualizacje.skonfigurowane()) return undefined
  try {
    const wynikApk = await platforma.aktualizacje.sprawdz()
    zapiszStan({ wynikApk, bladApk: undefined, sprawdzono: true })
    return wynikApk
  } catch (blad) {
    const bladApk = tekstBledu(blad, 'Nie udało się sprawdzić aktualizacji aplikacji.')
    zapiszStan({ bladApk, sprawdzono: true })
    throw blad
  }
}

export async function sprawdzAktualizacjeWeb() {
  if (!platforma.aktualizacjeWeb.skonfigurowane()) return undefined
  try {
    const wynikWeb = await platforma.aktualizacjeWeb.sprawdz()
    zapiszStan({ wynikWeb, bladWeb: undefined, sprawdzono: true })
    return wynikWeb
  } catch (blad) {
    const bladWeb = tekstBledu(blad, 'Nie udało się sprawdzić szybkich poprawek.')
    zapiszStan({ bladWeb, sprawdzono: true })
    throw blad
  }
}

export async function sprawdzAktualizacjeTeraz() {
  await Promise.all([
    sprawdzAktualizacjeApk().catch(() => undefined),
    sprawdzAktualizacjeWeb().catch(() => undefined),
  ])
}

export function inicjalizujKontroleAktualizacjiAplikacji(): Promise<() => void> {
  inicjalizacja ??= (async () => {
    const sprawdzAutomatycznie = () => {
      if (!platforma.natywna || !czyWymagaAutomatycznejKontroli()) return
      zapiszOstatniaKontrole()
      void sprawdzAktualizacjeTeraz()
    }

    sprawdzAutomatycznie()
    const zatrzymajCyklZycia = await platforma.cyklZycia.nasluchuj((stanCykluZycia) => {
      if (stanCykluZycia === 'aktywny') sprawdzAutomatycznie()
    })
    return zatrzymajCyklZycia
  })()
  return inicjalizacja
}
