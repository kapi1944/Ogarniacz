import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, RotateCcw, ServerCog } from 'lucide-react'
import { Karta, Komunikat, Znacznik } from '../../components/Interfejs'
import { useKonto } from '../../app/DostawcaKonta'
import { BladKonta, pobierzStatusAktualizacjiRaspberry, uruchomAktualizacjeRaspberry, type StatusAktualizacjiRaspberry } from '../../services/KontaService'

const ETYKIETY_STANOW: Record<StatusAktualizacjiRaspberry['stan'], string> = {
  idle: 'aktualna',
  checking: 'sprawdzanie',
  'downloading/fetching': 'pobieranie',
  installing: 'instalowanie',
  building: 'budowanie',
  restarting: 'restart',
  success: 'sukces',
  rollback: 'rollback',
  error: 'błąd',
}

const STANY_W_TRAKCIE = new Set<StatusAktualizacjiRaspberry['stan']>(['checking', 'downloading/fetching', 'installing', 'building', 'restarting', 'rollback'])

function opisBledu(blad: unknown, kontoDostepne: boolean): string {
  if (!(blad instanceof BladKonta)) return 'Backend Raspberry chwilowo nie odpowiada. Trwa ponawianie odczytu statusu.'
  if (blad.status === 401 || !kontoDostepne) return 'Brak sesji. Zaloguj się jako Właściciel, aby sterować aktualizacją Raspberry.'
  if (blad.status === 403) return 'Tylko Właściciel może sterować aktualizacją Raspberry.'
  if (blad.status === 409) return blad.message
  return blad.message
}

function wariantStatusu(stan: StatusAktualizacjiRaspberry['stan']): 'neutralny' | 'sukces' | 'ostrzezenie' | 'blad' | 'informacja' {
  if (stan === 'success' || stan === 'idle') return 'sukces'
  if (stan === 'error') return 'blad'
  if (STANY_W_TRAKCIE.has(stan)) return 'informacja'
  return 'neutralny'
}

export function PanelAktualizacjiRaspberry() {
  const { konto } = useKonto()
  const [dostepny, ustawDostepny] = useState<boolean>()
  const dostepnyRef = useRef<boolean | undefined>(undefined)
  const [status, ustawStatus] = useState<StatusAktualizacjiRaspberry>()
  const [blad, ustawBlad] = useState('')
  const [trwaOperacja, ustawTrwaOperacja] = useState(false)
  const oczekiwanieNaStan = useRef<{ podpis: string; odczyty: number; niepewna: boolean } | null>(null)

  const odswiezStatus = useCallback(async (podczasRestartu = false) => {
    try {
      const nowyStatus = await pobierzStatusAktualizacjiRaspberry()
      dostepnyRef.current = true
      ustawDostepny(true)
      ustawStatus(nowyStatus)
      ustawBlad('')
      if (STANY_W_TRAKCIE.has(nowyStatus.stan)) oczekiwanieNaStan.current = null
      else if (oczekiwanieNaStan.current) {
        const podpis = `${nowyStatus.stan}|${nowyStatus.commit}|${nowyStatus.komunikat}`
        if (podpis === oczekiwanieNaStan.current.podpis && oczekiwanieNaStan.current.odczyty++ < 3) return
        if (podpis === oczekiwanieNaStan.current.podpis && oczekiwanieNaStan.current.niepewna) ustawBlad('Nie udało się potwierdzić uruchomienia aktualizatora. Sprawdź stan Raspberry.')
        oczekiwanieNaStan.current = null
        ustawTrwaOperacja(false)
      } else ustawTrwaOperacja(false)
    } catch (przyczyna) {
      if (przyczyna instanceof BladKonta && przyczyna.status === 404) {
        dostepnyRef.current = false
        ustawDostepny(false)
        return
      }
      if (przyczyna instanceof BladKonta && (przyczyna.status === 401 || przyczyna.status === 403)) {
        dostepnyRef.current = true
        ustawDostepny(true)
        ustawBlad(opisBledu(przyczyna, Boolean(konto)))
        ustawTrwaOperacja(false)
        return
      }
      if (dostepnyRef.current !== true) {
        ustawDostepny(false)
        return
      }
      ustawDostepny(true)
      if (podczasRestartu) return
      ustawBlad(opisBledu(przyczyna, Boolean(konto)))
      ustawTrwaOperacja(false)
    }
  }, [konto])

  useEffect(() => { void odswiezStatus() }, [odswiezStatus])

  useEffect(() => {
    if (!trwaOperacja && !STANY_W_TRAKCIE.has(status?.stan ?? 'idle')) return
    const identyfikator = window.setInterval(() => { void odswiezStatus(true) }, 3_000)
    return () => window.clearInterval(identyfikator)
  }, [trwaOperacja, status?.stan, odswiezStatus])

  const uruchom = async (akcja: 'check' | 'start' | 'rollback') => {
    if (trwaOperacja) return
    if (!konto) {
      ustawBlad('Brak sesji. Zaloguj się jako Właściciel, aby sterować aktualizacją Raspberry.')
      return
    }
    if (konto.rola !== 'wlasciciel') {
      ustawBlad('Tylko Właściciel może sterować aktualizacją Raspberry.')
      return
    }
    ustawBlad('')
    ustawTrwaOperacja(true)
    oczekiwanieNaStan.current = { podpis: `${status?.stan}|${status?.commit}|${status?.komunikat}`, odczyty: 0, niepewna: false }
    try {
      await uruchomAktualizacjeRaspberry(akcja)
      await odswiezStatus(true)
    } catch (przyczyna) {
      if (przyczyna instanceof BladKonta && przyczyna.status === 409) {
        ustawBlad(opisBledu(przyczyna, true))
        oczekiwanieNaStan.current = null
        return
      }
      if (przyczyna instanceof BladKonta && (przyczyna.status === 401 || przyczyna.status === 403 || przyczyna.status === 412)) {
        oczekiwanieNaStan.current = null
        ustawTrwaOperacja(false)
        ustawBlad(opisBledu(przyczyna, true))
      } else if (oczekiwanieNaStan.current) oczekiwanieNaStan.current.niepewna = true
    }
  }

  if (dostepny !== true) return null

  const wlasciciel = konto?.rola === 'wlasciciel'
  const moznaPrzywrocic = status?.moznaPrzywrocic === true
  const akcjeZablokowane = trwaOperacja || !wlasciciel
  return <Karta>
    <div className="naglowek-karty"><div><h2><ServerCog aria-hidden="true" /> Aktualizacja Raspberry</h2><p>Steruje istniejącym aktualizatorem na Raspberry Pi. Nie dotyczy APK ani szybkich poprawek Web.</p></div>{status && <Znacznik wariant={wariantStatusu(status.stan)}>{ETYKIETY_STANOW[status.stan]}</Znacznik>}</div>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    {status && <><div className="lista-kompaktowa"><div><span>Wersja</span><strong>{status.wersja}</strong></div><div><span>Commit</span><strong>{status.commit.slice(0, 8)}</strong></div><div><span>Dostępność</span><strong>{status.dostepnosc}</strong></div><div><span>Stan</span><strong>{ETYKIETY_STANOW[status.stan]}</strong></div></div>{status.komunikat && <p className="tekst-pomocniczy">{status.komunikat}</p>}</>}
    {!wlasciciel && <p className="tekst-pomocniczy">{konto ? 'Edytor nie może uruchamiać aktualizacji Raspberry.' : 'Zaloguj się jako Właściciel, aby uruchamiać aktualizacje Raspberry.'}</p>}
    <div className="akcje-formularza"><button type="button" className="przycisk przycisk--drugorzedny" disabled={akcjeZablokowane} onClick={() => void uruchom('check')}><RefreshCw aria-hidden="true" />Sprawdź aktualizacje</button><button type="button" className="przycisk przycisk--glowny" disabled={akcjeZablokowane || status?.dostepnosc !== 'dostepna'} onClick={() => void uruchom('start')}>Zainstaluj aktualizację</button>{moznaPrzywrocic && <button type="button" className="przycisk przycisk--niebezpieczny" disabled={akcjeZablokowane} onClick={() => void uruchom('rollback')}><RotateCcw aria-hidden="true" />Przywróć poprzednią wersję</button>}</div>
  </Karta>
}
