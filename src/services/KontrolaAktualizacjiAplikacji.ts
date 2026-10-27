import { platforma } from '../platform/platforma'
import type { WynikSprawdzeniaAktualizacji } from '../platform/typy'

const KLUCZ_OSTATNIEJ_KONTROLI = 'ogarniacz:ostatnia-kontrola-aktualizacji'
const KLUCZ_CZESTOTLIWOSCI = 'ogarniacz:czestotliwosc-aktualizacji-apk'
export const CZESTOTLIWOSCI_AKTUALIZACJI = [1, 4, 12, 24, 0] as const

function odczytajCzestotliwosc() {
  try {
    const zapisana = window.localStorage.getItem(KLUCZ_CZESTOTLIWOSCI)
    const godziny = zapisana?.trim() ? Number(zapisana) : 4
    return CZESTOTLIWOSCI_AKTUALIZACJI.some((wartosc) => wartosc === godziny) ? godziny : 4
  } catch {
    return 4
  }
}

export interface StanKontroliAktualizacji {
  wynikApk?: WynikSprawdzeniaAktualizacji
  bladApk?: string
  sprawdzono: boolean
  czestotliwoscGodzin: number
}

let stan: StanKontroliAktualizacji = { sprawdzono: false, czestotliwoscGodzin: odczytajCzestotliwosc() }
let inicjalizacja: Promise<() => void> | undefined
let trwajacaKontrola: Promise<WynikSprawdzeniaAktualizacji> | undefined
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
  const ostatniaKontrola = odczytajOstatniaKontrole()
  return stan.czestotliwoscGodzin > 0 && (Date.now() < ostatniaKontrola || Date.now() - ostatniaKontrola >= stan.czestotliwoscGodzin * 60 * 60 * 1000)
}

export function zapiszCzestotliwoscAktualizacji(godziny: number) {
  if (!CZESTOTLIWOSCI_AKTUALIZACJI.some((wartosc) => wartosc === godziny)) throw new Error('Nieprawidłowa częstotliwość sprawdzania aktualizacji.')
  try { window.localStorage.setItem(KLUCZ_CZESTOTLIWOSCI, String(godziny)) }
  catch { throw new Error('Nie udało się zapisać częstotliwości sprawdzania aktualizacji. Spróbuj ponownie.') }
  zapiszStan({ czestotliwoscGodzin: godziny })
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
  if (trwajacaKontrola) return trwajacaKontrola
  trwajacaKontrola = wykonajKontroleApk()
  try { return await trwajacaKontrola }
  finally { trwajacaKontrola = undefined }
}

async function wykonajKontroleApk() {
  try {
    const wynikApk = await platforma.aktualizacje.sprawdz()
    zapiszStan({ wynikApk, bladApk: undefined, sprawdzono: true })
    return wynikApk
  } catch (blad) {
    const bladApk = tekstBledu(blad, 'Nie udało się sprawdzić aktualizacji aplikacji.')
    zapiszStan({ wynikApk: undefined, bladApk, sprawdzono: true })
    throw blad
  }
}

export async function sprawdzAktualizacjeTeraz() {
  await sprawdzAktualizacjeApk().catch(() => undefined)
}

export function inicjalizujKontroleAktualizacjiAplikacji(): Promise<() => void> {
  inicjalizacja ??= (async () => {
    const sprawdzAutomatycznie = () => {
      if (!platforma.natywna || !czyWymagaAutomatycznejKontroli()) return
      zapiszOstatniaKontrole()
      void sprawdzAktualizacjeTeraz()
    }

    if (platforma.natywna && stan.czestotliwoscGodzin > 0) {
      zapiszOstatniaKontrole()
      void sprawdzAktualizacjeTeraz()
    }
    const zatrzymajCyklZycia = await platforma.cyklZycia.nasluchuj((stanCykluZycia) => {
      if (stanCykluZycia === 'aktywny') sprawdzAutomatycznie()
    })
    return zatrzymajCyklZycia
  })()
  return inicjalizacja
}
