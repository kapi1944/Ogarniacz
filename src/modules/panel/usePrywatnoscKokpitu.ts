import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { useKonto } from '../../app/DostawcaKonta'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import type { KonfiguracjaKokpitu, TrybKokpitu } from '../../domain/kokpit'
import { pobierzKonfiguracjeSynchronizacji } from '../../services/KonfiguracjaSynchronizacji'
import { czyKontoZgodneZDanymiLokalnymi, pobierzSesjeKonta, type KontoUzytkownika } from '../../services/KontaService'
import { czyTrwaPracaKokpitu, regulaPrywatnosci, rozwiazPrywatnosc, type NadpisanieKokpitu } from '../../services/PrywatnoscKokpitu'

function useSesjaKokpitu() {
  const { konto, offline } = useKonto()
  const api = pobierzKonfiguracjeSynchronizacji().adresApi
  const klucz = konto ? `${konto.uzytkownikId}:${konto.wlascicielId}` : undefined
  const [potwierdzenie, ustawPotwierdzenie] = useState<{ klucz: string; konto: KontoUzytkownika }>()
  useEffect(() => {
    if (!api || !klucz || offline) return
    let generacja = 0
    let sprawdza = false
    const uniewaznij = () => { generacja++; sprawdza = false; ustawPotwierdzenie(undefined) }
    const sprawdz = async () => {
      if (document.hidden || !navigator.onLine || sprawdza) return
      const proba = ++generacja
      sprawdza = true
      try {
        const sesja = await pobierzSesjeKonta()
        if (proba !== generacja) return
        const zgodna = `${sesja.uzytkownikId}:${sesja.wlascicielId}` === klucz && !sesja.wymaganaZmianaHasla
          && (!sesja.statusKonta || sesja.statusKonta === 'aktywne') && czyKontoZgodneZDanymiLokalnymi()
        ustawPotwierdzenie(zgodna ? { klucz, konto: sesja } : undefined)
      } catch { if (proba === generacja) ustawPotwierdzenie(undefined) }
      finally { if (proba === generacja) sprawdza = false }
    }
    const wznow = () => { uniewaznij(); void sprawdz() }
    void sprawdz()
    const zegar = window.setInterval(() => void sprawdz(), 30_000)
    document.addEventListener('visibilitychange', wznow)
    window.addEventListener('offline', uniewaznij)
    window.addEventListener('online', wznow)
    window.addEventListener('ogarniacz:sesja-wygasla', uniewaznij)
    window.addEventListener('ogarniacz:inna-sesja', uniewaznij)
    return () => {
      generacja++
      clearInterval(zegar)
      document.removeEventListener('visibilitychange', wznow)
      window.removeEventListener('offline', uniewaznij)
      window.removeEventListener('online', wznow)
      window.removeEventListener('ogarniacz:sesja-wygasla', uniewaznij)
      window.removeEventListener('ogarniacz:inna-sesja', uniewaznij)
    }
  }, [api, klucz, offline])
  return !offline && api && navigator.onLine && !document.hidden && klucz === potwierdzenie?.klucz ? potwierdzenie?.konto : undefined
}

export function usePrywatnoscKokpitu(konfiguracja: KonfiguracjaKokpitu) {
  const { gotowyDostep, moze, zapisaneUstawienia } = useAplikacja()
  const { konto } = useKonto()
  const sesja = useSesjaKokpitu()
  const [minuta, ustawMinute] = useState(() => Math.floor(Date.now() / 60_000))
  const teraz = new Date(minuta * 60_000)
  const [nadpisanie, ustawNadpisanie] = useState<NadpisanieKokpitu>()
  const [czas, ustawCzas] = useState<'regula' | 15 | 30 | 60 | 120 | 'recznie'>('regula')
  const grafik = Boolean(sesja && gotowyDostep && konfiguracja.prywatnyWPracy && moze('grafik'))
  const danePracy = useLiveQuery(() => grafik ? Promise.all([
    pobierzRepozytorium('wyjatkiGrafiku').lista(), pobierzRepozytorium('urlopy').lista(),
  ]) : undefined, [grafik, sesja?.uzytkownikId])

  useEffect(() => {
    const odswiez = () => ustawMinute(Math.floor(Date.now() / 60_000))
    const zegar = window.setInterval(odswiez, 1000)
    window.addEventListener('focus', odswiez)
    return () => { clearInterval(zegar); window.removeEventListener('focus', odswiez) }
  }, [])
  const praca = grafik && danePracy && czyTrwaPracaKokpitu(teraz, zapisaneUstawienia.harmonogram, ...danePracy)
  const regula = regulaPrywatnosci(teraz, konfiguracja.harmonogram, Boolean(praca))
  const uwierzytelniony = gotowyDostep && Boolean(sesja)
  const tryb = rozwiazPrywatnosc(teraz, uwierzytelniony, regula, nadpisanie)

  useEffect(() => {
    ustawNadpisanie(undefined)
    const wyczysc = () => ustawNadpisanie(undefined)
    window.addEventListener('ogarniacz:sesja-wygasla', wyczysc)
    window.addEventListener('ogarniacz:inna-sesja', wyczysc)
    return () => {
      window.removeEventListener('ogarniacz:sesja-wygasla', wyczysc)
      window.removeEventListener('ogarniacz:inna-sesja', wyczysc)
    }
  }, [konto?.uzytkownikId, konto?.wlascicielId])

  useEffect(() => {
    if (uwierzytelniony && nadpisanie?.regula && nadpisanie.regula !== regula.id) ustawNadpisanie(undefined)
    else if (nadpisanie?.do) {
      const zegar = window.setTimeout(() => ustawNadpisanie(undefined), Math.max(0, nadpisanie.do - Date.now()))
      return () => clearTimeout(zegar)
    }
  }, [uwierzytelniony, regula.id, nadpisanie])

  return { tryb, uwierzytelniony, sesja, czas, ustawCzas, nadpisanie,
    wybierz: (tryb: TrybKokpitu) => {
      if (!uwierzytelniony) return
      ustawNadpisanie({ tryb, ...(czas === 'regula' ? { regula: regula.id } : typeof czas === 'number' ? { do: Date.now() + czas * 60_000 } : {}) })
    },
    automatyczny: () => ustawNadpisanie(undefined),
  }
}
