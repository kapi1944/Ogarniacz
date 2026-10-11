# Health — Android i skrócona akceptacja, 2026-10-11

## Zmiany

Natywne `extra` zawiera wyłącznie `ogarniacz`, `przypomnienieId` i `wersja`.
Dawka, jej stan, powiązanie i adres rekordu są rozwiązywane z lokalnej bazy,
po wczytaniu ustawień i sprawdzeniu dostępu oraz aktualności alarmu.
Akcje dawki prowadzą do dotychczasowego potwierdzenia w module Zdrowie.
ID wystąpień pozostają stabilne i rozróżniają dwie jesienne godziny.

Wersja metadanych `v3` wymusza zastąpienie oczekujących alarmów ze starym
`extra` przy następnym uzgodnieniu. Stare wyświetlone alarmy są usuwane;
alarm po terminie nie jest przez tę migrację ponownie dostarczany.
Odmowa zgody systemowej, wyłączenie powiadomień i utrata dostępu powodują
anulowanie oczekujących oraz usunięcie wyświetlonych przypomnień Ogarniacza.
Zdalne cofnięcie grantu musi najpierw dotrzeć do aplikacji; nie zakładamy,
że zamknięta aplikacja bez łączności zna zmianę na serwerze.

Nowe instalacje domyślnie ukrywają szczegóły zdrowotne. Jawnie zapisane
wcześniej `false` i `true` pozostają zachowane.

## Przeglądarka

Wykonano przez istniejącą automatyzację przeglądarki aplikacji, na osobnym
lokalnym adresie `127.0.0.1:5199`, bez skonfigurowanej synchronizacji.
Utworzono wyłącznie syntetyczną sesję, ćwiczenie i profil edytora.
To akceptacja lokalnego podglądu, nie dowód działania sesji backendu.

| Scenariusz | Wynik |
| --- | --- |
| Właściciel otwiera własną sesję i widzi syntetyczną notatkę | PASS |
| Edytor z ogólnym grantem Zdrowie nie widzi prywatnej sesji | PASS |
| Po cofnięciu osobnego grantu ponowne wejście jest blokowane | PASS |
| Cofnięcie grantu zamyka już otwarty podgląd w niezależnej sesji edytora | NOT TESTED — lokalny tryb użytkownika jest współdzielony przez karty; brak dwóch niezależnych sesji backendu |
| Bezpośredni link z ID istniejącej sesji nie omija uprawnień | PASS |
| Wyszukiwanie globalne nie zwraca syntetycznej sesji, także właścicielowi | PASS |
| Lokalne Echo nie odczytuje notatek psychoterapii ani nie zwraca sesji przy wyszukiwaniu jej znacznika | PASS — lokalna ścieżka; nie testowano zewnętrznego providera |

## Samsung — testy ręczne

`adb devices -l` działa, lecz lista urządzeń jest pusta. Wszystkie poniższe
testy fizyczne mają status **NOT TESTED**. Używać danych syntetycznych,
bez czyszczenia danych i odinstalowywania aplikacji.

1. Zaplanuj syntetyczną dawkę i zablokuj ekran. Przy włączonym ukrywaniu
   zobacz neutralny komunikat; stuknięcie ma otworzyć właściwe wystąpienie.
2. Na trzech osobnych dawkach sprawdź Przyjęto, Pominięto i Odroczono.
   Potwierdź decyzję w aplikacji; stan i zapas mają zmienić się tylko raz,
   a odroczenie ma zastąpić dotychczasowy alarm.
3. Zmień schemat lub zapisz nowszy stan dawki. Stary alarm ma zniknąć,
   a jego zachowana akcja nie może zmienić aktualnego stanu.
4. Odbierz grant do leków i poczekaj na odświeżenie dostępu w aplikacji.
   Osobno wyłącz zgodę Androida i wróć do aplikacji. Oczekujące oraz
   widoczne alarmy mają zniknąć; ponowna zgoda nie może duplikować alarmów.
5. Zmień konto przy oczekującym i widocznym alarmie poprzedniego konta.
   Oba mają zniknąć; zachowane stuknięcie nie może otworzyć dawki ani jej zmienić.
6. Uruchom ponownie telefon z przyszłym alarmem i sprawdź dostarczenie
   oraz otwarcie z zamkniętej aplikacji. W osobnej próbie jesiennej zmiany
   czasu sprawdź dwa wystąpienia 02:00: każde otwiera swoją dawkę i decyzja
   dotycząca pierwszego nie rozlicza drugiego.

## Weryfikacja automatyczna

PASS: 108 testów celowanych w ośmiu plikach (harmonogram, NotificationService,
nawigacja platformy, przypomnienia leków, widoki Zdrowia, silnik przypomnień,
ustawienia i inicjalizacja kontekstu). Po ostatnim doprecyzowaniu usuwania
starych wyświetlonych alarmów ponownie uruchomiono NotificationService:
49/49 PASS. Typecheck, lint zmienionych plików i `git diff --check`: PASS.
Nie uruchamiano pełnej regresji ani budowy/wydania APK.
