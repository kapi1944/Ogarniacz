import type { KontoUzytkownika } from './KontaService'
import type { StanSynchronizacji } from '../domain/typy'
import { BladKonfliktuSynchronizacji } from '../data/DostawcaSynchronizacji'

export const komunikatyBledowSynchronizacji = {
  brak_sesji: 'Zaloguj się ponownie, aby zsynchronizować dane.',
  sesja_wygasla: 'Sesja wygasła. Zaloguj się ponownie, aby zsynchronizować dane.',
  csrf: 'Nie udało się odświeżyć sesji. Zaloguj się ponownie.',
  brak_polaczenia: 'Nie można połączyć się z backendem. Sprawdź internet i połączenie Tailscale.',
  konflikt: 'Serwer zgłosił konflikt. Ponów synchronizację i sprawdź panel konfliktów.',
  blad_synchronizacji: 'Nie udało się zsynchronizować danych. Spróbuj ponownie.',
} as const

export function sklasyfikujBladSynchronizacji(blad: unknown): NonNullable<StanSynchronizacji['kodOstatniegoBledu']> {
  if (blad instanceof BladKonfliktuSynchronizacji) return 'konflikt'
  const rodzaj = typeof blad === 'object' && blad !== null && 'rodzaj' in blad ? blad.rodzaj : undefined
  return typeof rodzaj === 'string' && Object.hasOwn(komunikatyBledowSynchronizacji, rodzaj)
    ? rodzaj as NonNullable<StanSynchronizacji['kodOstatniegoBledu']>
    : 'blad_synchronizacji'
}

export interface DaneDiagnostykiSynchronizacji {
  srodowisko: 'Android' | 'Web'
  hostApi: string
  protokolApi: 'HTTP' | 'HTTPS' | 'brak'
  stanSesji: 'zalogowany' | 'niezalogowany' | 'wymaga logowania'
  stanPolaczenia: 'brak konfiguracji' | 'nie sprawdzono' | 'dostępne' | 'niedostępne' | 'offline'
  ostatniPull?: string
  ostatniPush?: string
  ostatniaProba?: string
  liczbaOczekujacych: number
  liczbaKonfliktow: number
  ostatniBlad?: { kod: string; komunikat: string; czas?: string }
  wymaganeLogowanie: boolean
  stanSynchronizacji?: StanSynchronizacji['stan']
  rola: 'Właściciel' | 'Edytor' | 'brak'
  csrf: 'dostępny' | 'brak'
  installationId: string
  trybAutoryzacji: 'sesja'
}

const ETYKIETY_STANOW_SYNCHRONIZACJI = {
  zsynchronizowano: 'zsynchronizowano',
  synchronizacja: 'synchronizacja w toku',
  oczekuje: 'oczekuje na synchronizację',
  offline: 'offline',
  konflikt: 'wymaga rozstrzygnięcia konfliktu',
  blad: 'błąd synchronizacji',
} as const

const ETYKIETY_STANOW_POLACZENIA = {
  'brak konfiguracji': 'brak konfiguracji',
  'nie sprawdzono': 'nie sprawdzono',
  dostępne: 'dostępne',
  niedostępne: 'niedostępne',
  offline: 'offline',
} as const

function formatujCzasRaportu(wartosc: string | undefined): string {
  if (!wartosc) return 'jeszcze nie wykonano'
  const czas = new Date(wartosc)
  return Number.isNaN(czas.getTime()) ? 'jeszcze nie wykonano' : czas.toISOString()
}

function formatujLiczbeRaportu(wartosc: number): string {
  return Number.isSafeInteger(wartosc) && wartosc >= 0 ? String(wartosc) : '0'
}

export function utworzTekstRaportuDiagnostycznego(dane: DaneDiagnostykiSynchronizacji, wygenerowano = new Date()): string {
  const platforma = dane.srodowisko === 'Android' ? 'Android' : 'Web'
  const konfiguracja = dane.stanPolaczenia === 'brak konfiguracji' ? 'brak konfiguracji' : 'skonfigurowana'
  const stanPolaczenia = Object.hasOwn(ETYKIETY_STANOW_POLACZENIA, dane.stanPolaczenia)
    ? ETYKIETY_STANOW_POLACZENIA[dane.stanPolaczenia]
    : 'nie sprawdzono'
  const stanLogowania = dane.stanSesji === 'zalogowany' || dane.stanSesji === 'wymaga logowania'
    ? dane.stanSesji
    : 'niezalogowany'
  const stanSynchronizacji = dane.stanSynchronizacji && Object.hasOwn(ETYKIETY_STANOW_SYNCHRONIZACJI, dane.stanSynchronizacji)
    ? ETYKIETY_STANOW_SYNCHRONIZACJI[dane.stanSynchronizacji]
    : 'nieznany'
  const kodBledu = dane.ostatniBlad && Object.hasOwn(komunikatyBledowSynchronizacji, dane.ostatniBlad.kod)
    ? dane.ostatniBlad.kod
    : 'brak'
  const czasWygenerowania = Number.isNaN(wygenerowano.getTime()) ? 'nieznany' : wygenerowano.toISOString()

  return [
    'Raport diagnostyczny synchronizacji',
    `Platforma: ${platforma}`,
    `Konfiguracja połączenia: ${konfiguracja}`,
    `Stan połączenia: ${stanPolaczenia}`,
    `Stan logowania: ${stanLogowania}`,
    `Status synchronizacji: ${stanSynchronizacji}`,
    `Ostatni pull: ${formatujCzasRaportu(dane.ostatniPull)}`,
    `Ostatni push: ${formatujCzasRaportu(dane.ostatniPush)}`,
    `Oczekujące zmiany: ${formatujLiczbeRaportu(dane.liczbaOczekujacych)}`,
    `Konflikty: ${formatujLiczbeRaportu(dane.liczbaKonfliktow)}`,
    `Kod ostatniego błędu: ${kodBledu}`,
    `Wygenerowano: ${czasWygenerowania}`,
  ].join('\n')
}

export function utworzDiagnostykeSynchronizacji({
  czyAndroid,
  adresApi,
  konto,
  csrfDostepny,
  installationId,
  stan,
}: {
  czyAndroid: boolean
  adresApi?: string
  konto?: KontoUzytkownika
  csrfDostepny: boolean
  installationId: string
  stan?: StanSynchronizacji
}): DaneDiagnostykiSynchronizacji {
  let hostApi = 'brak konfiguracji'
  let protokolApi: DaneDiagnostykiSynchronizacji['protokolApi'] = 'brak'
  if (adresApi) {
    try {
      const adres = new URL(adresApi)
      hostApi = adres.host
      protokolApi = adres.protocol === 'https:' ? 'HTTPS' : 'HTTP'
    } catch {
      hostApi = 'nieprawidłowy adres'
    }
  }
  const kod = stan?.kodOstatniegoBledu
  const ostatniBlad = kod && Object.hasOwn(komunikatyBledowSynchronizacji, kod)
    ? { kod, komunikat: komunikatyBledowSynchronizacji[kod], czas: stan?.czasOstatniegoBledu }
    : undefined
  const wymaganeLogowanie = !konto?.zalogowany || stan?.sesjaWymagaLogowania === true
  return {
    srodowisko: czyAndroid ? 'Android' : 'Web',
    hostApi,
    protokolApi,
    stanSesji: !konto?.zalogowany ? 'niezalogowany' : wymaganeLogowanie ? 'wymaga logowania' : 'zalogowany',
    stanPolaczenia: !adresApi ? 'brak konfiguracji' : stan?.polaczenie === 'dostepne' ? 'dostępne' : stan?.polaczenie === 'niedostepne' ? 'niedostępne' : stan?.polaczenie === 'offline' ? 'offline' : 'nie sprawdzono',
    ostatniPull: stan?.ostatniPull,
    ostatniPush: stan?.ostatniPush,
    ostatniaProba: stan?.ostatniaProba,
    liczbaOczekujacych: stan?.liczbaOczekujacych ?? 0,
    liczbaKonfliktow: stan?.liczbaKonfliktow ?? 0,
    ostatniBlad,
    wymaganeLogowanie,
    stanSynchronizacji: stan?.stan,
    rola: konto?.rola === 'wlasciciel' ? 'Właściciel' : konto?.rola === 'edytor' ? 'Edytor' : 'brak',
    csrf: csrfDostepny ? 'dostępny' : 'brak',
    installationId: installationId ? `${installationId.slice(0, 8)}…` : 'brak',
    trybAutoryzacji: 'sesja',
  }
}
