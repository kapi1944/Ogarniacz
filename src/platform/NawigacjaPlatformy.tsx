import { useCallback, useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import { useLocation, useNavigate } from 'react-router-dom'
import { obsluzWstecz, useObslugaWstecz } from './obslugaWstecz'
import { platforma } from './platforma'
import { daneSzybkiegoDodawaniaZeSciezki, parsujDeepLink } from './trasy'
import { useAplikacja } from '../app/KontekstAplikacji'

export function NawigacjaPlatformy() {
  const polozenie = useLocation()
  const nawiguj = useNavigate()
  const { otworzSzybkieDodawanieZDanymi } = useAplikacja()
  const historia = useRef([polozenie.key])

  const obsluzCel = useCallback((sciezka: string) => {
    const szybkieDodawanie = daneSzybkiegoDodawaniaZeSciezki(sciezka)
    if (szybkieDodawanie) otworzSzybkieDodawanieZDanymi(szybkieDodawanie)
    else nawiguj(sciezka)
  }, [nawiguj, otworzSzybkieDodawanieZDanymi])

  useEffect(() => {
    if (historia.current.at(-1) !== polozenie.key) historia.current.push(polozenie.key)
  }, [polozenie.key])

  useEffect(() => platforma.powiadomienia.nasluchujAkcji(obsluzCel), [obsluzCel])

  useEffect(() => {
    if (!platforma.natywna) return
    let aktywna = true
    const nasluchiwanie = App.addListener('backButton', () => {
      if (aktywna && !obsluzWstecz()) void App.minimizeApp()
    })
    return () => {
      aktywna = false
      void nasluchiwanie.then((uchwyt) => uchwyt.remove())
    }
  }, [])

  useEffect(() => {
    if (!platforma.natywna) return
    let aktywna = true
    let ostatniaTrasa: string | undefined
    let wyczyscOstatniaTrase: ReturnType<typeof setTimeout> | undefined

    const obsluzAdres = (adres: string) => {
      if (!aktywna) return
      const trasa = parsujDeepLink(adres)
      if (!trasa || trasa === ostatniaTrasa) return
      ostatniaTrasa = trasa
      if (wyczyscOstatniaTrase) clearTimeout(wyczyscOstatniaTrase)
      wyczyscOstatniaTrase = setTimeout(() => { ostatniaTrasa = undefined }, 2_000)
      obsluzCel(trasa)
    }

    const nasluchiwanie = App.addListener('appUrlOpen', ({ url }) => obsluzAdres(url))
    void App.getLaunchUrl().then((wynik) => {
      if (wynik?.url) obsluzAdres(wynik.url)
    }).catch(() => undefined)

    return () => {
      aktywna = false
      if (wyczyscOstatniaTrase) clearTimeout(wyczyscOstatniaTrase)
      void nasluchiwanie.then((uchwyt) => uchwyt.remove())
    }
  }, [obsluzCel])

  useObslugaWstecz(polozenie.pathname !== '/', () => {
    if (historia.current.length > 1) {
      historia.current.pop()
      nawiguj(-1)
      return
    }
    nawiguj('/', { replace: true })
  }, 10)

  return null
}
