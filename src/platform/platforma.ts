import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { obsluzWstecz } from './obslugaWstecz'
import type { DanePowiadomienia, DaneUdostepniania, PlatformaOgarniacza, StanCykluZycia } from './typy'

const czyAndroid = Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform()

function zapiszPlik(nazwa: string, dane: Blob) {
  const adres = URL.createObjectURL(dane)
  const odnosnik = document.createElement('a')
  odnosnik.href = adres
  odnosnik.download = nazwa
  odnosnik.click()
  URL.revokeObjectURL(adres)
  return Promise.resolve(true)
}

function czyPowiadomieniaDostepne() {
  return !czyAndroid && 'Notification' in window
}

async function poprosOUprawnienieDoPowiadomien() {
  if (!czyPowiadomieniaDostepne()) return false
  return (await Notification.requestPermission()) === 'granted'
}

async function pokazPowiadomienie({ tytul, tresc }: DanePowiadomienia) {
  if (!czyPowiadomieniaDostepne() || Notification.permission !== 'granted') return false
  new Notification(tytul, { body: tresc })
  return true
}

function czyUdostepnianieDostepne() {
  return typeof navigator.share === 'function'
}

async function udostepnij(dane: DaneUdostepniania) {
  if (!czyUdostepnianieDostepne()) return false
  await navigator.share({ title: dane.tytul, text: dane.tekst, url: dane.adres })
  return true
}

function czyHaptykaDostepna() {
  return typeof navigator.vibrate === 'function'
}

function wykonajDotkniecie() {
  return Promise.resolve(czyHaptykaDostepna() && navigator.vibrate(12))
}

function stanDokumentu(): StanCykluZycia {
  return document.visibilityState === 'visible' ? 'aktywny' : 'nieaktywny'
}

async function pobierzStanCykluZycia(): Promise<StanCykluZycia> {
  if (!czyAndroid) return stanDokumentu()
  return (await App.getState()).isActive ? 'aktywny' : 'nieaktywny'
}

async function nasluchujCykluZycia(obsluga: (stan: StanCykluZycia) => void) {
  if (czyAndroid) {
    const nasluchiwanie = await App.addListener('appStateChange', ({ isActive }) =>
      obsluga(isActive ? 'aktywny' : 'nieaktywny'),
    )
    return () => void nasluchiwanie.remove()
  }

  const zmienStan = () => obsluga(stanDokumentu())
  document.addEventListener('visibilitychange', zmienStan)
  return () => document.removeEventListener('visibilitychange', zmienStan)
}

export const platforma: PlatformaOgarniacza = {
  rodzaj: czyAndroid ? 'android' : 'web',
  natywna: czyAndroid,
  cyklZycia: {
    pobierzStan: pobierzStanCykluZycia,
    nasluchuj: nasluchujCykluZycia,
  },
  powiadomienia: {
    dostepne: czyPowiadomieniaDostepne,
    poprosOUprawnienie: poprosOUprawnienieDoPowiadomien,
    pokaz: pokazPowiadomienie,
  },
  pliki: {
    zapisz: zapiszPlik,
  },
  udostepnianie: {
    dostepne: czyUdostepnianieDostepne,
    udostepnij,
  },
  haptyka: {
    dostepna: czyHaptykaDostepna,
    dotkniecie: wykonajDotkniecie,
  },
  migawkiWidgetow: {
    dostepne: () => false,
    zapisz: () => Promise.resolve(false),
  },
}

let inicjalizacjaPlatformy: Promise<void> | undefined

export function inicjalizujPlatforme() {
  document.documentElement.dataset.platforma = platforma.rodzaj
  if (!czyAndroid) return Promise.resolve()

  inicjalizacjaPlatformy ??= App.addListener('backButton', () => {
    obsluzWstecz()
  }).then(() => undefined)

  return inicjalizacjaPlatformy
}
