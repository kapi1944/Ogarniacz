# Testy i release

## Strategia
- Testy proporcjonalne do ryzyka.
- Mały patch → testy lokalne.
- Zmiana przekrojowa, integracja, synchronizacja, OTA, signing → testy regresyjne przed release.

## Zasady
- Nie omijaj testów przez `.skip` ani tymczasowe wyłączenia.
- Nie publikuj release po niewyjaśnionej regresji.
- Każda zmiana modelu danych → test migracji na realnym stanie.
- Każda zmiana w module wrażliwym (Echo, sync, OTA, konta, signing, backup) → dodatkowy test regresyjny.

## Przed release
- Testy przechodzą.
- Brak niewyjaśnionych regresji.
- `versionCode` nieobniżony.
- Migracje działają.
- Brak nowych sekretów w repo.
- Zmiany w API/danych użytkownika udokumentowane.
