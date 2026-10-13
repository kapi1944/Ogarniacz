import Dexie from 'dexie'
import { baza, BazaOgarniacza, ustawBazePrzedUruchomieniem } from '../data/BazaOgarniacza'
import { rejestrProfili, zarejestrujProfilSesji, aktywujProfil, otworzBazeProfilu, zamknijKontekstProfilu, oznaczUruchomienieProfili, type ProfilLokalny } from '../data/ProfileLokalne'
import { BladKonta, pobierzSesjeKonta, wyczyscKontoLokalne } from './KontaService'
import { pobierzKonfiguracjeSynchronizacji } from './KonfiguracjaSynchronizacji'
import { zatrzymajSynchronizacjeAplikacji } from './SynchronizacjaAplikacji'
import { platforma } from '../platform/platforma'

export const ZDARZENIE_ZAMKNIECIA_PROFILU = 'ogarniacz:zamknij-profil'
const KLUCZ_ZMIANY = 'ogarniacz-zmiana-profilu'

export function zamknijProfilNatychmiast(): void {
  window.dispatchEvent(new Event(ZDARZENIE_ZAMKNIECIA_PROFILU))
  zamknijKontekstProfilu(baza)
  void zatrzymajSynchronizacjeAplikacji()
}

export async function zmienSesjeIPrzeladuj<T>(operacja: () => Promise<T>): Promise<T> {
  if (!navigator.onLine) throw new Error('Zmiana konta wymaga połączenia z serwerem. Bieżący profil pozostaje dostępny offline.')
  if (navigator.locks) return navigator.locks.request('ogarniacz-zmiana-sesji', () => wykonajZmianeSesji(operacja))
  return wykonajZmianeSesji(operacja)
}

async function wykonajZmianeSesji<T>(operacja: () => Promise<T>): Promise<T> {
  await rejestrProfili.transaction('rw', rejestrProfili.stan, async () => {
    if (await rejestrProfili.stan.get('przelaczanie')) throw new Error('Zmiana konta trwa w innej karcie.')
    await rejestrProfili.stan.put({ id: 'przelaczanie' })
  })
  try {
    zamknijProfilNatychmiast()
    localStorage.setItem(KLUCZ_ZMIANY, 'start:' + crypto.randomUUID())
    await rejestrProfili.stan.put({ id: 'aktywny' })
    await zatrzymajSynchronizacjeAplikacji()
    await platforma.powiadomienia.synchronizuj([], false)
    await platforma.migawkiWidgetow.zapisz({ data: '', najblizszeElementyDnia: [], pilneIZalegleZadania: [], updatedAt: new Date().toISOString() })
    const wynik = await operacja()
    return wynik
  } catch (blad) {
    sessionStorage.setItem('ogarniacz-blad-zmiany-konta', blad instanceof Error ? blad.message : 'Zmiana konta nie powiodła się.')
    throw blad
  } finally {
    await rejestrProfili.stan.delete('przelaczanie')
    localStorage.setItem(KLUCZ_ZMIANY, 'koniec:' + crypto.randomUUID())
    window.location.reload()
  }
}

export function nasluchujZmianyProfilu(): () => void {
  const odbierz = (zdarzenie: StorageEvent) => {
    if (zdarzenie.key !== KLUCZ_ZMIANY) return
    zamknijProfilNatychmiast()
    if (zdarzenie.newValue?.startsWith('koniec:')) window.location.reload()
  }
  const innaSesja = () => {
    zamknijProfilNatychmiast()
    window.location.reload()
  }
  const wygaslaSesja = () => {
    zamknijProfilNatychmiast()
    wyczyscKontoLokalne()
    void rejestrProfili.stan.put({ id: 'aktywny' }).then(() => window.location.reload())
  }
  window.addEventListener('storage', odbierz)
  window.addEventListener('ogarniacz:inna-sesja', innaSesja)
  window.addEventListener('ogarniacz:sesja-wygasla', wygaslaSesja)
  return () => { window.removeEventListener('storage', odbierz); window.removeEventListener('ogarniacz:inna-sesja', innaSesja); window.removeEventListener('ogarniacz:sesja-wygasla', wygaslaSesja) }
}

export async function przygotujProfilStartowy(): Promise<{ migracja?: ProfilLokalny; zmianaHasla?: boolean }> {
  oznaczUruchomienieProfili()
  if (await rejestrProfili.stan.get('przelaczanie')) {
    // Blokada przeglądarki zwalnia się także po awarii karty; po jej uzyskaniu
    // można bezpiecznie usunąć pozostawiony znacznik i ponownie sprawdzić serwer.
    if (navigator.locks) await navigator.locks.request('ogarniacz-zmiana-sesji', () => rejestrProfili.stan.delete('przelaczanie'))
    else throw new Error('Zmiana konta trwa w innej karcie. Odśwież po jej zakończeniu.')
  }
  const { adresApi } = pobierzKonfiguracjeSynchronizacji()
  if (!adresApi) {
    const maProfile = await rejestrProfili.profile.count() > 0
    ustawBazePrzedUruchomieniem(new BazaOgarniacza(maProfile ? 'ogarniacz-lokalny' : 'ogarniacz-v1'))
    wyczyscKontoLokalne()
    return {}
  }
  let profil: ProfilLokalny | undefined
  try {
    const konto = await pobierzSesjeKonta()
    profil = await zarejestrujProfilSesji(adresApi, konto)
  } catch (blad) {
    if (blad instanceof BladKonta) {
      if (blad.status !== 401) throw blad
      wyczyscKontoLokalne()
      await rejestrProfili.stan.put({ id: 'aktywny' })
    } else {
      const stan = await rejestrProfili.stan.get('aktywny')
      const znany = stan?.profilId ? await rejestrProfili.profile.get(stan.profilId) : undefined
      if (znany?.serwer === adresApi) profil = znany
    }
  }
  if (!profil) {
    ustawBazePrzedUruchomieniem(new BazaOgarniacza('ogarniacz-lokalny'))
    return {}
  }
  if (profil.konto.wymaganaZmianaHasla) return { zmianaHasla: true }
  const staraPrzypisana = await rejestrProfili.stan.get('zrodlo-legacy')
  const pominieta = await rejestrProfili.stan.get('bez-migracji:' + profil.id)
  if (!profil.migracja && !pominieta && (!staraPrzypisana || staraPrzypisana.profilId === profil.id) && await Dexie.exists('ogarniacz-v1') && profil.konto.rola === 'wlasciciel' && profil.uzytkownikId === profil.wlascicielId) {
    return { migracja: profil }
  }
  const bazaProfilu = await otworzBazeProfilu(profil)
  ustawBazePrzedUruchomieniem(bazaProfilu)
  await aktywujProfil(profil)
  return {}
}
