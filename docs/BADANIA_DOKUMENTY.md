# Health 2.0 — etap 6: badania i dokumenty

Widok `/zdrowie/badania-dokumenty` udostępnia zakładki Badania, Dokumenty i Skierowania. Korzysta z istniejących komponentów, repozytoriów i plików `Dokument.plik` w Dexie. Formularze i wyszukiwarka nie ustawiają autofocus. Szczegóły opcjonalne są zwijane.

## Model i migracja

`Dokument.medyczne` to opcjonalne metadane: kategoria, daty dokumentu i otrzymania, placówka, specjalista, opis, tagi oraz identyfikatory skierowania, terapii, recepty, kontaktu i miejsca. Dopisanie metadanych zachowuje ID, dotychczasowe pola i Blob; dokumenty nie są przenoszone ani kopiowane. Dodatkowe dotychczasowe `powiazania` pozostają zachowane.

Nowa encja `WynikBadania` w tabeli `wynikiBadan` ma ID, datę pobrania i opcjonalną datę otrzymania, oryginalny wynik, jawny kwalifikator i opcjonalną wartość liczbową lub tekstową, jednostkę, metodę, oryginalny zakres referencyjny, wymagany `dokumentId`, opcjonalną wizytę, notatkę i standardowe metadane z miękkim usuwaniem. Dexie 17 → 18 dodaje tylko tę tabelę i indeksy; nie przepisuje wcześniejszych danych.

Parser zachowuje oryginalny tekst. Pełny zapis liczby (także `5,2`) daje liczbę; `< 5` i `> 100` mają odrębne kwalifikatory. Pozostałe zapisy, np. `ujemny`, `dodatni`, `nie wykryto`, są tekstem. Nie ma przeliczania jednostek, domyślnej jednostki, zgadywania zakresu ani interpretacji medycznej.

Opcjonalne `grupaId` i `nazwaGrupy` grupują parametry bez nowej encji lub kopii pliku. Serwis wymaga wspólnej nazwy, daty pobrania i dokumentu dla aktywnych parametrów grupy. Formularz pozwala wybrać istniejącą grupę lub utworzyć nową. Zmiana wspólnej daty/dokumentu wymaga odłączenia parametru od grupy; zbiorcza edycja grupy jest poza etapem.

## Relacje

Kanoniczny zapis dokument–wizyta: `Dokument.powiazania` z `typ: wizyty`. `Wizyta.dokumentyIds` pozostaje projekcją dla starszych odbiorców. Odczyt widoku wizyt i dokumentów bierze sumę obu reprezentacji po ID. Formularz wizyty wybiera dokumenty po ID zamiast po nazwie; stare ID, również niedostępnych dokumentów, pozostają zachowane. Powiązania są w tym etapie dodawane, bez usuwania dawnych.

`uzgodnijRelacjeDokumentow` zapisuje sumę poprawnych relacji dla aktywnych dokumentów i wizyt. Pomija duplikaty, zachowuje nieznane powiązania i ID, nie dopasowuje nazw. Nie zapisuje ponownie niezmienionych rekordów. Operacja oraz zapis wizyty z uzgodnieniem są transakcyjne, korzystają z dotychczasowego outboxu i historii dokumentów/wizyt. Dostęp wymaga praw odczytu i edycji obu modułów. Dostępna jest również ręczna akcja uzgodnienia; nie zmieniono globalnego systemu relacji ani synchronizacji dokumentów.

Usunięcie źródłowego dokumentu nie usuwa wyniku. Widok pokazuje niedostępne źródło, zachowując ID. Można edytować wynik z niezmienionym niedostępnym źródłem; nowe przypisanie wymaga aktywnego, dostępnego źródła. Zapis wyników i metadanych dokumentu odrzuca nieaktualny formularz.

## Prywatność i uprawnienia

Wyniki są zawsze lokalne w tym etapie. `wynikiBadan` jest wyłączona z typów transportu i listy tabel SyncEngine. Kolejka pomija ją przy zapisie i odczycie. Silnik odrzuca pull lokalnej tabeli oraz rozstrzyganie jej konfliktów. Wyniki nie tworzą wpisów globalnej historii ani przypomnień; nowej tabeli nie dodano do źródeł Echo, wyszukiwania globalnego lub powiadomień.

Odczyt i zapis repozytorium wyników wymagają callbacku sprawdzającego istniejące uprawnienie `zdrowie`, sekcja `badania`; edycja wymaga także odczytu. Źródła w nowym widoku są odczytywane tylko przy uprawnieniu do odpowiedniego modułu. Dostęp do dokumentu źródłowego wymaga osobnego prawa do dokumentów. Dokumenty medyczne zachowują dotychczasową politykę synchronizacji dokumentów — lokalność wyniku nie nadaje lokalności źródłowemu dokumentowi. Lokalna baza nie jest szyfrowana tą zmianą.

## Backup

Istniejący BackupService w formacie 3 ma dodatkową sekcję `badania` / „Prywatne wyniki badań”, uwzględnianą domyślnie i w `before-restore`. Metadane medyczne są walidowane w dotychczasowej sekcji `dokumenty`. Kopie Dexie 17 nadal są obsługiwane; starsza kopia bez sekcji `badania` nie czyści wyników. AES-GCM i koperta pozostają bez zmian. ID źródeł i grup są zachowywane bez dopasowania nazw.

Pełne odtworzenie źródeł wymaga także sekcji Dokumenty oraz odpowiednich sekcji Wizyty, Zdrowie i Pozostałe dane. Selektywny backup samych wyników zachowuje identyfikatory, ale nie dołącza automatycznie dokumentów. Brakujące źródła są jawnie pokazywane jako niedostępne.

## Weryfikacja na Samsungu

1. Otwórz Zdrowie → Badania i dokumenty w orientacji pionowej. Sprawdź zakładki, brak poziomego przewijania i czytelność przy powiększeniu tekstu.
2. Otwórz filtr, dodawanie wyniku i dokumentu. Klawiatura powinna pojawić się dopiero po dotknięciu pola; sprawdź Wstecz i Anuluj.
3. Dodaj dokument ze zdjęciem/PDF, metadanymi i powiązaniem wizyty. Sprawdź podgląd, pobieranie oraz ten sam dokument w dotychczasowym module Dokumenty.
4. Dodaj `5,2`, `< 5`, `> 100`, `ujemny` i `nie wykryto`, także bez jednostki i zakresu. Sprawdź filtr, grupę z kilkoma parametrami, edycję, odświeżenie offline i usuwanie wyniku.
5. Wybierz właściwy dokument spośród dwóch identycznie nazwanych. Uzgodnij dawne relacje dwa razy; sprawdź sumę relacji w widoku wizyty. Usuń testowy dokument źródłowy i sprawdź zachowanie wyniku oraz komunikat o źródle.
6. W podglądzie Edytora sprawdź osobno brak uprawnień, tylko odczyt badań oraz brak prawa do dokumentów. Wyniki nie powinny pojawiać się w ogólnych powiadomieniach ani Echo.
7. Na danych testowych wykonaj szyfrowany backup z Badaniami, Dokumentami i powiązanymi sekcjami, następnie restore zgodnie z ochroną etapu 5.2. Sprawdź grupę, plik i relacje. Starsza kopia bez Badań powinna zachować aktualne wyniki.

Testy automatyczne i build webowy nie potwierdzają fizycznej klawiatury, natywnego podglądu PDF ani zapisu pliku na Samsungu. OCR, AI, diagnozy, interpretacja i wykresy nie są częścią tego etapu.

## Zmienione pliki i sprawdzenia

- Model: `src/domain/badania.ts`, `src/domain/typy.ts`.
- Dane i odczyt: `src/data/BazaOgarniacza.ts`, `src/data/Repozytorium.ts`, `src/data/KolejkaSynchronizacji.ts`, `src/data/DostawcaSynchronizacji.ts`, `src/hooks/useRepozytorium.ts`.
- Serwisy: `src/services/BadaniaService.ts`, `src/services/BadaniaService.test.ts`, `src/services/BackupService.ts`, `src/services/SyncEngine.ts`.
- Interfejs: `src/App.tsx`, `src/modules/zdrowie/BadaniaDokumenty.tsx`, `src/modules/zdrowie/BadaniaDokumenty.test.tsx`, `src/modules/zdrowie/WidokiZdrowia.tsx`.
- Dokumentacja: `docs/DATA.md`, `docs/BADANIA_DOKUMENTY.md`.

Celowany przebieg obejmował 158 testów w 8 plikach: BadaniaService, BackupService, SyncEngine, Repozytorium, BadaniaDokumenty, WidokiZdrowia, PsychoterapiaService i SamopoczucieService. Wszystkie przeszły. Końcowe uzupełnienie asercji praw odczytu i edycji sprawdzono ponownie w 20 testach nowych serwisu i widoku. Typecheck, build Vite/PWA oraz `git diff --check` przeszły. Lint zmienionych plików zgłosił jedynie wcześniejsze ostrzeżenie `react-hooks(exhaustive-deps)` dla efektu widoku leków (`otworz`). Nie wykonano pełnego audytu, testu fizycznego Samsunga ani publikacji.
