import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useRepozytorium } from '../hooks/useRepozytorium'
import type { NazwaModulu, Ustawienia } from '../domain/typy'
import { DOMYSLNE_USTAWIENIA, normalizujUstawienia, zastosujUstawieniaInterfejsu } from '../domain/ustawienia'
import { repozytoriumUstawien } from '../data/RepozytoriumUstawien'
import { czyDozwolone } from '../services/UprawnieniaService'
import { SzybkieDodawanie } from './SzybkieDodawanie'
import { WyszukiwanieGlobalne } from './WyszukiwanieGlobalne'
import { SilnikPrzypomnien } from './SilnikPrzypomnien'

interface WartoscKontekstu {
  ustawienia: Ustawienia
  zapisaneUstawienia: Ustawienia
  zapiszUstawienia: (zmiany: Partial<Ustawienia>) => Promise<void>
  ustawPodgladUstawien: (ustawienia: Ustawienia) => void
  wyczyscPodgladUstawien: () => void
  otworzSzybkieDodawanie: () => void
  otworzWyszukiwanie: () => void
  moze: (modul: NazwaModulu, operacja?: 'odczyt' | 'edycja', sekcja?: string) => boolean
}

const KontekstAplikacji = createContext<WartoscKontekstu | null>(null)

export function DostawcaAplikacji({ children }: { children: ReactNode }) {
  const zapisaneUstawienia = useLiveQuery(() => repozytoriumUstawien.wczytaj(), [], DOMYSLNE_USTAWIENIA)
  const { dane: uprawnienia } = useRepozytorium('uprawnienia')
  const [szybkieDodawanie, ustawSzybkieDodawanie] = useState(false)
  const [wyszukiwanie, ustawWyszukiwanie] = useState(false)
  const [podgladUstawien, ustawPodglad] = useState<Ustawienia | null>(null)
  const ustawienia = podgladUstawien ?? zapisaneUstawienia
  const ustawPodgladUstawien = useCallback((noweUstawienia: Ustawienia) => ustawPodglad(normalizujUstawienia(noweUstawienia)), [])
  const wyczyscPodgladUstawien = useCallback(() => ustawPodglad(null), [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const zastosuj = () => zastosujUstawieniaInterfejsu(ustawienia, media.matches)
    zastosuj()
    media.addEventListener('change', zastosuj)
    return () => media.removeEventListener('change', zastosuj)
  }, [ustawienia])

  const zapiszUstawienia = async (zmiany: Partial<Ustawienia>) => {
    await repozytoriumUstawien.zapisz({ ...zapisaneUstawienia, ...zmiany })
    wyczyscPodgladUstawien()
  }

  const moze = (modul: NazwaModulu, operacja: 'odczyt' | 'edycja' = 'odczyt', sekcja?: string) =>
    czyDozwolone(ustawienia.trybUzytkownika, uprawnienia, modul, operacja, ustawienia.aktywnyEdytorId, sekcja)

  return (
    <KontekstAplikacji.Provider value={{
      ustawienia,
      zapisaneUstawienia,
      zapiszUstawienia,
      ustawPodgladUstawien,
      wyczyscPodgladUstawien,
      otworzSzybkieDodawanie: () => ustawSzybkieDodawanie(true),
      otworzWyszukiwanie: () => ustawWyszukiwanie(true),
      moze,
    }}>
      {children}
      <SilnikPrzypomnien />
      {szybkieDodawanie && <SzybkieDodawanie moze={moze} zamknij={() => ustawSzybkieDodawanie(false)} />}
      {wyszukiwanie && <WyszukiwanieGlobalne moze={moze} zamknij={() => ustawWyszukiwanie(false)} />}
    </KontekstAplikacji.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components -- Hook jest publicznym interfejsem tego kontekstu.
export function useAplikacja(): WartoscKontekstu {
  const kontekst = useContext(KontekstAplikacji)
  if (!kontekst) throw new Error('Brak DostawcyAplikacji')
  return kontekst
}
