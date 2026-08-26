import { useEffect, useState } from 'react'
import { useRepozytorium } from '../hooks/useRepozytorium'
import { aktywnePrzypomnienia } from '../services/PrzypomnieniaService'
import { useAplikacja } from './KontekstAplikacji'

export function SilnikPrzypomnien() {
  const { dane, repozytorium } = useRepozytorium('przypomnienia')
  const { ustawienia } = useAplikacja()
  const [teraz, ustawTeraz] = useState(() => new Date())

  useEffect(() => {
    const zegar = window.setInterval(() => ustawTeraz(new Date()), 60_000)
    return () => window.clearInterval(zegar)
  }, [])

  useEffect(() => {
    if (!ustawienia.powiadomienia || !('Notification' in window) || Notification.permission !== 'granted') return
    aktywnePrzypomnienia(dane, teraz).filter((element) => element.stan === 'nowe').forEach((element) => {
      new Notification('Ogarniacz', { body: element.tytul, tag: element.id, requireInteraction: element.eskalacja })
      void repozytorium.zapisz({ ...element, stan: 'dostarczone' })
    })
  }, [dane, repozytorium, teraz, ustawienia.powiadomienia])

  return null
}

// OGARNIACZ_FINAL_AUDIT_VOICE_2026_08_27_V1 — czysta logika współdzielona przez Zadania/Leki/Wizyty/Finanse.
export {
  odlozPrzypomnienieV1,
  przypomnieniaWOknieV1,
  wyznaczPrzypomnieniaV1,
} from './wspolnySilnikPrzypomnien'
export type {
  KandydatPrzypomnieniaV1,
  RegulaPrzypomnieniaV1,
  SourceRefPrzypomnienia,
  ZaplanowanePrzypomnienieV1,
} from './wspolnySilnikPrzypomnien'
