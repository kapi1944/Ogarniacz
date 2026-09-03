import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useRepozytorium } from '../hooks/useRepozytorium'
import type { DaneSzybkiegoDodawania, NazwaModulu, Ustawienia } from '../domain/typy'
import { DOMYSLNE_USTAWIENIA, normalizujUstawienia, zastosujUstawieniaInterfejsu } from '../domain/ustawienia'
import { repozytoriumUstawien } from '../data/RepozytoriumUstawien'
import { czyDozwolone } from '../services/UprawnieniaService'
import { platforma } from '../platform/platforma'
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
  otworzSzybkieDodawanieZDanymi: (dane: DaneSzybkiegoDodawania) => void
  otworzWyszukiwanie: () => void
  moze: (modul: NazwaModulu, operacja?: 'odczyt' | 'edycja', sekcja?: string) => boolean
}

const KontekstAplikacji = createContext<WartoscKontekstu | null>(null)

export function DostawcaAplikacji({ children }: { children: ReactNode }) {
  const zapisaneUstawienia = useLiveQuery(() => repozytoriumUstawien.wczytaj(), [], DOMYSLNE_USTAWIENIA)
  const { dane: uprawnienia } = useRepozytorium('uprawnienia')
  const [szybkieDodawanie, ustawSzybkieDodawanie] = useState<DaneSzybkiegoDodawania | null>(null)
  const [wyszukiwanie, ustawWyszukiwanie] = useState(false)
  const zapisaneUstawieniaRef = useRef(zapisaneUstawienia)
  const podgladUstawienRef = useRef<Ustawienia | null>(null)
  const ciemnyMotywSystemowyRef = useRef(false)
  const ograniczRuchSystemowoRef = useRef(false)
  const ustawienia = zapisaneUstawienia
  zapisaneUstawieniaRef.current = zapisaneUstawienia

  const zastosujBiezaceUstawienia = useCallback((noweUstawienia: Ustawienia) => {
    zastosujUstawieniaInterfejsu(
      noweUstawienia,
      ciemnyMotywSystemowyRef.current,
      ograniczRuchSystemowoRef.current,
    )
  }, [])

  const ustawPodgladUstawien = useCallback((noweUstawienia: Ustawienia) => {
    const znormalizowane = normalizujUstawienia(noweUstawienia)
    podgladUstawienRef.current = znormalizowane
    zastosujBiezaceUstawienia(znormalizowane)
  }, [zastosujBiezaceUstawienia])

  const wyczyscPodgladUstawien = useCallback(() => {
    podgladUstawienRef.current = null
    zastosujBiezaceUstawienia(zapisaneUstawieniaRef.current)
  }, [zastosujBiezaceUstawienia])

  const otworzSzybkieDodawanie = useCallback(() => ustawSzybkieDodawanie({}), [])
  const otworzSzybkieDodawanieZDanymi = useCallback((dane: DaneSzybkiegoDodawania) => ustawSzybkieDodawanie(dane), [])

  useEffect(() => {
    const mediaMotywu = window.matchMedia('(prefers-color-scheme: dark)')
    const mediaRuchu = window.matchMedia('(prefers-reduced-motion: reduce)')
    const zastosuj = () => {
      ciemnyMotywSystemowyRef.current = mediaMotywu.matches
      ograniczRuchSystemowoRef.current = mediaRuchu.matches
      zastosujBiezaceUstawienia(podgladUstawienRef.current ?? zapisaneUstawieniaRef.current)
    }
    zastosuj()
    mediaMotywu.addEventListener('change', zastosuj)
    mediaRuchu.addEventListener('change', zastosuj)
    return () => {
      mediaMotywu.removeEventListener('change', zastosuj)
      mediaRuchu.removeEventListener('change', zastosuj)
    }
  }, [zastosujBiezaceUstawienia])

  useEffect(() => {
    if (!podgladUstawienRef.current) zastosujBiezaceUstawienia(zapisaneUstawienia)
  }, [zapisaneUstawienia, zastosujBiezaceUstawienia])

  useEffect(() => {
    let zakonczNasluchiwanie: (() => void) | undefined
    let aktywne = true
    void platforma.udostepnianie.nasluchujOdebrania((dane) => {
      if (!aktywne) return
      ustawSzybkieDodawanie({ typ: 'notatka', tresc: dane.tekst, tytul: dane.tytul })
    }).then((zakoncz) => {
      if (aktywne) zakonczNasluchiwanie = zakoncz
      else zakoncz()
    }).catch(() => undefined)
    return () => {
      aktywne = false
      zakonczNasluchiwanie?.()
    }
  }, [])

  const zapiszUstawienia = async (zmiany: Partial<Ustawienia>) => {
    const zapisane = await repozytoriumUstawien.zapisz({ ...zapisaneUstawienia, ...zmiany })
    zapisaneUstawieniaRef.current = zapisane
    podgladUstawienRef.current = null
    zastosujBiezaceUstawienia(zapisane)
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
      otworzSzybkieDodawanie,
      otworzSzybkieDodawanieZDanymi,
      otworzWyszukiwanie: () => ustawWyszukiwanie(true),
      moze,
    }}>
      {children}
      <SilnikPrzypomnien />
      {szybkieDodawanie && <SzybkieDodawanie danePoczatkowe={szybkieDodawanie} moze={moze} zamknij={() => ustawSzybkieDodawanie(null)} />}
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
