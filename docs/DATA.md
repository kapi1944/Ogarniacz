# Model danych i migracje

## Zmiany modelu
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
