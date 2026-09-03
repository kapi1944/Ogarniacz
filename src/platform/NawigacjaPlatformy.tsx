import { useEffect, useRef, useState } from 'react'
import { App } from '@capacitor/app'
import { useLocation, useNavigate } from 'react-router-dom'
import { obsluzWstecz, useObslugaWstecz } from './obslugaWstecz'
import { platforma } from './platforma'
import { parsujDeepLink } from './trasy'
import { useAplikacja } from '../app/KontekstAplikacji'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { odroczPrzypomnienie, zakonczPrzypomnienie } from '../services/PrzypomnieniaService'
import { Komunikat } from '../components/Interfejs'
import { utworzObslugeCelowPlatformy } from './ObslugaCelowPlatformy'

export function NawigacjaPlatformy() {
  const polozenie = useLocation()
  const nawiguj = useNavigate()
  const { moze, otworzSzybkieDodawanieZDanymi } = useAplikacja()
  const historia = useRef([polozenie.key])
  const [komunikat, ustawKomunikat] = useState('')
  const obslugaCelow = useRef<ReturnType<typeof utworzObslugeCelowPlatformy> | undefined>(undefined)
  obslugaCelow.current ??= utworzObslugeCelowPlatformy({
    nawiguj,
    otworzSzybkieDodawanie: otworzSzybkieDodawanieZDanymi,
    pokazKomunikat: ustawKomunikat,
  })

  useEffect(() => {
    if (historia.current.at(-1) !== polozenie.key) historia.current.push(polozenie.key)
  }, [polozenie.key])

  useEffect(() => {
    if (!komunikat) return
    const ukryjKomunikat = setTimeout(() => ustawKomunikat(''), 4_000)
    return () => clearTimeout(ukryjKomunikat)
  }, [komunikat])

  useEffect(() => platforma.powiadomienia.nasluchujAkcji((akcja) => {
    if (akcja.typ === 'otworz') {
      void obslugaCelow.current?.obsluz(akcja.sciezka, akcja.sourceRef)
      return
    }
    if (!akcja.przypomnienieId || !moze('przypomnienia', 'edycja')) return
    const przypomnienieId = akcja.przypomnienieId
    void (async () => {
      const repozytorium = pobierzRepozytorium('przypomnienia')
      const przypomnienie = await repozytorium.pobierz(przypomnienieId)
      if (!przypomnienie || ['wykonane', 'pominiete'].includes(przypomnienie.stan)) return
      if (akcja.typ === 'odrocz') {
        await repozytorium.zapisz(odroczPrzypomnienie(przypomnienie, 15))
        return
      }
      const wynik = zakonczPrzypomnienie(przypomnienie)
      await repozytorium.zapisz(wynik.wykonane)
      if (wynik.nastepne) await repozytorium.zapisz(wynik.nastepne)
    })().catch(() => undefined)
  }), [moze])

  useEffect(() => () => obslugaCelow.current?.zakoncz(), [])

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
    const obsluzAdres = (adres: string) => {
      if (!aktywna) return
      const trasa = parsujDeepLink(adres)
      if (trasa) void obslugaCelow.current?.obsluz(trasa)
    }

    const nasluchiwanie = App.addListener('appUrlOpen', ({ url }) => obsluzAdres(url))
    void App.getLaunchUrl().then((wynik) => {
      if (wynik?.url) obsluzAdres(wynik.url)
    }).catch(() => undefined)

    return () => {
      aktywna = false
      void nasluchiwanie.then((uchwyt) => uchwyt.remove())
    }
  }, [])

  useObslugaWstecz(polozenie.pathname !== '/', () => {
    if (historia.current.length > 1) {
      historia.current.pop()
      nawiguj(-1)
      return
    }
    nawiguj('/', { replace: true })
  }, 10)

  return komunikat ? <Komunikat typ="informacja">{komunikat}</Komunikat> : null
}
