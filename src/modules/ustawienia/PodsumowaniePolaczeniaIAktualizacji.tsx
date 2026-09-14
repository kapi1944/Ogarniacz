import { useSyncExternalStore } from 'react'
import { Karta, Znacznik } from '../../components/Interfejs'
import { nasluchujKontroliAktualizacji, pobierzStanKontroliAktualizacji, type StanKontroliAktualizacji } from '../../services/KontrolaAktualizacjiAplikacji'

export interface PodsumowaniePolaczeniaIAktualizacjiProps {
  synchronizacjaSkonfigurowana: boolean
  stan?: StanKontroliAktualizacji
}

export function ustalPodsumowaniePolaczeniaIAktualizacji(
  synchronizacjaSkonfigurowana: boolean,
  stan: StanKontroliAktualizacji,
) {
  if (stan.wynikApk?.czyNowsza || stan.wynikWeb?.wymagaNowszegoApk) {
    return { tytul: 'Dostępna nowa wersja aplikacji', opis: 'Zaktualizuj aplikację Android, zanim zastosujesz szybkie poprawki.', wariant: 'ostrzezenie' as const }
  }
  if (stan.wynikWeb?.czyDostepna && !stan.wynikWeb.czyOdrzucona) {
    return { tytul: 'Dostępna szybka poprawka', opis: 'Możesz bezpiecznie zastosować zgodną poprawkę interfejsu.', wariant: 'informacja' as const }
  }
  if (!synchronizacjaSkonfigurowana) {
    return { tytul: 'Wymagana konfiguracja synchronizacji', opis: 'Konfiguracja tego urządzenia jest niepełna. Sprawdź szczegóły synchronizacji poniżej.', wariant: 'ostrzezenie' as const }
  }
  if (stan.bladApk || stan.bladWeb) {
    return { tytul: 'Nie udało się sprawdzić aktualizacji', opis: stan.bladApk ?? stan.bladWeb ?? 'Sprawdź połączenie z serwerem.', wariant: 'blad' as const }
  }
  return { tytul: 'Ogarniacz jest aktualny', opis: 'Synchronizacja i aktualizacje są sprawdzane w tle.', wariant: 'sukces' as const }
}

export function PodsumowaniePolaczeniaIAktualizacji({ synchronizacjaSkonfigurowana, stan: stanWejsciowy }: PodsumowaniePolaczeniaIAktualizacjiProps) {
  const stanZSerwisu = useSyncExternalStore(nasluchujKontroliAktualizacji, pobierzStanKontroliAktualizacji, pobierzStanKontroliAktualizacji)
  const podsumowanie = ustalPodsumowaniePolaczeniaIAktualizacji(synchronizacjaSkonfigurowana, stanWejsciowy ?? stanZSerwisu)
  return <Karta>
    <div className="naglowek-karty"><div><h2>{podsumowanie.tytul}</h2><p>{podsumowanie.opis}</p></div><Znacznik wariant={podsumowanie.wariant}>{podsumowanie.tytul}</Znacznik></div>
  </Karta>
}
