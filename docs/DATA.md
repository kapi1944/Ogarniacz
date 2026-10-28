# Model danych i migracje

## Luxury — zgodność personalizacji

Normalizator personalizacji odczytuje dawny identyfikator `premium` jako `luxury`,
bez resetowania palety, animacji, komponentów ani zapisanych motywów.
Opcjonalne w starszych rekordach pole `kolorPaskowPrzewijania` przyjmuje
`zloty` (domyślnie) lub `szmaragdowy`. Zapis i eksport utrwalają nową nazwę
w obecnym rekordzie ustawień; import i odczyt synchronizacji korzystają
z tego samego normalizatora. Nie zmienia się schemat bazy ani format transportu.

## Reset hasła przez e-mail

SQLite 7 → 8 dodaje tabelę hashy tokenów, indeks konta i trigger unieważniania
linków przy zmianie hasła, e-maila lub statusu. Zachowuje UUID i dotychczasowe
dane. [Szczegóły i konfiguracja](ODZYSKIWANIE_HASLA_EMAIL.md).

## Konta — uzupełnienie etapów 1–3

Migracja SQLite 6 → 7 dodaje wyłącznie nullable `kody_odzyskiwania.wygasa_at`.
Istniejące kody zachowują hashe, daty i wcześniejszą ważność (`NULL`).
Nowy jednorazowy reset administracyjny zapisuje termin ważności na godzinę.
Migracje 1–6 pozostają bez zmian. Nie zmieniono UUID, relacji, grantów,
rekordów synchronizacji ani schematu IndexedDB.

## Konta użytkowników — etap 2

Migracja SQLite 5 → 6 rozszerza tylko sesje o niezależne, losowe publiczne `id` (16 bajtów, indeks unikalny). Zachowuje tokeny, hashe, terminy i powiązania aktywnych sesji; starsze sesje otrzymują ID w transakcji. Trigger nadaje ID także zapisom używającym dawnych kolumn. Ponowienie migracji nie zmienia ID.

Trigger zmiany statusu konta na `nieaktywne` lub `zarchiwizowane` usuwa sesje tego użytkownika oraz sesje dostępu do niego jako Właściciela. Migracja usuwa również takie sesje istniejące przed jej uruchomieniem. Reaktywacja nie przywraca usuniętych sesji. Każde uwierzytelnienie dodatkowo sprawdza aktywność użytkownika i Właściciela. Logowanie, odzyskiwanie i przyjmowanie zaproszeń nie omijają statusu konta.

Zmiana własnego hasła wymaga aktualnego hasła i CSRF; aktualizacja hasha, wyzerowanie znacznika wymaganej zmiany i unieważnienie pozostałych sesji są atomowe. Bieżąca sesja zostaje aktywna. Dane domenowe, IndexedDB i protokół synchronizacji pozostają bez zmian.

## Konta użytkowników — etap 1

Migracja SQLite 4 → 5 rozszerza wyłącznie `uzytkownicy`: `login`, `nazwa`, `rola_systemowa`, `status_konta`, `wymagana_zmiana_hasla`. Działa w istniejącej transakcji migracyjnej, bez przebudowy tabeli i bez usuwania rekordów. Zachowuje UUID, e-maile, hashe, daty, członkostwa, granty, sesje i powiązania. Wykonana wersja nie jest uruchamiana ponownie; błąd wycofuje cały etap.

Dotychczasowe konta otrzymują `login = NULL`, `nazwa = NULL`, `rola_systemowa = uzytkownik`, `status_konta = aktywne`, `wymagana_zmiana_hasla = 0`. Login jest opcjonalny i unikalny (indeks `NOCASE`); zapis dopuszcza 1–254 małych znaków ASCII: litery, cyfry, kropkę, podkreślenie i myślnik, bez spacji. Nie generujemy loginów ani e-maili. Logowanie nadal używa e-maila i obecnego hasła.

Role systemowe `administrator` / `uzytkownik` są niezależne od członkostw `wlasciciel` / `edytor`. Nie nadają dostępu do danych innych właścicieli ani nie omijają grantów. Istniejące odpowiedzi konta zawierają dodatkowe metadane, bez hashy. Opcjonalność nowych pól w typie klienta zachowuje obsługę starszego backendu i zapamiętanej sesji offline.

Migracja nie awansuje istniejących kont, nawet jedynego Właściciela. **W istniejącej instalacji pierwszego administratora należy wskazać decyzją użytkownika w osobnym kroku; etap 1 nie wykonuje takiego przypisania.** Jedynie obecny bootstrap zabezpieczony tokenem tworzy administratora, jeśli tabela użytkowników jest całkowicie pusta. Przy istniejącej tożsamości tworzy zwykłego użytkownika, bez awansu innych kont.

Statusy `aktywne` / `nieaktywne` / `zarchiwizowane` i znacznik zmiany hasła są w tym etapie metadanymi. Egzekwowanie dezaktywacji, zmiana haseł i zarządzanie sesjami należą do etapu 2. Nie zmieniono IndexedDB, synchronizacji, sesji ani interfejsu zarządzania użytkownikami. Kontrola migracji odbywa się na syntetycznym schemacie v4, bez dostępu do produkcji. Etap 2 może korzystać z wcześniejszego raportu i tych kontraktów bez kolejnego pełnego audytu.

## Zmiany modelu
F7.4: schemat Dexie pozostaje w wersji 20, SQLite bez migracji. Pięć tabel F7 trafia do istniejącej kolejki i rekordów synchronizacji dopiero po negocjacji możliwości backendu. Stan profilu ma opcjonalne `finanseWspolneZmigrowane`, `ograniczenieFinansowWspolnych` i `finanseWspolneNiekompletne`; brak znacznika uruchamia transakcyjne przygotowanie wszystkich lokalnych danych F7, również starszych i usuniętych. Przywrócenie sekcji finansowych unieważnia przygotowanie. Opcjonalna rewizja `rozstrzygniecie` przechowuje oba pełne warianty i wybór; zwykłe rewizje F7.3 zachowują format. Starsze klienty nie otrzymują nowych tabel; przed produkcyjną wysyłką trzeba wdrożyć zgodny backend. [Kontrakt i kolejność aktualizacji](FINANSE_KASY_I_ROZLICZENIA.md#zrealizowany-zakres-f74--synchronizacja-i-ochrona-danych).
F7.2A: Dexie 19 → 20 dodaje pięć lokalnych tabel wspólnych kas i rozliczeń. Backup formatu 3 zawiera osobne sekcje `wspolneKasy` i `rozliczenia`; starsze kopie nie zmieniają tych tabel. Kwoty nowych encji są bezpiecznymi liczbami całkowitymi najmniejszych jednostek waluty. F7.2A początkowo pozostawiał te tabele lokalne; F7.3 dodał chronione serwisy, a F7.4 chronioną synchronizację. Ogólny zapis CRUD pozostaje zablokowany.
Health 2.0, etap 7: [Oś czasu i ważne informacje](HISTORIA_ZDROWIA.md). Dexie 18 → 19 dodaje lokalną tabelę `wazneInformacjeZdrowotne`. Historia jest projekcją istniejących danych, bez dodatkowej tabeli wydarzeń. Backup w formacie 3 uwzględnia nową sekcję; starsze kopie bez niej zachowują bieżące ważne informacje.
Health 2.0, etap 6: [Badania i dokumenty](BADANIA_DOKUMENTY.md). Dexie 17 → 18 dodaje lokalną tabelę `wynikiBadan`; `Dokument.medyczne` rozszerza istniejące dokumenty. Relacje dokument–wizyta zachowują sumę dawnych reprezentacji po ID. Backup w formacie 3 zawiera osobną sekcję `badania`; starsze kopie jej nie czyszczą.
Health 2.0, etap 5: [Sesje psychoterapii](PSYCHOTERAPIA.md). Opcjonalne `WpisTerapii.psychoterapia` i `Zadanie.sesjaTerapiiId` rozszerzają istniejące rekordy bez nowych tabel/indeksów i bez podniesienia wersji Dexie. Chronią całe sesje i ćwiczenia jako lokalne; backup pozostaje w formacie 3. Starsze wpisy zachowują dane i dotychczasową politykę do czasu edycji w nowym formularzu.

Szczegóły migracji Dexie 16 → 17 i prywatnego modelu dziennika Health 2.0: [Dziennik samopoczucia](DZIENNIK_SAMOPOCZUCIA.md). Nowa lokalna tabela przechowuje pełne chwile obserwacji i historyczne definicje skal; wcześniejsze rekordy pozostają zachowane. Backup zachowuje format 3, z dodatkową sekcją `samopoczucie`.

- Model danych można zmieniać.
- Każda zmiana wymaga migracji i zachowania kompatybilności danych użytkownika.
- Stare pola i fallbacki utrzymujemy tylko wtedy, gdy istnieją realne dane, które ich wymagają. W przeciwnym razie usuwamy.
- Przy każdej migracji: backup, wersjonowanie, test na realnym stanie danych.

## Zasady
- Nie usuwaj ani nie nadpisuj danych użytkownika podczas aktualizacji.
- Nie wykonuj destrukcyjnych operacji „żeby naprawić” problem.
- Przy operacjach ryzykownych — backup przed, weryfikacja po.

## Dziennik dawek — Health 2.0, etap 2A

`zapiszStatusDawkiZApteczka` zapisuje dziennik, ruchy apteczki i istniejącą kolejkę synchronizacji atomowo. Ponownie odczytuje lek, harmonogram i dziennik; zachowuje ID dopasowanego wpisu historycznego. `zapiszStatusDawki` pozostaje wyłącznie konstruktorem wpisu dla starszych odbiorców. Integracja Echo jest poza etapem 2A.

Nowe opcjonalne pola dziennika: `idWystapienia` (wiązanie starszego ID bez zmiany identyfikatora wystąpienia), `przyjetoAt`, `przyjetaIlosc`, `przyjetaJednostka`, `nierozliczonaIlosc`, `rozbieznoscApteczki`. Czas planowany pozostaje w `data` i `planowanaGodzina`, czas zapisu/edycji w `updatedAt` i dotychczasowym `reakcjaAt`. Adaptacja starych danych przy odczycie jest niedestrukcyjna: brak nowych pól oznacza brak informacji, a `reakcjaAt` nigdy nie wyznacza czasu przyjęcia. Nie zmieniamy tabel ani indeksów Dexie; nie ma migracji zapisującej domniemane dane. Backup zachowuje opcjonalne pola przez istniejący schemat `passthrough`.

Przy niedoborze wymagane jest jawne `potwierdzRozbieznosc`. Zużywa się tylko dostępny zapas, a reszta pozostaje w dzienniku w jednostce przyjęcia. Brak ilości, brak ewidencji zapasu lub odmienna jednostka również wymagają potwierdzenia; bez przelicznika nie zużywamy zapasu w innej jednostce. Powtórzenie potwierdzenia zachowuje rozliczenie, cofnięcie zwraca tylko faktycznie rozliczoną ilość, a ponowne przyjęcie ponownie sprawdza bilans. Niedobór nie jest automatycznie rozliczany po późniejszym dodaniu zapasu. Nie tworzymy dostawy ani ujemnego stanu.

## Wersje dawkowania — Health 2.0, etap 3A

`Lek.historiaDawkowania` zawiera uporządkowane, niezmienne wersje: ID, pełny czas `obowiazujeOd`, `zapisanoAt`, konfigurację z istniejącymi `DawkaLeku` i opcjonalną notatkę. `zapiszLekZDodanymZapasem` dopisuje wersję w transakcji z istniejącym outboxem, sprawdza historię odczytaną z bazy i odrzuca nieaktualny formularz. Zmiany istniejącego leku obowiązują teraz lub w przyszłości, po ostatniej wersji; edycja przeszłości i zastępowanie zaplanowanych wersji nie są obsługiwane. Pola dawkowania na głównym rekordzie pozostają projekcją ostatniej zapisanej wersji dla starszych konsumentów, a generator wybiera wersję według pełnej chwili wystąpienia, z końcem wyłącznym równym początkowi następnej wersji.

Pierwsza wersja zachowuje dotychczasowe ID wystąpień. Dopiero nowe wystąpienia kolejnych wersji dostają przyrostek z ID wersji, dzięki czemu jedna definicja może wystąpić dwukrotnie po zmianie w środku dnia. ID definicji, istniejących wystąpień, wpisów i ruchów apteczki pozostają bez zmian. Wersje interwałowe zapisują stały `poczatekInterwalu`; odstęp jest rzeczywistym upływem czasu, a granice dnia lokalnymi północami. Pełny `planowanyCzas` rozróżnia powtórzone godziny jesienią; konkretna godzina nieistniejąca wiosną nie jest przesuwana na inną godzinę. Formularz początku wersji wymaga wyboru wystąpienia powtórzonej godziny, a nieistniejącą godzinę początku odrzuca.

Nowy dziennik zapisuje `wersjaDawkowaniaId`, kopię `planowanaDawka`, `planowanaJednostka` i `planowanyCzas`, osobno od faktycznego przyjęcia i czasu edycji. Zmiana schematu nie przepisuje dziennika ani ruchów apteczki. `jednostkaZapasu` utrzymuje jednostkę dotychczasowego bilansu niezależnie od późniejszych jednostek dawkowania; różnica korzysta z jawnej rozbieżności z etapu 2A, bez zgadywania przelicznika. Wartość null oznacza jawnie nieznaną jednostkę starszego bilansu.

Adaptacja starych danych jest niedestrukcyjna: lek bez historii nadal używa starego kontraktu. Przy pierwszej zmianie chwytamy wcześniejszą konfigurację z `poczatekNieznany`, znaną dopiero od chwili uchwycenia, i dopisujemy nową wersję. Nie rekonstruujemy nieznanych wcześniejszych planów; zachowane wpisy historyczne bez kopii dawki lub wersji pokazują te parametry jako nieznane. Nie przypisujemy im wersji automatycznie ani nie uznajemy `reakcjaAt` za czas przyjęcia.

Nie zmieniamy tabel, indeksów ani wersji Dexie. Nowe opcjonalne pola przechodzą przez dotychczasowy eksport/przywracanie (z walidacją struktury i kolejności wersji) oraz pełny rekord w istniejącej kolejce synchronizacji. Starsze backupy pozostają wspierane.

## Przypomnienia dawek — Health 2.0, etap 3B

Opcjonalne `Przypomnienie.dawkaLeku` wiąże przypomnienie z lekiem, definicją dawki, ID wystąpienia, lokalną datą, pełnym planowanym czasem, wersją schematu i stanem dziennika. Jest projekcją generatora 3A, a nie niezależnym harmonogramem. ID przypomnienia to `dawka:<idWystapienia>`. Starsze przypomnienia bez powiązania zachowują dotychczasowe działanie; nie dopisujemy im domniemanych dawek. Brak zmian tabel/indeksów oznacza brak migracji zapisującej dane; dotychczasowy `passthrough` backupu zachowuje nowe opcjonalne pole.

Uzgodnienie odczytuje leki, dziennik i przypomnienia oraz zapisuje zmienione przypomnienia i outbox w jednej transakcji. Nieaktualne alarmy otrzymują stan przypomnienia `pominiete` i znacznik `nieaktualne`; ich rekordy oraz dziennik pozostają. Stan przypomnienia nie jest decyzją o przyjęciu. `wersjaStanu` jest warunkiem zgodności statusu, czasu aktualizacji dziennika, wersji schematu, planowanego czasu i odroczenia. Nie zmienia kontraktu wersjonowania 3A. Akcja alarmu korzysta z istniejącego `zapiszStatusDawkiZApteczka` z opcjonalnym warunkiem aktualności sprawdzanym w tej samej transakcji co zapis dawki i zapasu. Echo pozostaje bez zmian.
