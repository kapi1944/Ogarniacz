import type { WynikSynchronizacji } from '../data/DostawcaSynchronizacji'
import { platforma } from '../platform/platforma'
import { komunikatyBledowSynchronizacji, sklasyfikujBladSynchronizacji } from './DiagnostykaSynchronizacji'
import type { EtapOperacjiSynchronizacji } from './SyncEngine'

const KLUCZ_POWIADOMIEN = 'ogarniacz:systemowe-powiadomienia-synchronizacji'
interface KomunikatSynchronizacji {
  id: number
  typ: 'sukces' | 'ostrzezenie'
  tresc: string
  wygasaAt: number
}
interface StanPowiadomienSynchronizacji {
  etap?: EtapOperacjiSynchronizacji
  komunikat?: KomunikatSynchronizacji
}
let stan: StanPowiadomienSynchronizacji = {}
let numerKomunikatu = 0
let ostatnieOstrzezenie: string | undefined
const nasluchujacy = new Set<() => void>()

export function czySystemowePowiadomieniaSynchronizacjiWlaczone() {
  try { return localStorage.getItem(KLUCZ_POWIADOMIEN) === 'true' } catch { return false }
}

export function ustawSystemowePowiadomieniaSynchronizacji(wlaczone: boolean) {
  localStorage.setItem(KLUCZ_POWIADOMIEN, String(wlaczone))
}

export function pobierzPowiadomieniaSynchronizacji() { return stan }
export function nasluchujPowiadomienSynchronizacji(obsluga: () => void) {
  nasluchujacy.add(obsluga)
  return () => { nasluchujacy.delete(obsluga) }
}

function zapiszStan(zmiany: StanPowiadomienSynchronizacji) {
  stan = zmiany
  nasluchujacy.forEach((obsluga) => obsluga())
}

export function zamknijKomunikatSynchronizacji(id: number) {
  if (stan.komunikat?.id === id) zapiszStan({ ...stan, komunikat: undefined })
}

export function powiadomOEtapieSynchronizacji(etap: EtapOperacjiSynchronizacji) {
  zapiszStan({ ...stan, etap })
}

function pokazKomunikat(tresc: string, typ: KomunikatSynchronizacji['typ']) {
  zapiszStan({ komunikat: { id: ++numerKomunikatu, typ, tresc, wygasaAt: Date.now() + 6000 } })
  if (czySystemowePowiadomieniaSynchronizacjiWlaczone()) {
    void platforma.powiadomienia.pokaz({ tytul: 'Ogarniacz — synchronizacja', tresc, sciezka: '/ustawienia', rodzaj: 'synchronizacja' }).catch(() => undefined)
  }
}

function pokazOstrzezenie(klucz: string, tresc: string) {
  zapiszStan({ ...stan, etap: undefined })
  if (ostatnieOstrzezenie === klucz) return
  ostatnieOstrzezenie = klucz
  pokazKomunikat(tresc, 'ostrzezenie')
}

export function powiadomOSynchronizacjiOffline() {
  pokazOstrzezenie('offline', 'Tryb offline. Dane pozostają na urządzeniu; synchronizacja wróci po odzyskaniu połączenia.')
}

export function powiadomOBladzieSynchronizacji(blad: unknown) {
  const kod = sklasyfikujBladSynchronizacji(blad)
  pokazOstrzezenie(kod, `Synchronizacja nie została zakończona. ${komunikatyBledowSynchronizacji[kod]} Oczekujące zmiany pozostają na urządzeniu.`)
}

export function powiadomOWynikuSynchronizacji(wynik: WynikSynchronizacji) {
  zapiszStan({ ...stan, etap: undefined })
  if (wynik.stan === 'offline') { powiadomOSynchronizacjiOffline(); return }
  const podsumowanie = `Synchronizacja zakończona. Wysłano: ${wynik.wyslane}, pobrano: ${wynik.pobrane}, konflikty: ${wynik.konflikty}.`
  if (wynik.stan === 'konflikt') {
    if (wynik.wyslane || wynik.pobrane) pokazKomunikat(`${podsumowanie} Sprawdź konflikty w Ustawieniach.`, 'ostrzezenie')
    else pokazOstrzezenie(`konflikt:${wynik.konflikty}`, `${podsumowanie} Sprawdź konflikty w Ustawieniach.`)
    ostatnieOstrzezenie = `konflikt:${wynik.konflikty}`
    return
  }
  ostatnieOstrzezenie = undefined
  if (wynik.wyslane || wynik.pobrane) pokazKomunikat(podsumowanie, 'sukces')
}
