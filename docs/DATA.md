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
