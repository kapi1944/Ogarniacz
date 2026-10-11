# Health 2.0 — etap 7: osobista oś czasu i ważne informacje

Etap bazuje na ukończonym etapie 6 (`4c803d8`). Zdrowie zawiera odnośniki do `/zdrowie/historia` i `/zdrowie/wazne-informacje`. Nie zmieniono globalnej nawigacji, uwierzytelniania ani mechanizmów blokady telefonu.

## Projekcja historii

`HistoriaZdrowiaService` odczytuje istniejące repozytoria zgodnie z prawami do źródeł. Wylicza `ZdarzenieZdrowia` z leków, niezmiennych wersji dawkowania, potwierdzonych przyjęć, wizyt, terapii, sesji, samopoczucia, wyników, dokumentów medycznych, skierowań i recept. Ręcznie wybrane ważne informacje są osobnymi adnotacjami użytkownika. Oś kluczowych wydarzeń filtruje tę samą projekcję do adnotacji; karta korzysta z tych samych rekordów. Nie ma tabeli wydarzeń, kopiowania oryginalnych treści ani drugiej listy leków.

Zdarzenie ma rodzaj, kategorię, datę z dokładnością, opcjonalną znaną godzinę i pełną chwilę, krótki opis, dostępność i stabilne odniesienie `{tabela, id, szczegolId?}`. Wersja dawkowania zachowuje własne ID. Przyjęcia deduplikujemy według istniejącego `idWystapienia`, a dla starszych rekordów według ID rekordu, nigdy samej godziny. Dwa różne przyjęcia o tej samej godzinie pozostają odrębne. Kolejne statusy jednego wystąpienia dają tylko aktualne potwierdzenie. Nie pokazujemy technicznej wersji dawkowania z nieznanym historycznym początkiem jako udokumentowanego rozpoczęcia leczenia.

Daty zachowują dokładność dzień / przybliżony miesiąc / przybliżony rok / okres / nieznana. Nie podstawiamy `createdAt`, `updatedAt`, czasu reakcji ani planowanej godziny za nieznany czas wydarzenia lub przyjęcia. Pełne chwile z offsetem są prezentowane w wybranej strefie IANA; przy tym samym dniu porządek wyznacza czas absolutny, także podczas powtórzenia godziny jesienią. Lokalne godziny wizyt bez strefy tworzą osobną grupę, a wpisy z samą datą następną. Brak czasu nie oznacza północy. Przybliżone daty są wyraźnie oznaczone; filtr okresu uwzględnia nakładanie, bez nadawania im dokładnego dnia.

Widok dzienny, miesięczny i roczny grupuje zdarzenia; dostępne są filtry kategorii i rodzaju, okres oraz wyszukiwanie wyłącznie bezpiecznych podsumowań. Otwieranie źródła jest odrębną akcją i ponownie sprawdza dostęp. Brakujące lub miękko usunięte źródło pozostawia odniesienie oraz czytelny komunikat.

## Model i świadomy wybór

`WaznaInformacjaZdrowotna` zawiera stabilne ID i standardowe metadane z miękkim usunięciem, kategorię, własną treść, datę z dokładnością, opcjonalne źródło, status potwierdzenia, ostatni przegląd, opcjonalny okres obowiązywania, `ukryjTresc` oraz opcjonalne ID wybranych kontaktów. Kategorie obejmują diagnozę wpisaną przez użytkownika, hospitalizację, zabieg, alergię, poważną reakcję na lek, rozpoczęcie lub zmianę leczenia, wydarzenie, plan wsparcia i inne.

„Dodaj jako ważne” otwiera dopiero szkic: odniesienie i znana data, pusta własna treść, kategoria Inne, status Do weryfikacji, treść ukryta. Zapis wymaga świadomej czynności. Użytkownik sam wybiera kategorię, treść i potwierdzenie; obserwacja ani wynik nie stają się automatycznie diagnozą. Potwierdzenie przez użytkownika nie jest weryfikacją medyczną. Nieaktualny formularz jest odrzucany. Nowe powiązanie wymaga dostępnego źródła; wcześniejsze, obecnie niedostępne odniesienie można zachować przy edycji.

Dexie 18 → 19 dodaje tylko tabelę `wazneInformacjeZdrowotne` i indeksy `id, kategoria, updatedAt, usunietoAt`. Nie przepisuje wcześniejszych danych. Walidacja serwisu i repozytorium chroni daty, strukturę, relacje oraz prawa zapisu.

## Karta i prywatność

Szybki odczyt ma duże litery, logiczne sekcje i lokalne przełączniki. Pokazuje ważne informacje, reakcje, bieżące aktywne leki, choroby i wydarzenia, hospitalizacje, wybrane kontakty i opcjonalny plan wsparcia. Leki pochodzą z bieżącej wersji kanonicznego schematu: przyszłe zmiany nie zastępują jeszcze obowiązującego dawkowania. Pomijane są leki nieaktywne, usunięte, jeszcze nierozpoczęte i zakończone. Kontakty są odczytywane po ID z istniejących rekordów, bez prywatnych notatek. Karta pokazuje czas przygotowania, przegląd informacji i status weryfikacji; pomija informacje poza okresem obowiązywania.

Domyślnie nie ujawniamy treści samopoczucia, prywatnych notatek, tytułów sesji ani wypowiedzi psychoterapeutycznych. Są dostępne dopiero przez „Świadomie otwórz szczegóły”. Treść nowej ważnej informacji jest domyślnie ukryta; użytkownik może świadomie wyłączyć ukrycie w jej formularzu. Wyszukiwarka nie indeksuje ukrytych treści.

Nowa tabela jest lokalna: wyłączona z typów transportu, zapisu i odczytu outboxu, pull oraz konfliktów istniejącego SyncEngine. Nie tworzy wpisów globalnej historii, powiadomień, danych Echo, widgetów ani ekranu blokady. Nie dodano nowego silnika synchronizacji. Źródła zachowują własną dotychczasową politykę synchronizacji.

Repozytorium wymaga callbacku praw `zdrowie`, sekcja `wazne_informacje`; edycja wymaga również odczytu. Każde źródło zachowuje własne uprawnienia: leki, wizyty, dokumenty, badania, samopoczucie, psychoterapia i kontakty. Ochrona aplikacji i istniejące trasy pozostają obowiązujące. Lokalność nie oznacza szyfrowania bazy. Karta nie jest gwarantowanym źródłem danych dla ratowników.

## Świadomy eksport i backup

Eksport wymaga wyboru sekcji i otwarcia podglądu. Plan wsparcia nie jest domyślnie wybrany. Zmiana wyboru unieważnia podgląd. Przed generowaniem ponownie odczytujemy dane i prawa; zmiana danych wymaga nowego podglądu. Zamknięcie panelu podczas przygotowania blokuje późniejszy zapis. Ukryte treści i informacje z niedostępnym źródłem są pomijane. Nie eksportujemy pełnych dzienników, notatek sesji, transkrypcji ani plików źródłowych.

Zapis korzysta z istniejącej usługi plików: samodzielny jawny HTML z lokalnym CSS, neutralizacją kodu w treści i zakazem skryptów oraz zewnętrznych zasobów. Druk korzysta z systemowego okna przeglądarki po świadomym kliknięciu. Tam, gdzie WebView nie udostępnia druku, można zapisać HTML i wydrukować go w przeglądarce, także do PDF. Nie dodano natywnego mechanizmu druku ani automatycznego wysyłania do usług zewnętrznych.

BackupService zachowuje format 3 i istniejącą kopertę AES-GCM. Nowa sekcja „Prywatne ważne informacje zdrowotne” jest w standardowej kopii i kopii ochronnej `before-restore`. Kopie starszych wersji, także Dexie 18, pozostają obsługiwane; brak nowej sekcji nie czyści jej bieżących rekordów. Selektywna kopia zachowuje ID źródeł i kontaktów, ale do ich odtworzenia trzeba wybrać również odpowiednie istniejące sekcje.

## Sprawdzenia i granice dowodu

Celowana regresja: 175 testów w 10 plikach (HistoriaZdrowiaService, HistoriaZdrowia UI, BadaniaService, BadaniaDokumenty, WidokiZdrowia, BackupService, SyncEngine, Repozytorium, PsychoterapiaService, SamopoczucieService) — PASS. Po dodaniu ochrony anulowania eksportu powtórzono wszystkie 6 testów nowego UI — PASS. Łącznie 176 różnych testów. Typecheck, build Vite/PWA, dotychczasowy smoke PWA i `git diff --check` przeszły. Nowy moduł osi czasu jest w precache service workera. Smoke sprawdza routing, manifest i reguły cache; nie symuluje restartu urządzenia offline. Lint zmienionych plików zgłosił tylko wcześniejsze ostrzeżenie efektu leków dotyczące `otworz`.

Testy obejmują sortowanie i zmianę czasu, wiele źródeł jednego dnia i dwie dawki o jednej godzinie, przybliżoną datę i nakładanie okresów, brak i usunięcie źródła, filtry, prawa, bieżące leki, brak ujawnienia terapii, sekcje i anulowanie eksportu, lokalny odczyt przy `navigator.onLine=false`, ochronę wysyłki/pull/konfliktów, migrację rzeczywistej bazy IndexedDB 18 → 19 oraz szyfrowany eksport/przywracanie relacji i zgodność starej kopii.

W przeglądarce na osobnym pustym originie sprawdzono kartę, formularz bez autofocus, bramkę podglądu, przełącznik widoków i tryb roczny przy szerokości 360 px. Brak poziomego przewijania. To nie jest dowód działania fizycznej klawiatury Samsunga, natywnego zapisu/drukowania ani ponownego uruchomienia zainstalowanej PWA bez sieci.

Po korekcie historycznej bazy testowej etapu 6 (schemat 17 nie zawiera również nowej tabeli etapu 7) oraz końcowej korekcie typowania testu powtórzono BadaniaService i nowe UI: 23/23 — PASS. Końcowy typecheck również przeszedł.

## Checklista Samsunga — do wykonania na urządzeniu

1. Zdrowie → Osobista oś czasu / Ważne informacje: pionowo, poziomo i z większym tekstem; przełączanie, Wstecz, dotykowe przyciski, brak poziomego przewijania. Formularz ma otwierać klawiaturę dopiero po dotknięciu pola.
2. Kilka wydarzeń jednego dnia, wpis bez godziny, rok przybliżony i okres; filtry dzienny/miesięczny/roczny, kategorie, wyszukiwanie. Sprawdź powtórzoną godzinę jesienią i prezentację Warszawa/UTC bez zmiany danych źródła.
3. Sesja i samopoczucie: brak pełnych treści przed świadomym otwarciem. Wybranie jako ważne nie zapisuje diagnozy; sprawdź ręczną treść, potwierdzenie, przegląd i ukrycie. Usuń testowe źródło i sprawdź komunikat oraz zachowane odniesienie.
4. Bieżący, przyszły i zakończony schemat leku; karta ma używać bieżącego aktywnego dawkowania. Sprawdź wybrane kontakty i opcjonalny plan wsparcia. W podglądzie Edytora zweryfikuj osobno brak praw, tylko odczyt i brak prawa do źródła.
5. Po załadowaniu widoków włącz tryb samolotowy, zamknij i ponownie uruchom aplikację/PWA. Oba widoki i źródła zapisane lokalnie powinny działać. Karta nie powinna pojawiać się na ekranie blokady ani omijać logowania.
6. Wybierz tylko reakcje i leki, otwórz podgląd, zmień wybór i sprawdź konieczność ponownego podglądu. Zapisz HTML; sprawdź plik oraz druk / Zapisz jako PDF w przeglądarce. Ukryty plan, prywatne notatki i niedostępne źródła muszą być nieobecne. Anuluj przygotowanie i sprawdź brak późniejszego zapisu.
7. Na danych testowych wykonaj szyfrowany backup z nową sekcją i sekcjami źródeł; przywróć przez istniejący podgląd oraz szyfrowaną kopię ochronną. Sprawdź treść, status, przegląd, ID źródła i kontakty. Starsza kopia bez nowej sekcji powinna zachować bieżące ważne informacje.

Bez push, release, deploy i zmian Android versionCode. Nie wykonywano pełnego audytu repo ani prób na fizycznym Samsungu.
