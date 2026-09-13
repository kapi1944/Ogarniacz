import { useEffect, useState } from 'react'
import { useRepozytorium } from '../hooks/useRepozytorium'
import { aktywnePrzypomnienia } from '../services/PrzypomnieniaService'
import { platforma } from '../platform/platforma'
import { sciezkaDlaSourceRef } from '../platform/trasy'
import { useAplikacja } from './KontekstAplikacji'

export function SilnikPrzypomnien() {
  const { dane, repozytorium } = useRepozytorium('przypomnienia')
  const { ustawienia } = useAplikacja()
  const [teraz, ustawTeraz] = useState(() => new Date())
  const [wznowienie, ustawWznowienie] = useState(0)

  useEffect(() => {
    if (platforma.natywna) return
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
      if (platforma.natywna) {
        await platforma.powiadomienia.synchronizuj(dane, ustawienia.powiadomienia, ustawienia.ukrywajSzczegolyZdrowotneWPowiadomieniach)
        return
      }

      if (!ustawienia.powiadomienia) return
      for (const element of aktywnePrzypomnienia(dane, teraz).filter((przypomnienie) => przypomnienie.stan === 'nowe')) {
        const pokazano = await platforma.powiadomienia.pokaz({
          tytul: 'Ogarniacz',
          tresc: ustawienia.ukrywajSzczegolyZdrowotneWPowiadomieniach && ['leki', 'wizyty', 'skierowania', 'zdrowie'].includes(element.zrodlo?.typ ?? '') ? 'Przypomnienie dotyczące zdrowia' : element.tytul,
          sciezka: sciezkaDlaSourceRef(element.zrodlo, element.id),
        })
        if (pokazano && !anulowano) await repozytorium.zapisz({ ...element, stan: 'dostarczone' })
      }
    }
    void dostarcz()
    return () => {
      anulowano = true
    }
  }, [dane, repozytorium, teraz, ustawienia.powiadomienia, ustawienia.ukrywajSzczegolyZdrowotneWPowiadomieniach, ustawienia.updatedAt, wznowienie])

  return null
}
