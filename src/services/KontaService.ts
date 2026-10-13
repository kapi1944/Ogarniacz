import { CapacitorHttp } from '@capacitor/core'
import { pobierzKonfiguracjeSynchronizacji } from './KonfiguracjaSynchronizacji'
import { pobierzAktywnyProfil, pobierzSygnalProfilu, czyProfileUruchomione } from '../data/ProfileLokalne'

const KLUCZ_CSRF = 'ogarniacz-csrf'
const KLUCZ_KONTA_OFFLINE = 'ogarniacz-konto-offline'
const KLUCZ_WLASCICIELA_DANYCH = 'ogarniacz-wlasciciel-danych'
let odswiezanieSesji: Promise<KontoUzytkownika> | undefined

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

export interface SesjaKonta {
  id: string
  utworzonoAt: string
  ostatniaAktywnoscAt: string
  biezaca: boolean
  wygasaAt?: string
}

export interface KontoUzytkownika {
  zalogowany: true
  uzytkownikId: string
  wlascicielId: string
  email: string
  rola: 'wlasciciel' | 'edytor'
  login?: string | null
  nazwa?: string | null
  rolaSystemowa?: 'administrator' | 'uzytkownik'
  statusKonta?: 'aktywne' | 'nieaktywne' | 'zarchiwizowane'
  wymaganaZmianaHasla?: boolean
  csrf?: string
  granty: GrantKonta[]
  edytorzy: EdytorKonta[]
  kodyOdzyskiwania?: string[]
}

export interface StatusAktualizacjiRaspberry {
  wersja: string
  commit: string
  originStable: string | null
  dostepnosc: 'aktualna' | 'dostepna' | 'blad' | 'nieznana'
  stan: 'idle' | 'checking' | 'downloading/fetching' | 'installing' | 'building' | 'restarting' | 'success' | 'rollback' | 'error'
  komunikat: string
  moznaPrzywrocic: boolean
}

interface OdpowiedzBledu {
  error?: string
}

interface StatusBootstrapu {
  dostepny: boolean
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
  if (!localStorage.getItem(KLUCZ_WLASCICIELA_DANYCH)) localStorage.setItem(KLUCZ_WLASCICIELA_DANYCH, konto.wlascicielId)
  if (konto.csrf) sessionStorage.setItem(KLUCZ_CSRF, konto.csrf)
  localStorage.setItem(KLUCZ_KONTA_OFFLINE, JSON.stringify({ ...konto, csrf: undefined, kodyOdzyskiwania: undefined }))
  return konto
}

/** Wylogowanie nie przenosi istniejącej bazy pod kolejne konto. */
export function czyKontoZgodneZDanymiLokalnymi(): boolean {
  const profil = pobierzAktywnyProfil()
  if (profil) {
    const konto = pobierzKontoOffline()
    return !pobierzSygnalProfilu().aborted && konto?.uzytkownikId === profil.uzytkownikId
      && konto.wlascicielId === profil.wlascicielId
      && pobierzKonfiguracjeSynchronizacji().adresApi === profil.serwer
  }
  if (pobierzSygnalProfilu().aborted) return false
  const konto = pobierzKontoOffline()
  if (!konto) return true
  // Zachowaj istniejącą sesję offline podczas pierwszego uruchomienia po aktualizacji.
  if (!localStorage.getItem(KLUCZ_WLASCICIELA_DANYCH)) localStorage.setItem(KLUCZ_WLASCICIELA_DANYCH, konto.wlascicielId)
  return localStorage.getItem(KLUCZ_WLASCICIELA_DANYCH) === konto.wlascicielId
}

export function wyczyscKontoLokalne(): void {
  sessionStorage.removeItem(KLUCZ_CSRF)
  localStorage.removeItem(KLUCZ_KONTA_OFFLINE)
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
    if (odpowiedz.status === 401 && czyProfileUruchomione() && pobierzAktywnyProfil() && !['/api/auth/login', '/api/auth/recover', '/api/auth/invitations/accept'].includes(sciezka)) window.dispatchEvent(new Event('ogarniacz:sesja-wygasla'))
    const blad = odpowiedz.data && typeof odpowiedz.data === 'object' ? odpowiedz.data as OdpowiedzBledu : {}
    throw new BladKonta(odpowiedz.status, blad.error ?? 'Serwer kont odrzucił żądanie.')
  }
  return odpowiedz.data as T
}

export function pobierzCsrfKonta(): string | undefined {
  return typeof sessionStorage === 'undefined' ? undefined : sessionStorage.getItem(KLUCZ_CSRF) ?? undefined
}

export function pobierzKontoOffline(): KontoUzytkownika | undefined {
  const profil = pobierzAktywnyProfil()
  if (profil) return profil.konto
  if (czyProfileUruchomione()) return undefined
  if (typeof localStorage === 'undefined') return undefined
  try {
    const dane = JSON.parse(localStorage.getItem(KLUCZ_KONTA_OFFLINE) ?? 'null') as KontoUzytkownika | null
    return dane?.zalogowany === true ? dane : undefined
  } catch {
    return undefined
  }
}

export async function pobierzSesjeKonta(): Promise<KontoUzytkownika> {
  odswiezanieSesji ??= wykonaj<KontoUzytkownika>('GET', '/api/auth/session')
    .then((konto) => {
      const profil = pobierzAktywnyProfil()
      if (profil && (konto.uzytkownikId !== profil.uzytkownikId || konto.wlascicielId !== profil.wlascicielId)) {
        window.dispatchEvent(new Event('ogarniacz:inna-sesja'))
        throw new BladKonta(401, 'Sesja należy do innego profilu. Uruchom aplikację ponownie.')
      }
      if (profil) profil.konto = { ...konto, csrf: undefined, kodyOdzyskiwania: undefined }
      return zapiszKonto(konto)
    })
    .finally(() => { odswiezanieSesji = undefined })
  return odswiezanieSesji
}

export async function czyBootstrapDostepny(): Promise<boolean> {
  const status = await wykonaj<StatusBootstrapu>('GET', '/api/auth/bootstrap/status')
  return status.dostepny === true
}

export async function zaloguj(email: string, haslo: string): Promise<KontoUzytkownika> {
  return zmienSesje(() => wykonaj<KontoUzytkownika>('POST', '/api/auth/login', { email, haslo }).then(zapiszKonto))
}

async function zmienSesje<T>(operacja: () => Promise<T>): Promise<T> {
  if (!czyProfileUruchomione()) return operacja()
  const { zmienSesjeIPrzeladuj } = await import('./KontekstProfilu')
  return zmienSesjeIPrzeladuj(operacja)
}

export interface KontoAdministracyjne {
  id: string
  email: string
  login: string | null
  nazwa: string | null
  rolaSystemowa: 'administrator' | 'uzytkownik'
  statusKonta: 'aktywne' | 'nieaktywne' | 'zarchiwizowane'
}

export async function pobierzUzytkownikow(): Promise<KontoAdministracyjne[]> {
  return (await wykonaj<{ uzytkownicy: KontoAdministracyjne[] }>('GET', '/api/account/users')).uzytkownicy
}

export async function zapiszUzytkownika(dane: Partial<KontoAdministracyjne> & { haslo?: string }): Promise<void> {
  await wykonaj(dane.id ? 'PUT' : 'POST', '/api/account/users', dane, true)
}

export async function resetujHasloUzytkownika(id: string): Promise<{ kodOdzyskiwania: string; wygasaAt: string }> {
  return wykonaj('POST', '/api/account/users/password', { id }, true)
}

export async function utworzKontoWlasciciela(email: string, haslo: string, token: string): Promise<KontoUzytkownika> {
  return zmienSesje(() => wykonaj<KontoUzytkownika>('POST', '/api/auth/bootstrap', { email, haslo, token }).then(zapiszKonto))
}

export async function przyjmijZaproszenie(token: string, haslo: string): Promise<KontoUzytkownika> {
  return zmienSesje(() => wykonaj<KontoUzytkownika>('POST', '/api/auth/invitations/accept', { token, haslo }).then(zapiszKonto))
}

export async function odzyskajDostep(email: string, kod: string, noweHaslo: string): Promise<void> {
  await wykonaj('POST', '/api/auth/recover', { email, kod, noweHaslo })
}

export async function wyloguj(): Promise<void> {
  await zmienSesje(async () => { await wykonaj('POST', '/api/auth/logout', {}, true); wyczyscKontoLokalne() })
}

export async function zmienHaslo(aktualneHaslo: string, noweHaslo: string): Promise<void> {
  await wykonaj('POST', '/api/account/password', { aktualneHaslo, noweHaslo }, true)
  if (czyProfileUruchomione()) window.location.reload()
}

export async function pobierzListeSesji(): Promise<SesjaKonta[]> {
  const odpowiedz = await wykonaj<{ sesje: SesjaKonta[] }>('GET', '/api/account/sessions')
  return odpowiedz.sesje
}

export async function wylogujSesje(id: string): Promise<boolean> {
  const odpowiedz = await wykonaj<{ biezaca: boolean }>('POST', '/api/account/sessions/revoke', { id }, true)
  if (odpowiedz.biezaca) wyczyscKontoLokalne()
  return odpowiedz.biezaca
}

export async function wylogujWszystkieSesje(): Promise<void> {
  await zmienSesje(async () => { await wykonaj('POST', '/api/account/sessions/revoke-all', {}, true); wyczyscKontoLokalne() })
}

export async function wylogujPozostaleSesje(): Promise<void> {
  await wykonaj('POST', '/api/account/sessions/revoke-others', {}, true)
}

export async function zaprosEdytora(email: string): Promise<{ token: string; wygasaAt: string }> {
  return wykonaj('POST', '/api/account/invitations', { email }, true)
}

export async function zapiszGrant(editorId: string, modul: string, odczyt: boolean, edycja: boolean, sekcja?: string): Promise<void> {
  await wykonaj('PUT', '/api/account/grants', { editorId, modul, sekcja, odczyt, edycja }, true)
}

export async function cofnijGrant(id: string): Promise<void> {
  await wykonaj('POST', '/api/account/grants/revoke', { id }, true)
}

export async function cofnijEdytora(editorId: string): Promise<void> {
  await wykonaj('POST', '/api/account/editors/revoke', { editorId }, true)
}

export async function pobierzStatusAktualizacjiRaspberry(): Promise<StatusAktualizacjiRaspberry> {
  return wykonaj<StatusAktualizacjiRaspberry>('GET', '/api/rpi-update/status')
}

export async function uruchomAktualizacjeRaspberry(akcja: 'check' | 'start' | 'rollback'): Promise<void> {
  await wykonaj('POST', `/api/rpi-update/${akcja}`, {}, true)
}
