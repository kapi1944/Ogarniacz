import { CapacitorHttp } from '@capacitor/core'
import { pobierzKonfiguracjeSynchronizacji } from './KonfiguracjaSynchronizacji'

const KLUCZ_CSRF = 'ogarniacz-csrf'
const KLUCZ_KONTA_OFFLINE = 'ogarniacz-konto-offline'

export interface GrantKonta {
  id: string
  editorId: string
  modul: string
  sekcja?: string
  odczyt: boolean
  edycja: boolean
  status: 'aktywne' | 'cofniete'
}

export interface EdytorKonta {
  id: string
  email: string
  status: 'aktywne' | 'cofniete'
}

export interface KontoUzytkownika {
  zalogowany: true
  uzytkownikId: string
  wlascicielId: string
  email: string
  rola: 'wlasciciel' | 'edytor'
  csrf?: string
  granty: GrantKonta[]
  edytorzy: EdytorKonta[]
  kodyOdzyskiwania?: string[]
}

interface OdpowiedzBledu {
  error?: string
}

export class BladKonta extends Error {
  constructor(public readonly status: number, komunikat: string) {
    super(komunikat)
    this.name = 'BladKonta'
  }
}

function adresApi(): string {
  const konfiguracja = pobierzKonfiguracjeSynchronizacji()
  if (!konfiguracja.adresApi) throw new Error(konfiguracja.blad ?? 'Połączenie z serwerem kont nie jest skonfigurowane.')
  return konfiguracja.adresApi
}

function zapiszKonto(konto: KontoUzytkownika): KontoUzytkownika {
  if (konto.csrf) sessionStorage.setItem(KLUCZ_CSRF, konto.csrf)
  localStorage.setItem(KLUCZ_KONTA_OFFLINE, JSON.stringify({ ...konto, csrf: undefined, kodyOdzyskiwania: undefined }))
  return konto
}

async function wykonaj<T>(metoda: 'GET' | 'POST' | 'PUT', sciezka: string, dane?: unknown, csrf = false): Promise<T> {
  const tokenCsrf = csrf ? pobierzCsrfKonta() : undefined
  const odpowiedz = await CapacitorHttp.request({
    method: metoda,
    url: `${adresApi()}${sciezka}`,
    headers: {
      ...(dane === undefined ? {} : { 'content-type': 'application/json' }),
      ...(tokenCsrf ? { 'x-ogarniacz-csrf': tokenCsrf } : {}),
    },
    data: dane,
    connectTimeout: 15_000,
    readTimeout: 15_000,
    webFetchExtra: { credentials: 'include' },
  })
  if (odpowiedz.status < 200 || odpowiedz.status >= 300) {
    const blad = odpowiedz.data && typeof odpowiedz.data === 'object' ? odpowiedz.data as OdpowiedzBledu : {}
    throw new BladKonta(odpowiedz.status, blad.error ?? 'Serwer kont odrzucił żądanie.')
  }
  return odpowiedz.data as T
}

export function pobierzCsrfKonta(): string | undefined {
  return typeof sessionStorage === 'undefined' ? undefined : sessionStorage.getItem(KLUCZ_CSRF) ?? undefined
}

export function pobierzKontoOffline(): KontoUzytkownika | undefined {
  if (typeof localStorage === 'undefined') return undefined
  try {
    const dane = JSON.parse(localStorage.getItem(KLUCZ_KONTA_OFFLINE) ?? 'null') as KontoUzytkownika | null
    return dane?.zalogowany === true ? dane : undefined
  } catch {
    return undefined
  }
}

export async function pobierzSesjeKonta(): Promise<KontoUzytkownika> {
  return zapiszKonto(await wykonaj<KontoUzytkownika>('GET', '/api/auth/session'))
}

export async function zaloguj(email: string, haslo: string): Promise<KontoUzytkownika> {
  return zapiszKonto(await wykonaj<KontoUzytkownika>('POST', '/api/auth/login', { email, haslo }))
}

export async function utworzKontoWlasciciela(email: string, haslo: string, token: string): Promise<KontoUzytkownika> {
  return zapiszKonto(await wykonaj<KontoUzytkownika>('POST', '/api/auth/bootstrap', { email, haslo, token }))
}

export async function przyjmijZaproszenie(token: string, haslo: string): Promise<KontoUzytkownika> {
  return zapiszKonto(await wykonaj<KontoUzytkownika>('POST', '/api/auth/invitations/accept', { token, haslo }))
}

export async function odzyskajDostep(email: string, kod: string, noweHaslo: string): Promise<void> {
  await wykonaj('POST', '/api/auth/recover', { email, kod, noweHaslo })
}

export async function wyloguj(): Promise<void> {
  await wykonaj('POST', '/api/auth/logout', {}, true)
  sessionStorage.removeItem(KLUCZ_CSRF)
  localStorage.removeItem(KLUCZ_KONTA_OFFLINE)
}

export async function zaprosEdytora(email: string): Promise<{ token: string; wygasaAt: string }> {
  return wykonaj('POST', '/api/account/invitations', { email }, true)
}

export async function zapiszGrant(editorId: string, modul: string, odczyt: boolean, edycja: boolean): Promise<void> {
  await wykonaj('PUT', '/api/account/grants', { editorId, modul, odczyt, edycja }, true)
}

export async function cofnijGrant(id: string): Promise<void> {
  await wykonaj('POST', '/api/account/grants/revoke', { id }, true)
}

export async function cofnijEdytora(editorId: string): Promise<void> {
  await wykonaj('POST', '/api/account/editors/revoke', { editorId }, true)
}
