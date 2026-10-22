import { useRef, useState, useSyncExternalStore } from 'react'
import { Karta, Znacznik } from '../../components/Interfejs'
import { nasluchujKontroliAktualizacji, pobierzStanKontroliAktualizacji, type StanKontroliAktualizacji } from '../../services/KontrolaAktualizacjiAplikacji'
import { utworzTekstRaportuDiagnostycznego, type DaneDiagnostykiSynchronizacji } from '../../services/DiagnostykaSynchronizacji'

export interface PodsumowaniePolaczeniaIAktualizacjiProps {
  synchronizacjaSkonfigurowana: boolean
  stan?: StanKontroliAktualizacji
  diagnostyka?: DaneDiagnostykiSynchronizacji
}

export function ustalPodsumowaniePolaczeniaIAktualizacji(
  synchronizacjaSkonfigurowana: boolean,
  stan: StanKontroliAktualizacji,
  diagnostyka?: DaneDiagnostykiSynchronizacji,
) {
  if (synchronizacjaSkonfigurowana && diagnostyka?.wymaganeLogowanie) {
    return { tytul: 'Synchronizacja wymaga logowania', opis: 'Zaloguj się ponownie przez panel konta. Lokalne zmiany pozostają na urządzeniu.', wariant: 'ostrzezenie' as const }
  }
  if (diagnostyka?.liczbaKonfliktow) {
    return { tytul: 'Synchronizacja wymaga decyzji', opis: 'Rozstrzygnij konflikty w panelu poniżej. Obie wersje danych są zachowane.', wariant: 'ostrzezenie' as const }
  }
  if (diagnostyka?.stanPolaczenia === 'offline' || diagnostyka?.stanPolaczenia === 'niedostępne') {
    return { tytul: 'Brak połączenia z backendem', opis: 'Sprawdź internet i Tailscale. Lokalne zmiany czekają na synchronizację.', wariant: 'ostrzezenie' as const }
  }
  if (diagnostyka?.liczbaOczekujacych) {
    return { tytul: 'Zmiany czekają na synchronizację', opis: `Oczekujące rekordy: ${diagnostyka.liczbaOczekujacych}. Sprawdź stan i ostatni błąd poniżej.`, wariant: 'informacja' as const }
  }
  if (diagnostyka?.stanSynchronizacji === 'blad') {
    return { tytul: 'Nie udało się zsynchronizować danych', opis: diagnostyka.ostatniBlad?.komunikat ?? 'Ponów synchronizację i sprawdź szczegóły poniżej.', wariant: 'blad' as const }
  }
  if (synchronizacjaSkonfigurowana && diagnostyka && !diagnostyka.ostatniPull) {
    return { tytul: 'Nie potwierdzono synchronizacji', opis: 'Brak zapisanego udanego pobrania danych. Sprawdź ostatnią próbę lub wybierz „Synchronizuj teraz”.', wariant: 'informacja' as const }
  }
  if (stan.wynikApk?.czyNowsza) {
    return { tytul: 'Dostępna nowa wersja aplikacji', opis: 'Zainstaluj nowe podpisane APK aplikacji Android.', wariant: 'ostrzezenie' as const }
  }
  if (!synchronizacjaSkonfigurowana) {
    return { tytul: 'Wymagana konfiguracja synchronizacji', opis: 'Konfiguracja tego urządzenia jest niepełna. Sprawdź szczegóły synchronizacji poniżej.', wariant: 'ostrzezenie' as const }
  }
  if (stan.bladApk) {
    return { tytul: 'Nie udało się sprawdzić aktualizacji', opis: stan.bladApk ?? 'Sprawdź połączenie z serwerem.', wariant: 'blad' as const }
  }
  return { tytul: 'Ogarniacz jest aktualny', opis: 'Synchronizacja i aktualizacje są sprawdzane w tle.', wariant: 'sukces' as const }
}

export function PodsumowaniePolaczeniaIAktualizacji({ synchronizacjaSkonfigurowana, diagnostyka, stan: stanWejsciowy }: PodsumowaniePolaczeniaIAktualizacjiProps) {
  const stanZSerwisu = useSyncExternalStore(nasluchujKontroliAktualizacji, pobierzStanKontroliAktualizacji, pobierzStanKontroliAktualizacji)
  const podsumowanie = ustalPodsumowaniePolaczeniaIAktualizacji(synchronizacjaSkonfigurowana, stanWejsciowy ?? stanZSerwisu, diagnostyka)
  const [raportDoRecznegoSkopiowania, ustawRaportDoRecznegoSkopiowania] = useState('')
  const [komunikatKopiowania, ustawKomunikatKopiowania] = useState('')
  const poleRaportu = useRef<HTMLTextAreaElement>(null)

  const kopiujRaport = async () => {
    if (!diagnostyka) return
    const raport = utworzTekstRaportuDiagnostycznego(diagnostyka)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Schowek niedostępny')
      await navigator.clipboard.writeText(raport)
      ustawRaportDoRecznegoSkopiowania('')
      ustawKomunikatKopiowania('Raport diagnostyczny skopiowano do schowka.')
    } catch {
      ustawRaportDoRecznegoSkopiowania(raport)
      ustawKomunikatKopiowania('Nie udało się skopiować raportu. Zaznacz go poniżej i skopiuj ręcznie.')
    }
  }

  return <Karta>
    <div className="naglowek-karty"><div><h2>{podsumowanie.tytul}</h2><p>{podsumowanie.opis}</p></div><Znacznik wariant={podsumowanie.wariant}>{podsumowanie.tytul}</Znacznik></div>
    {diagnostyka && <div className="akcje-formularza">
      <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => void kopiujRaport()}>Kopiuj raport diagnostyczny</button>
      {komunikatKopiowania && <p role={raportDoRecznegoSkopiowania ? 'alert' : 'status'}>{komunikatKopiowania}</p>}
      {raportDoRecznegoSkopiowania && <><label htmlFor="raport-diagnostyczny-synchronizacji">Raport do ręcznego skopiowania</label><textarea id="raport-diagnostyczny-synchronizacji" ref={poleRaportu} readOnly value={raportDoRecznegoSkopiowania} rows={12} /><button type="button" className="przycisk przycisk--drugorzedny" onClick={() => poleRaportu.current?.select()}>Zaznacz raport</button></>}
    </div>}
  </Karta>
}
