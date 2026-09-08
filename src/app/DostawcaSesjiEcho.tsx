import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAplikacja } from './KontekstAplikacji'
import { platforma } from '../platform/platforma'
import { EchoService } from '../services/EchoService'
import { KontrolerSesjiGlosowejEcho, type StanSesjiGlosowejEcho } from '../services/echo/KontrolerSesjiGlosowejEcho'
import { modulNarzedziaEcho, utworzDomyslnyRejestrNarzedziEcho, WykonawcaNarzedziEcho } from '../services/echo/NarzedziaEcho'
import { MagazynPreferencjiEcho, preferencjePlanowaniaZPamieci } from '../services/echo/PamiecPreferencjiEcho'
import { KonfiguracjaRozmowyEcho } from '../services/echo/KonfiguracjaRozmowyEcho'
import { KontrolerWakeWordEcho, type WynikTestuWakeWordEcho } from '../services/echo/KontrolerWakeWordEcho'
import { AdapterNatywnegoSilnikaWakeWordEcho, type StanSilnikaWakeWordEcho } from '../services/echo/SilnikWakeWordEcho'
import type { AkcjaDoPotwierdzeniaEcho, OdpowiedzEcho, TrybEcho, TrybRozmowyEcho, WartoscDomyslnaEcho, WynikNarzedziaEcho, ZrodloWejsciaEcho } from '../services/echo/typyEcho'
import type { NazwaModulu } from '../domain/typy'

export interface WiadomoscEcho {
  id: string
  autor: 'uzytkownik' | 'echo'
  tresc: string
  zrodloWejscia?: ZrodloWejsciaEcho
  ryzyko?: 'niskie' | 'umiarkowane' | 'wysokie'
  wartosciDomyslne?: WartoscDomyslnaEcho[]
  wyniki?: WynikNarzedziaEcho[]
}

interface WartoscSesjiEcho {
  echo: EchoService
  kontrolerGlosu: KontrolerSesjiGlosowejEcho
  kontrolerWakeWord: KontrolerWakeWordEcho
  stanWakeWord: StanSilnikaWakeWordEcho
  komunikatWakeWord?: string
  testujWakeWord: () => Promise<WynikTestuWakeWordEcho>
  stan: StanSesjiGlosowejEcho
  ustawStan: (stan: StanSesjiGlosowejEcho) => void
  tryb: TrybEcho
  trybRozmowy: TrybRozmowyEcho
  ustawTrybRozmowy: (trybRozmowy: TrybRozmowyEcho) => void
  wiadomosci: WiadomoscEcho[]
  ustawWiadomosci: React.Dispatch<React.SetStateAction<WiadomoscEcho[]>>
  oczekujacaAkcja?: AkcjaDoPotwierdzeniaEcho
  ustawOczekujacaAkcje: (akcja?: AkcjaDoPotwierdzeniaEcho) => void
  bladGlosu: string
  ustawBladGlosu: (blad: string) => void
  czesciowaWypowiedz: string
  dodajOdpowiedz: (odpowiedz: OdpowiedzEcho, zrodloWejscia: ZrodloWejsciaEcho) => void
}

const KontekstSesjiEcho = createContext<WartoscSesjiEcho | null>(null)

const etykietyModulowEcho: Partial<Record<NazwaModulu, string>> = {
  finanse: 'Finanse', samochod: 'Samochód', zdrowie: 'Zdrowie', zadania: 'Zadania', projekty: 'Projekty', zakupy: 'Zakupy', dokumenty: 'Dokumenty',
}

export function DostawcaSesjiEcho({ children }: { children: ReactNode }) {
  const { ustawienia, zapiszUstawienia } = useAplikacja()
  const magazynPamieci = useMemo(() => new MagazynPreferencjiEcho(), [])
  const konfiguracjaRozmowy = useMemo(() => new KonfiguracjaRozmowyEcho(ustawienia.trybRozmowyEcho), [])
  const echo = useMemo(() => {
    const rejestr = utworzDomyslnyRejestrNarzedziEcho({
      pobierzPreferencjePlanowania: async () => ustawienia.pamiecPreferencjiEcho ? preferencjePlanowaniaZPamieci(await magazynPamieci.wyszukaj('', 20)) : {},
    })
    const wykonawca = new WykonawcaNarzedziEcho(rejestr, undefined, undefined, (nazwa) => {
      if (nazwa === 'current_external_data') return ustawienia.internetEcho ? true : 'Dostęp Echo do internetu jest wyłączony. Możesz włączyć go w Ustawieniach Echo.'
      const modul = modulNarzedziaEcho(nazwa)
      if (!modul || ustawienia.modulyEcho.includes(modul)) return true
      return `Nie mam obecnie dostępu do modułu ${etykietyModulowEcho[modul] ?? modul}. Możesz włączyć go w Ustawieniach Echo.`
    })
    return new EchoService({ rejestr, wykonawca, magazynPamieci, pamiecPreferencjiWlaczona: ustawienia.pamiecPreferencjiEcho, konfiguracjaRozmowy, ustawAutomatycznyOdczyt: async (automatycznyOdczytEcho) => { await zapiszUstawienia({ automatycznyOdczytEcho }) }, ustawTrybRozmowy: async (trybRozmowy) => { await zapiszUstawienia({ trybRozmowyEcho: trybRozmowy }) } })
  }, [konfiguracjaRozmowy, magazynPamieci, ustawienia.internetEcho, ustawienia.modulyEcho, ustawienia.pamiecPreferencjiEcho, zapiszUstawienia])
  const [stan, ustawStan] = useState<StanSesjiGlosowejEcho>('bezczynny')
  const [tryb, ustawTryb] = useState<TrybEcho>(echo.agent.provider.tryb)
  const [trybRozmowy, ustawTrybRozmowyStan] = useState<TrybRozmowyEcho>(konfiguracjaRozmowy.pobierzTrybRozmowy())
  const [wiadomosci, ustawWiadomosci] = useState<WiadomoscEcho[]>([{ id: 'powitanie', autor: 'echo', tresc: 'Napisz albo powiedz, co masz na głowie. Z Echo możesz rozmawiać normalnie.' }])
  const [oczekujacaAkcja, ustawOczekujacaAkcje] = useState<AkcjaDoPotwierdzeniaEcho>()
  const [bladGlosu, ustawBladGlosu] = useState('')
  const [czesciowaWypowiedz, ustawCzesciowaWypowiedz] = useState('')
  const [stanWakeWord, ustawStanWakeWord] = useState<StanSilnikaWakeWordEcho>('zatrzymany')
  const [komunikatWakeWord, ustawKomunikatWakeWord] = useState<string>()
  useEffect(() => {
    konfiguracjaRozmowy.ustawTrybRozmowy(ustawienia.trybRozmowyEcho)
    ustawTrybRozmowyStan(ustawienia.trybRozmowyEcho)
  }, [konfiguracjaRozmowy, ustawienia.trybRozmowyEcho])
  const ustawTrybRozmowy = useCallback((nowyTryb: TrybRozmowyEcho) => {
    ustawTrybRozmowyStan(nowyTryb)
    void echo.ustawTrybRozmowy(nowyTryb)
  }, [echo])
  const dodajOdpowiedz = useCallback((odpowiedz: OdpowiedzEcho, zrodloWejscia: ZrodloWejsciaEcho) => {
    ustawTryb(odpowiedz.tryb)
    ustawWiadomosci((obecne) => [...obecne, { id: crypto.randomUUID(), autor: 'echo', tresc: odpowiedz.tekst, zrodloWejscia, ryzyko: odpowiedz.ryzyko, wartosciDomyslne: odpowiedz.wartosciDomyslne, wyniki: odpowiedz.wyniki }])
    ustawOczekujacaAkcje(odpowiedz.akcjaDoPotwierdzenia)
  }, [])
  const kontrolerGlosu = useMemo(() => new KontrolerSesjiGlosowejEcho({
    glos: platforma.glosEcho, echo, konfiguracjaRozmowy: echo.agent.konfiguracjaRozmowy, cyklZycia: platforma.cyklZycia,
    obsluga: {
      zmienStan: ustawStan, odebranoCzesciowaWypowiedz: ustawCzesciowaWypowiedz, zglosBlad: ustawBladGlosu,
      odebranoWypowiedz: (wypowiedz) => ustawWiadomosci((obecne) => [...obecne, { id: crypto.randomUUID(), autor: 'uzytkownik', tresc: wypowiedz }]),
      odebranoOdpowiedz: (odpowiedz) => dodajOdpowiedz(odpowiedz, 'stt'),
    },
  }), [dodajOdpowiedz, echo])
  const kontrolerWakeWord = useMemo(() => new KontrolerWakeWordEcho(
    new AdapterNatywnegoSilnikaWakeWordEcho(platforma.wakeWordEcho),
    kontrolerGlosu,
    platforma.cyklZycia,
    (nowyStan, komunikat) => { ustawStanWakeWord(nowyStan); ustawKomunikatWakeWord(komunikat) },
  ), [kontrolerGlosu])

  useEffect(() => {
    kontrolerGlosu.ustawPrzygotowanieWejscia(() => kontrolerWakeWord.wstrzymajDlaSesji())
    return () => kontrolerGlosu.ustawPrzygotowanieWejscia()
  }, [kontrolerGlosu, kontrolerWakeWord])

  useEffect(() => {
    if (!ustawienia.glosEcho) { void kontrolerGlosu.anuluj(); return }
    void kontrolerGlosu.inicjalizuj()
    return () => { void kontrolerGlosu.zniszcz() }
  }, [kontrolerGlosu, ustawienia.glosEcho])

  useEffect(() => {
    if (!ustawienia.hejEcho || !ustawienia.glosEcho) {
      void kontrolerWakeWord.zatrzymaj().then(() => kontrolerWakeWord.sprawdzStan())
      return
    }
    void kontrolerWakeWord.uruchom()
    return () => { void kontrolerWakeWord.zniszcz() }
  }, [kontrolerWakeWord, ustawienia.glosEcho, ustawienia.hejEcho])

  return <KontekstSesjiEcho.Provider value={{ echo, kontrolerGlosu, kontrolerWakeWord, stanWakeWord, komunikatWakeWord, testujWakeWord: () => kontrolerWakeWord.testuj(), stan, ustawStan, tryb, trybRozmowy, ustawTrybRozmowy, wiadomosci, ustawWiadomosci, oczekujacaAkcja, ustawOczekujacaAkcje, bladGlosu, ustawBladGlosu, czesciowaWypowiedz, dodajOdpowiedz }}>{children}</KontekstSesjiEcho.Provider>
}

export function useSesjaEcho() {
  const kontekst = useContext(KontekstSesjiEcho)
  if (!kontekst) throw new Error('Brak Dostawcy sesji Echo')
  return kontekst
}
