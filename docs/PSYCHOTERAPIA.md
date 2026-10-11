# Health 2.0 — etap 5: sesje psychoterapii

Widok działa w istniejącej trasie `Zdrowie → Dziennik terapii`. Sesją pozostaje `WpisTerapii`; rejestr terapii jest pod rozwijaną sekcją „Zarządzaj terapiami”. Nie powstały nowe tabele, indeksy ani format backupu. Opcjonalne pola nie wymagają migracji zapisującej dane; Dexie pozostaje w wersji 17. Starsze wpisy są widoczne w historii i zachowują ID, daty, samopoczucie, relacje i pola własne.

## Zapis i przygotowanie

- Krótka notatka jest dostępna od razu. Data domyślnie oznacza chwilę tworzenia; terapia, terapeuta i wizyta są opcjonalne. Brak wskazanej terapii jest reprezentowany przez pusty dotychczasowy `terapiaId`.
- Dotychczasowe pola: `tytul` — temat, `tresc` — notatka, `zalecenia` — ustalenia użytkownika, `obserwacje` — refleksje, `tematNastepnegoSpotkania` — pytania.
- Opcjonalne `psychoterapia` zawiera tematy, ważne wypowiedzi, ID kontaktu terapeuty oraz wybrane ID źródeł: dziennika samopoczucia, ustaleń i pytań wcześniejszych sesji, ćwiczeń oraz dokumentów. Treści źródeł nie są kopiowane. Ich aktualna treść jest rozwijana na żądanie, z odrębnym sprawdzeniem uprawnień.
- „Przygotuj się” / „Do omówienia” otwiera przygotowanie najbliższej zapisanej przyszłej sesji albo nowy szkic. Wybory nie są zaznaczane automatycznie. Samodzielna wizyta nie jest automatycznie uznawana za psychoterapię: użytkownik wskazuje ją w sesji.
- Usunięty wpis dziennika lub wcześniejsza sesja pozostawia referencję i komunikat o niedostępnym źródle. Usunięcie sesji jest soft-delete; nie kasuje źródeł ani zadań.
- Ustalenia są zapisem użytkownika, bez diagnoz i bez potwierdzania medycznej poprawności.

## Ćwiczenia i uprawnienia

Ćwiczenie jest zwykłym `Zadanie` tworzonym przez istniejący konstruktor `utworzZadanie`, z opcjonalnym `sesjaTerapiiId`. Ma tytuł, opis i opcjonalny termin. Tworzenie wymaga osobnego zatwierdzenia. Formularz zachowuje UUID operacji; zadanie ma ID `cwiczenie:<UUID>`. Transakcja sprawdza istniejące zadanie, również usunięte, przed utworzeniem. Ponowienie tej samej operacji nie tworzy kolejnego zadania, a różne operacje mogą mieć ten sam tytuł. Zamknięcie formularza i otwarcie nowego oznacza nową operację.

Sesje wykorzystują istniejące `moze('zdrowie', operacja, 'psychoterapia')`. Dziennik wymaga osobno sekcji `samopoczucie`; ćwiczenia wymagają również uprawnienia do Zadań. Kontakt, dokument i wizyta wymagają odczytu odpowiedniego modułu. Zapis ponownie sprawdza uprawnienia i aktualność rekordu w transakcji. Edycja nie usuwa istniejących, niedostępnych referencji.

## Granica prywatności

Obecność `WpisTerapii.psychoterapia` chroni cały rekord sesji, a `Zadanie.sesjaTerapiiId` — całe ćwiczenie. Repozytorium domyślnie pomija takie rekordy i odrzuca ich modyfikację; dedykowane widoki przekazują aktualny kontroler uprawnień do odczytu/edycji. Zapis nie pozwala usunąć znacznika ochrony. Echo nie zostało zmienione i korzysta z domyślnego repozytorium, więc nie otrzymuje tych sesji ani zadań. To kontrola dostępu aplikacji, nie szyfrowanie ani uwierzytelnienie.

Istniejący outbox pomija całe chronione rekordy, usuwa oczekujący zapis podczas objęcia wpisu ochroną, a odczyt kolejki sprawdza również bieżący lokalny rekord. Obejmuje to inicjalne uzupełnienie kolejki i dane odtworzone z backupu. `SyncEngine` pomija chronione rekordy z transportu oraz zdalne aktualizacje/usunięcia rekordów chronionych lokalnie, również przy ostatecznym zapisie pull. Rozstrzygnięcie konfliktu nie może zastąpić prywatnego rekordu. Prywatne ćwiczenia nie tworzą wpisów ogólnej historii zmian; domyślne repozytorium nie udostępnia ich Pulpitowi, planerowi, przypomnieniom ani globalnemu wyszukiwaniu.

Historyczne wpisy bez `psychoterapia` zachowują dotychczasową politykę synchronizacji i odczytu. Edycja przez nowy formularz obejmuje cały wpis ochroną od tego momentu. Nie usuwa danych, które wcześniej wysłano na serwer, ani nie odwołuje już rozpoczętej transmisji starego rekordu. Opisy samych terapii, kontaktów, wizyt i dokumentów zachowują własną politykę; prywatne treści sesji nie są do nich kopiowane.

BackupService zachowuje format 3 i istniejące sekcje `zdrowie`, `samopoczucie`, `zadania` oraz `dokumenty`. Nowe pola mają walidatory, a pełny eksport i kopia `before-restore` zawierają prywatne dane. Do odtworzenia wszystkich źródeł potrzebne są ich odpowiednie sekcje. Baza i backup nie są szyfrowane.

## Zmienione pliki

- `src/domain/typy.ts`, `src/domain/psychoterapia.ts`
- `src/data/Repozytorium.ts`, `src/data/KolejkaSynchronizacji.ts`, `src/hooks/useRepozytorium.ts`
- `src/services/PsychoterapiaService.ts`, `src/services/PsychoterapiaService.test.ts`
- `src/services/SyncEngine.ts`, `src/services/HistoriaZmianService.ts`
- `src/services/BackupService.ts`, `src/services/BackupService.test.ts`
- `src/modules/zdrowie/SesjePsychoterapii.tsx`, `src/modules/zdrowie/SesjePsychoterapii.test.tsx`, `src/modules/zdrowie/psychoterapia.css`, `src/modules/zdrowie/WidokiZdrowia.tsx`
- `src/modules/praca/WidokiPracy.tsx`, `src/modules/praca/RejestrZadan.test.tsx`
- `docs/PSYCHOTERAPIA.md`, `docs/DATA.md`

## Samsung — odbiór ręczny

Weryfikacja lokalna: typecheck, 136 testów w 11 celowanych plikach (serwis/UI psychoterapii, dziennik samopoczucia, Zadania, backup, SyncEngine, repozytorium, historia zmian, uprawnienia i migracje) oraz build webowy Vite. Przeglądarka przy szerokości 390 px: zapis samej notatki bez terapeuty i wizyty, brak autofocus/fokusu w polu po otwarciu, zatwierdzone ćwiczenie, wykonanie przez Zadania i aktualny stan „Wykonane” po powrocie do sesji.

1. Otwórz „Nowa sesja”: klawiatura nie powinna pojawić się przed dotknięciem pola. Zapisz samą notatkę bez terapeuty i wizyty.
2. Rozwiń sekcje, edytuj sesję, sprawdź przewijanie, jasny/ciemny motyw i systemowy Wstecz.
3. Oznacz obserwację „Do omówienia”, wybierz ją w przygotowaniu, usuń źródło i sprawdź komunikat przy zachowanej sesji.
4. Utwórz ćwiczenie po zatwierdzeniu; wykonaj je w Zadaniach i sprawdź aktualizację statusu w sesji. Dwa nowe ćwiczenia o tej samej nazwie powinny pozostać odrębne.
5. Sprawdź Edytora z odczytem i bez edycji oraz osobne ograniczenia dziennika i Zadań. Sprawdź brak nowych prywatnych treści na Pulpicie i w Echo.
6. Na danych testowych wyeksportuj pełny backup, odtwórz go, sprawdź ID i źródła. Powtórz zapis offline i po ponownym uruchomieniu aplikacji.

Nie wdrożono audio, transkrypcji, AI ani diagnoz. ID sesji pozwala w przyszłości powiązać materiały bez kolejnej encji sesji. Testy lokalne i przeglądarka nie potwierdzają działania fizycznego telefonu, APK ani serwera produkcyjnego.
