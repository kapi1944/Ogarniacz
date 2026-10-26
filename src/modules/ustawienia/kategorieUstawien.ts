export const KATEGORIE_USTAWIEN = [
  {
    id: 'wyglad', nazwa: 'Wygląd i interfejs',
    opcje: [
      'Styl interfejsu: Klasyczny, Luxury, Flat', 'Motyw: systemowy, jasny, ciemny',
      'Gęstość', 'Promień kart', 'Promień pól', 'Czas animacji',
      'Motywy i personalizacja: kolory, palety, komponenty, interakcje, animacje, podgląd',
      'Kolor pasków przewijania', 'Szerokość menu', 'Wysokość pozycji', 'Domyślnie zwiń menu',
      'Przypnij menu', 'Ogranicz ruch', 'Wysoki kontrast', 'Nie tylko kolor',
    ],
    slowaKluczowe: 'wyglad wygląd dostępność nawigacja czcionka rozmiar szmaragd złoto',
  },
  {
    id: 'pulpit', nazwa: 'Pulpit i organizacja',
    opcje: [
      'Alerty', 'Kafelki Pulpitu: zakres, rozmiar, limit, kolejność', 'Miniatury', 'Limit alertów',
      'Harmonogram: dni pracy, początek pracy, koniec pracy, sen, skala snu na osi',
      'Dojazd, powrót z pracy, dostępność podczas dojazdu', 'Zakres zmiany harmonogramu',
      'Zadania: domyślny priorytet, domyślny tryb terminu, pokazuj po wykonaniu',
      'Szybkie dodawanie: widoczne typy, ręczna kolejność, ucz kolejności, parser lokalny', 'Ustaw grafik pracy',
    ],
    slowaKluczowe: 'planowanie organizacja oś czasu widżety kafelki grafik',
  },
  {
    id: 'echo', nazwa: 'Echo AI',
    opcje: [
      'Tryb rozmowy', 'Głos', 'Hej Echo', 'Stan silnika', 'Testuj „Hej Echo”',
      'Czytaj odpowiedzi Echo na głos', 'Proaktywność', 'Wyciszenie', 'Pamięć preferencji',
      'Dostęp do internetu', 'Uprawnienia do modułów', 'Pamięć Echo: fakty, preferencje, reguły',
    ],
    slowaKluczowe: 'asystent mikrofon wake word sugestie mowa sztuczna inteligencja',
  },
  {
    id: 'powiadomienia', nazwa: 'Powiadomienia',
    opcje: [
      'Zgoda na powiadomienia', 'Powiadomienia systemowe', 'Kanały Androida', 'Dokładne alarmy',
      'Ukrywaj szczegóły zdrowotne w powiadomieniach', 'Systemowe powiadomienia synchronizacji',
    ],
    slowaKluczowe: 'przypomnienia leki wizyty prywatność zdrowia notification api android local notifications',
  },
  {
    id: 'konta', nazwa: 'Konta i uprawnienia',
    opcje: [
      'Konto i bezpieczeństwo', 'Konta i użytkownicy', 'Zmień hasło', 'Aktywne sesje',
      'Odzyskiwanie dostępu', 'Profile i lokalny podgląd', 'Zakres dostępu Edytora',
      'Nadaj uprawnienie: moduł, kategoria danych, odczyt, edycja',
    ],
    slowaKluczowe: 'logowanie udostępnianie użytkownik administrator właściciel permission grant',
  },
  {
    id: 'synchronizacja', nazwa: 'Synchronizacja',
    opcje: [
      'Synchronizuj teraz', 'Ostatni udany pull', 'Oczekujące zmiany', 'Konflikty wymagające decyzji',
      'Diagnostyka synchronizacji: połączenie z backendem, ostatni udany push, ostatnia próba synchronizacji',
      'Środowisko, endpoint, protokół, sesja, rola, CSRF, Installation ID, autoryzacja klienta',
    ],
    slowaKluczowe: 'sync serwer offline sieć połączenie rozstrzyganie konfliktów',
  },
  {
    id: 'dane', nazwa: 'Dane i kopie',
    opcje: [
      'Dane lokalne: IndexedDB, użycie pamięci', 'Przenieś dane między urządzeniami',
      'Prywatność danych zdrowotnych', 'Dane / Backup: utwórz zaszyfrowany backup, zapisz, pobierz, udostępnij',
      'Wybierz backup do restore, przywróć wybrane sekcje, kopia ochronna',
      'Import / eksport samych ustawień', 'Dane / Historia', 'Dane demonstracyjne', 'Wyczyść dane lokalne',
    ],
    slowaKluczowe: 'kopia zapasowa backup szyfrowanie hasło json przenoszenie danych reset usuwanie',
  },
  {
    id: 'system', nazwa: 'System i diagnostyka',
    opcje: [
      'Podsumowanie połączenia i aktualizacji', 'Kopiuj raport diagnostyczny',
      'Aktualizacje aplikacji: Android APK, Raspberry / serwer',
      'Wersja aplikacji, sprawdź aktualizacje, pobierz i zainstaluj',
      'Aktualizacje testowe: commit main, status CI, build testowy',
    ],
    slowaKluczowe: 'system diagnostyka instalator wersja beta raspberry pi pwa',
  },
] as const

export type KategoriaUstawienId = typeof KATEGORIE_USTAWIEN[number]['id']

export function normalizujZapytanieUstawien(zapytanie: string) {
  return zapytanie.toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').trim()
}
