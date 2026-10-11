import { czyBiezacyDostep, zakresDanychZdrowotnych } from '../services/UprawnieniaService'
import { useEffect, useRef, useState } from 'react'
import { useRepozytorium } from '../hooks/useRepozytorium'
import { aktywnePrzypomnienia } from '../services/PrzypomnieniaService'
import { platforma } from '../platform/platforma'
import { sciezkaDlaSourceRef } from '../platform/trasy'
import { useAplikacja } from './KontekstAplikacji'
import { Komunikat } from '../components/Interfejs'
import { oznaczDostarczeniePrzypomnienia, sciezkaAlarmuDawki, sprawdzAlarmDawki, uzgodnijPrzypomnieniaLekow } from '../services/PrzypomnieniaLekow'

export function SilnikPrzypomnien() {
  const { dane, repozytorium } = useRepozytorium('przypomnienia')
  const { dane: leki } = useRepozytorium('leki')
  const { dane: wpisy } = useRepozytorium('dziennikLekow')
  const kolejka = useRef(Promise.resolve())
  const { ustawienia } = useAplikacja()
  const [teraz, ustawTeraz] = useState(() => new Date())
  const [wznowienie, ustawWznowienie] = useState(0)
  const [blad, ustawBlad] = useState('')

  useEffect(() => {
    const zegar = window.setInterval(() => ustawTeraz(new Date()), 60_000)
    return () => window.clearInterval(zegar)
  }, [])

  useEffect(() => {
    let aktywny = true
    let przestanNasluchiwac: (() => void) | undefined
    void platforma.cyklZycia.nasluchuj((stan) => {
      if (aktywny && stan === 'aktywny') ustawWznowienie((wartosc) => wartosc + 1)
    }).then((zakonczNasluchiwanie) => {
      if (!aktywny) zakonczNasluchiwanie()
      else przestanNasluchiwac = zakonczNasluchiwanie
    })
    return () => {
      aktywny = false
      przestanNasluchiwac?.()
    }
  }, [])

  useEffect(() => {
    let anulowano = false
    const dostarcz = async () => {
      const uzgodnione = (await uzgodnijPrzypomnieniaLekow()).filter((element) => { const zakres = zakresDanychZdrowotnych('przypomnienia', element); return !zakres || czyBiezacyDostep(zakres.modul, 'odczyt', zakres.sekcja) })
      if (anulowano) return
      if (platforma.natywna) {
        await platforma.powiadomienia.synchronizuj(uzgodnione, ustawienia.powiadomienia, ustawienia.ukrywajSzczegolyZdrowotneWPowiadomieniach)
        return
      }

      if (!ustawienia.powiadomienia) return
      for (const element of aktywnePrzypomnienia(uzgodnione, new Date()).filter((przypomnienie) => przypomnienie.stan === 'nowe' || przypomnienie.dawkaLeku && przypomnienie.stan === 'odroczone')) {
        if (anulowano) return
        if (element.dawkaLeku) {
          try { await sprawdzAlarmDawki(element.id, element.dawkaLeku.wersjaStanu) } catch { continue }
        }
        const pokazano = await platforma.powiadomienia.pokaz({
          tytul: 'Ogarniacz',
          tresc: ustawienia.ukrywajSzczegolyZdrowotneWPowiadomieniach && ['leki', 'wizyty', 'skierowania', 'zdrowie'].includes(element.zrodlo?.typ ?? '') ? 'Przypomnienie dotyczące zdrowia' : element.tytul,
          sciezka: element.dawkaLeku ? sciezkaAlarmuDawki(element) : sciezkaDlaSourceRef(element.zrodlo, element.id),
        })
        if (pokazano && !anulowano) await oznaczDostarczeniePrzypomnienia(element)
      }
    }
    kolejka.current = kolejka.current.then(dostarcz).then(() => { if (!anulowano) ustawBlad('') }).catch(() => {
      if (!anulowano) ustawBlad('Nie udało się uzgodnić przypomnień. Sprawdź dawki w module Zdrowie; aplikacja ponowi próbę.')
    })
    return () => {
      anulowano = true
    }
  }, [dane, leki, wpisy, repozytorium, teraz, ustawienia.powiadomienia, ustawienia.ukrywajSzczegolyZdrowotneWPowiadomieniach, ustawienia.updatedAt, wznowienie])

  return blad ? <Komunikat typ="blad">{blad}</Komunikat> : null
}
