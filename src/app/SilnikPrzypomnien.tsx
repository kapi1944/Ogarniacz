import { czyBiezacyDostep, zakresDanychZdrowotnych } from '../services/UprawnieniaService'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepozytorium } from '../hooks/useRepozytorium'
import { aktywnePrzypomnienia } from '../services/PrzypomnieniaService'
import { platforma } from '../platform/platforma'
import { sciezkaDlaSourceRef } from '../platform/trasy'
import { useAplikacja } from './KontekstAplikacji'
import { Komunikat } from '../components/Interfejs'
import { oznaczDostarczeniePrzypomnienia, sciezkaAlarmuDawki, sprawdzAlarmDawki, uzgodnijPrzypomnieniaLekow } from '../services/PrzypomnieniaLekow'
import { oznaczStanPodsumowaniaPoPracy, sciezkaPodsumowaniaPoPracy, uzgodnijPodsumowaniaPoPracy } from '../services/PodsumowaniePoPracyService'

export function SilnikPrzypomnien() {
  const { dane, repozytorium } = useRepozytorium('przypomnienia')
  const { dane: leki } = useRepozytorium('leki')
  const { dane: wpisy } = useRepozytorium('dziennikLekow')
  const { dane: zadania } = useRepozytorium('zadania')
  const { dane: wyjatki } = useRepozytorium('wyjatkiGrafiku')
  const { dane: urlopy } = useRepozytorium('urlopy')
  const kolejka = useRef(Promise.resolve())
  const { ustawienia, gotowyDostep } = useAplikacja()
  const [teraz, ustawTeraz] = useState(() => new Date())
  const [wznowienie, ustawWznowienie] = useState(0)
  const [blad, ustawBlad] = useState('')
  const [dataPodsumowania, ustawDatePodsumowania] = useState('')

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
      if (gotowyDostep === false || anulowano) return
      const teraz = new Date()
      const dostarczoneIds = gotowyDostep === true ? await platforma.powiadomienia.odczytajDostarczenia?.() ?? [] : []
      const lekiUzgodnione = await uzgodnijPrzypomnieniaLekow()
      const uzgodnione = (gotowyDostep === true ? await uzgodnijPodsumowaniaPoPracy(teraz, platforma.natywna, dostarczoneIds) : lekiUzgodnione).filter((element) => { const zakres = zakresDanychZdrowotnych('przypomnienia', element); return !zakres || czyBiezacyDostep(zakres.modul, 'odczyt', zakres.sekcja) })
      if (anulowano) return
      if (platforma.natywna) {
        const wynik = await platforma.powiadomienia.synchronizuj(uzgodnione, ustawienia.powiadomienia, ustawienia.ukrywajSzczegolyZdrowotneWPowiadomieniach)
        for (const id of wynik.zaplanowanePrzypomnieniaIds) {
          if (uzgodnione.some((element) => element.id === id && element.echoPoPracy)) await oznaczStanPodsumowaniaPoPracy(id, 'zaplanowane', teraz)
        }
      }

      for (const element of aktywnePrzypomnienia(uzgodnione, new Date()).filter((przypomnienie) => przypomnienie.stan === 'nowe' || przypomnienie.dawkaLeku && przypomnienie.stan === 'odroczone')) {
        if (anulowano) return
        if (element.echoPoPracy) {
          if (await oznaczStanPodsumowaniaPoPracy(element.id, 'dostarczone', new Date())) {
            ustawDatePodsumowania(element.echoPoPracy.data)
            if (!platforma.natywna && ustawienia.powiadomienia) await platforma.powiadomienia.pokaz({
              tytul: '🏠 Pomagier — podsumowanie po pracy', tresc: 'Sprawdź zadania pozostałe po pracy',
              sciezka: sciezkaPodsumowaniaPoPracy(element.echoPoPracy.data),
            })
          }
          continue
        }
        if (platforma.natywna || !ustawienia.powiadomienia) continue
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
      if (!anulowano) ustawBlad('Nie udało się uzgodnić przypomnień. Sprawdź aktualne zadania i dawki; aplikacja ponowi próbę.')
    })
    return () => {
      anulowano = true
    }
  }, [dane, leki, wpisy, zadania, wyjatki, urlopy, gotowyDostep, repozytorium, teraz, ustawienia.powiadomienia, ustawienia.ukrywajSzczegolyZdrowotneWPowiadomieniach, ustawienia.updatedAt, wznowienie])

  return <>{blad && <Komunikat typ="blad">{blad}</Komunikat>}{dataPodsumowania && ustawienia.proaktywnoscEcho && !ustawienia.echoWyciszone && ustawienia.podsumowaniePoPracy.wlaczone && <Komunikat typ="informacja"><Link to={sciezkaPodsumowaniaPoPracy(dataPodsumowania)}>🏠 Podsumowanie po pracy — sprawdź pozostałe zadania</Link><button type="button" className="przycisk przycisk--tekstowy" onClick={() => ustawDatePodsumowania('')}>Zamknij</button></Komunikat>}</>
}
