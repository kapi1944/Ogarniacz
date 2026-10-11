# Model danych i migracje

## Zmiany modelu
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
