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
import { sciezkaAlarmuDawki, sprawdzAlarmDawki } from '../services/PrzypomnieniaLekow'
import { mapujPrzypomnienieNaPowiadomienie } from './NotificationService'

export function NawigacjaPlatformy() {
  const polozenie = useLocation()
  const nawiguj = useNavigate()
  const { moze, otworzSzybkieDodawanieZDanymi, ustawienia, gotowyDostep } = useAplikacja()
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

  useEffect(() => {
    if (gotowyDostep === false) return
    return platforma.powiadomienia.nasluchujAkcji((akcjaNatywna) => {
      void (async () => {
        let akcja = akcjaNatywna
        const repozytorium = pobierzRepozytorium('przypomnienia')
        if (akcja.wersjaPowiadomienia !== undefined && akcja.przypomnienieId) {
          const przypomnienie = await repozytorium.pobierz(akcja.przypomnienieId)
          const powiadomienie = przypomnienie && mapujPrzypomnienieNaPowiadomienie(przypomnienie, ustawienia.ukrywajSzczegolyZdrowotneWPowiadomieniach)
          if (!przypomnienie || !powiadomienie || powiadomienie.wersja !== akcja.wersjaPowiadomienia) throw new Error('Ten alarm jest niedostępny lub nieaktualny. Sprawdź aktualne przypomnienia.')
          akcja = { ...akcja, sciezka: powiadomienie.sciezka, sourceRef: przypomnienie.zrodlo, wersjaStanuDawki: przypomnienie.dawkaLeku?.wersjaStanu }
        }
        if (akcja.wersjaStanuDawki !== undefined && akcja.przypomnienieId) {
          if (!moze('leki', akcja.typ === 'otworz' ? 'odczyt' : 'edycja')) throw new Error('Brak uprawnienia do leku.')
          await sprawdzAlarmDawki(akcja.przypomnienieId, akcja.wersjaStanuDawki)
          const przypomnienie = await repozytorium.pobierz(akcja.przypomnienieId)
          if (!przypomnienie?.dawkaLeku || przypomnienie.dawkaLeku.wersjaStanu !== akcja.wersjaStanuDawki) throw new Error('Ten alarm jest nieaktualny. Sprawdź aktualny stan dawki.')
          nawiguj(sciezkaAlarmuDawki(przypomnienie, akcja.typ === 'wykonane' ? undefined : akcja.typ))
          return
        }
        if (akcja.typ === 'otworz') {
          await obslugaCelow.current?.obsluz(akcja.sciezka, akcja.sourceRef)
          return
        }
        if (!akcja.przypomnienieId || !moze('przypomnienia', 'edycja')) return
        const przypomnienie = await repozytorium.pobierz(akcja.przypomnienieId)
        if (!przypomnienie || ['wykonane', 'pominiete'].includes(przypomnienie.stan)) return
        if (przypomnienie.dawkaLeku) {
          ustawKomunikat('Otwórz aktualną dawkę w module Zdrowie i potwierdź swoją decyzję.')
          return
        }
        if (akcja.typ === 'odrocz') {
          await repozytorium.zapisz(odroczPrzypomnienie(przypomnienie, 15))
          return
        }
        const wynik = zakonczPrzypomnienie(przypomnienie)
        if (wynik.nastepne) await repozytorium.zapiszWiele([wynik.wykonane, wynik.nastepne])
        else await repozytorium.zapisz(wynik.wykonane)
      })().catch((blad) => ustawKomunikat(blad instanceof Error ? blad.message : 'Nie udało się sprawdzić przypomnienia.'))
    })
  }, [moze, nawiguj, gotowyDostep, ustawienia.ukrywajSzczegolyZdrowotneWPowiadomieniach])

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
