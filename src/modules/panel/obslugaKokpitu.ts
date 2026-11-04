import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Capacitor, SystemBars } from '@capacitor/core'
import { pobierzInstallationId } from '../../services/InstallationService'
import { profileKokpitu, type KonfiguracjaKokpitu, type ProfilKokpitu } from '../../domain/kokpit'

export const natywnyAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
type WyborProfilu = ProfilKokpitu | 'auto'

export function profilEkranu(): ProfilKokpitu {
  const { innerWidth: szerokosc, innerHeight: wysokosc } = window
  if (szerokosc < 600 && szerokosc < wysokosc) return 'pion'
  if (wysokosc < 550 && szerokosc > wysokosc) return 'poziom'
  return szerokosc < 1050 ? 'tablet' : 'komputer'
}

export function useProfilKokpitu(wlasciciel: string) {
  const klucz = `ogarniacz.kokpit.profil:${pobierzInstallationId()}:${wlasciciel}`
  const [ekran, ustawEkran] = useState(profilEkranu)
  const [lokalny, ustawLokalny] = useState<{ klucz: string; wybor: WyborProfilu }>()
  let wybor: WyborProfilu = 'auto'
  try {
    const zapisany = lokalny?.klucz === klucz ? lokalny.wybor : localStorage.getItem(klucz)
    if (zapisany && Object.hasOwn(profileKokpitu, zapisany)) wybor = zapisany as ProfilKokpitu
  } catch {
    if (lokalny?.klucz === klucz) wybor = lokalny.wybor
  }
  useEffect(() => {
    const dopasuj = () => ustawEkran(profilEkranu())
    window.addEventListener('resize', dopasuj)
    return () => window.removeEventListener('resize', dopasuj)
  }, [])
  return {
    wybor, profil: wybor === 'auto' ? ekran : wybor,
    ustawWybor: (nowy: WyborProfilu) => {
      ustawLokalny({ klucz, wybor: nowy })
      try { localStorage.setItem(klucz, nowy) } catch { /* Wybór działa do końca sesji. */ }
    },
  }
}

export function usePaskiAndroida(ukryte: boolean, zglos: (blad: string) => void) {
  useEffect(() => {
    if (!natywnyAndroid || !ukryte) return
    let aktywny = true
    void SystemBars.hide().catch(() => { if (aktywny) zglos('Android nie ukrył pasków systemowych.') })
    return () => {
      aktywny = false
      void SystemBars.show().catch(() => undefined)
    }
  }, [ukryte, zglos])
}

const kontrolka = 'a,button,input,select,textarea,summary,[role="button"],[role="dialog"]'

export function useNawigacjaKokpitu({ konfiguracja, edycja, plansze, zmienPlansze }: {
  konfiguracja: KonfiguracjaKokpitu; edycja: boolean; plansze: boolean; zmienPlansze: (kierunek: number) => void
}) {
  const [ukryty, ustawUkryty] = useState(false)
  const [ambient, ustawAmbient] = useState(false)
  const ostatniaAkcja = useRef(Date.now())
  const poczatekGestu = useRef<{ id: number; x: number; y: number } | undefined>(undefined)
  const zmiana = useRef(zmienPlansze)
  zmiana.current = zmienPlansze
  const ruch = () => {
    ostatniaAkcja.current = Date.now()
    if (ukryty) ustawUkryty(false)
    if (ambient) ustawAmbient(false)
  }
  useEffect(() => {
    if (edycja) return
    ostatniaAkcja.current = Date.now()
    let ostatniObrot = ostatniaAkcja.current
    const zegar = window.setInterval(() => {
      if (document.hidden || poczatekGestu.current || document.querySelector('[role="dialog"], dialog[open]')
        || document.activeElement?.matches(kontrolka)) {
        ostatniaAkcja.current = Date.now()
        return
      }
      const sekundy = (Date.now() - ostatniaAkcja.current) / 1000
      ustawUkryty(konfiguracja.pasek === 'auto' && sekundy >= konfiguracja.ukryjPo)
      ustawAmbient(konfiguracja.ambient.wlaczony && sekundy >= konfiguracja.ambient.sekundy)
      if (plansze && konfiguracja.interwal && Date.now() - Math.max(ostatniaAkcja.current, ostatniObrot) >= konfiguracja.interwal * 1000
        && (!konfiguracja.ambient.wlaczony || sekundy < konfiguracja.ambient.sekundy)) {
        zmiana.current(1)
        ostatniObrot = Date.now()
      }
    }, 1000)
    return () => clearInterval(zegar)
  }, [edycja, plansze, konfiguracja.pasek, konfiguracja.ukryjPo, konfiguracja.ambient.wlaczony, konfiguracja.ambient.sekundy, konfiguracja.interwal])

  const zdarzenia = {
    onPointerDown: (zdarzenie: PointerEvent) => {
      if (zdarzenie.pointerType === 'mouse' || !zdarzenie.isPrimary || (zdarzenie.target as HTMLElement).closest(kontrolka)) return
      poczatekGestu.current = { id: zdarzenie.pointerId, x: zdarzenie.clientX, y: zdarzenie.clientY }
      zdarzenie.currentTarget.setPointerCapture?.(zdarzenie.pointerId)
    },
    onPointerUp: (zdarzenie: PointerEvent) => {
      const poczatek = poczatekGestu.current
      if (poczatek?.id !== zdarzenie.pointerId) return
      poczatekGestu.current = undefined
      const x = zdarzenie.clientX - poczatek.x
      const y = zdarzenie.clientY - poczatek.y
      if (Math.abs(x) >= 45 && Math.abs(x) > Math.abs(y) * 1.4) zmiana.current(x < 0 ? 1 : -1)
    },
    onPointerCancel: () => { poczatekGestu.current = undefined },
  }
  return { ukryty, ambient: !edycja && ambient, ruch, zdarzenia }
}
