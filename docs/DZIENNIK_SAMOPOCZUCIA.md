# Health 2.0 — etap 4

Dziennik dostępny jest ze skrótu „Jak się dziś czujesz?” w Zdrowiu, pod `/zdrowie/samopoczucie`. Nie dodaje pozycji do globalnego menu.

## Dane i formularz

`WpisSamopoczucia` zawiera ID, lokalną datę i godzinę obserwacji, pełną chwilę oraz strefę IANA, metadane utworzenia i edycji, opcjonalną notatkę, świadomie wybrane wskaźniki, szczegóły siedmiu opcjonalnych sekcji, znacznik „Do omówienia na terapii” i opcjonalne odniesienia do leku, wizyty lub wpisu terapii. Nie zapisuje powiązań zwrotnych w tych encjach. Wiele wpisów jednego dnia ma odrębne ID. Jesienne wystąpienia tej samej godziny wymagają wskazania konkretnej chwili; godzina nieistniejąca wiosną jest odrzucana.

Dziesięć początkowych wskaźników opisuje subiektywne obserwacje. Szybki formularz pokazuje ulubione; nie zapisuje początkowej pozycji suwaka. Zero wymaga wybrania. Brak obserwacji i odpowiedź „Nie” są odrębnymi stanami. Rozszerzenie odsłania opcjonalne sekcje samopoczucia, snu, objawów, wydarzeń, refleksji, strategii i zagadnień na terapię.

Historia grupuje wpisy według daty, sortuje pełne chwile, filtruje zakres i znacznik terapeutyczny. Edycja zachowuje stare definicje, a usunięcie stosuje istniejące `usunietoAt`. Spóźniona edycja jest odrzucana.

## Personalizacja i wersje

Sekcja ustawień Zdrowia otwierana z dziennika korzysta z istniejącego repozytorium ustawień. Pole `samopoczucie` przechowuje uporządkowane ulubione, widoczne sekcje, domyślny tryb oraz kolejne definicje wskaźników. Można zmieniać nazwę, opis, typ (liczba, tekst, tak/nie), zakres, krok, etykiety końców, jednostkę, kierunek i aktywność. Zmiana tworzy nową wersję, wcześniejsze wersje są zachowywane. Wpis zawiera pełny snapshot wykorzystanej definicji.

Istniejące własne pola Rejestru nie opisują końców, kierunku i zakresu historycznej skali. Dlatego użyto małego modelu wskaźników w ustawieniach Zdrowia, bez nowego silnika formularzy ani zmian modelu dawkowania.

## Prywatność, migracja i backup

Tabela `wpisySamopoczucia` jest lokalna w istniejącej bazie Dexie. Dziennik nie jest źródłem Echo, wyszukiwania globalnego, globalnej historii ani powiadomień. Wpisy nie trafiają do outboxu. Prywatne definicje i preferencje są usuwane z przesyłanych ustawień również podczas odczytu kolejki. Pobranie i rozwiązanie konfliktu ustawień zachowuje lokalne pole dziennika. Uprawnienia istniejącego modułu Zdrowie kontrolują odczyt i edycję; personalizacja wymaga także prawa edycji ustawień. Te ograniczenia aplikacji nie stanowią szyfrowania bazy ani ochrony przed dostępem do profilu urządzenia.

Migracja Dexie 16 → 17 dodaje pustą tabelę, zachowując wcześniejsze dane. Format backupu pozostaje 3. Nowa sekcja `samopoczucie` zawiera wpisy wraz z dawnymi skalami; ustawienia zawierają prywatne definicje i preferencje. Starszy backup bez sekcji nie czyści dziennika, a starsze ustawienia bez tego pola zachowują jego lokalną konfigurację. Pełna kopia `before-restore` obejmuje nową sekcję i podlega dotychczasowej walidacji; przywracanie pozostaje transakcyjne. Backup zawiera wrażliwe dane w postaci nieszyfrowanej.

## Ręczne sprawdzenie na Samsungu

1. Otwórz Zdrowie → „Jak się dziś czujesz?” → dodaj wpis. Klawiatura nie powinna otworzyć się samoczynnie.
2. Wybierz zero dla jednego wskaźnika i zapisz. Pozostałe suwaki nie powinny pojawić się jako obserwacje.
3. Dodaj drugą obserwację tego samego dnia, tylko z notatką. Włącz „Do omówienia”, sprawdź filtr, edycję i usunięcie.
4. W ustawieniach dodaj własną skalę, ustaw ulubione i kolejność. Zmień jej zakres przez kolejną wersję; wcześniejszy wpis powinien zachować dawny zakres.
5. Sprawdź sekcje rozszerzone i przewijanie przy otwartej klawiaturze. W trybie samolotowym zapisz wpis, zamknij i ponownie otwórz aplikację.
6. Wyeksportuj dziennik oraz ustawienia i przywróć kopię. Sprawdź wpisy, dawne skale i preferencje.

Fizyczny Samsung, instalacja PWA i zachowanie klawiatury systemowej wymagają ręcznej weryfikacji. Nie dodano diagnoz, testów klinicznych, AI, porad, wykresów ani synchronizacji dziennika.

## Zmienione pliki

- `src/domain/samopoczucie.ts`, `src/domain/typy.ts`, `src/domain/ustawienia.ts`
- `src/data/BazaOgarniacza.ts`, `src/data/BazaOgarniacza.migracje.test.ts`
- `src/data/DostawcaSynchronizacji.ts`, `src/data/KolejkaSynchronizacji.ts`, `src/data/RepozytoriumUstawien.ts`
- `src/services/SamopoczucieService.ts`, `src/services/SamopoczucieService.test.ts`
- `src/services/BackupService.ts`, `src/services/SyncEngine.ts`
- `src/modules/zdrowie/WidokSamopoczucia.tsx`, `src/modules/zdrowie/WidokSamopoczucia.test.tsx`, `src/modules/zdrowie/WidokiZdrowia.tsx`
- `src/App.tsx`, `src/styles/glowny.css`
- `docs/DZIENNIK_SAMOPOCZUCIA.md`
- `docs/DATA.md`

## Weryfikacja lokalna

Typecheck i build web/PWA zakończyły się poprawnie. Przeszło 121 testów w siedmiu plikach: serwis i formularz samopoczucia, backup, SyncEngine, migracje Dexie, dotychczasowy widok Zdrowia i normalizacja ustawień. Celowany lint oraz `git diff --check` bez błędów. Przeglądarka: szybki formularz na desktopie oraz formularz i pusta historia przy szerokości 360 px bez poziomego przewijania. Testy offline obejmują lokalny zapis i ponowne otwarcie IndexedDB; nie dowodzą instalacji ani pracy zamkniętej aplikacji na fizycznym telefonie. Migrację sprawdzono na kontrolowanych rekordach starszej bazy, bez otwierania prywatnej bazy użytkownika.
