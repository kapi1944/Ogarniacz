# Konta i profile

## Etap 3 — konta

Role systemowe są niezależne od członkostw i grantów. Administrator widzi
metadane kont, ale nie otrzymuje prawa odczytu cudzych rekordów.
Tworzenie konta zakłada własne członkostwo Właściciela, bez cudzych grantów.
Hasło początkowe i reset administracyjny wymagają zmiany hasła.
Do tego czasu backend blokuje dane, synchronizację i operacje administracyjne.
Reset unieważnia sesje oraz stare kody odzyskiwania. Blokada i archiwizacja
zachowują dane; reaktywacja wymaga ponownego logowania.

API pod istniejącą ochroną sesji i CSRF:
- GET /api/account/users — metadane kont;
- POST /api/account/users — konto z hasłem tymczasowym;
- PUT /api/account/users — metadane, rola, aktywacja, blokada lub archiwizacja;
- POST /api/account/users/password — reset hasła.

Nie można odebrać roli ani aktywności ostatniemu aktywnemu administratorowi.
Logowanie przyjmuje e-mail lub unikalny login. Stare logowanie e-mailem pozostaje.

## Pierwszy administrator istniejącej instalacji

Procedura do wykonania przez operatora dopiero podczas osobnego wdrożenia:
1. Utwórz i sprawdź spójną kopię SQLite (łącznie z WAL przez SQLite backup).
2. Wdróż build backendu, uruchom jego istniejące migracje i zatrzymaj usługę.
3. Ustal jawnie UUID właściwego istniejącego aktywnego konta.
4. Uruchom lokalnie w katalogu instalacji:
   `node dist-server/pierwszy-administrator.js /pełna/ścieżka/bazy.sqlite UUID --potwierdz`
5. Uruchom usługę i zaloguj wskazane konto ponownie.

Polecenie nie tworzy ani nie migruje bazy. Odmawia, jeśli jakikolwiek
administrator już istnieje albo konto nie istnieje lub jest nieaktywne.
Operacja jest atomowa i unieważnia sesje wskazanego konta. Nie zmienia UUID,
hashy, członkostw, grantów ani rekordów synchronizacji.
Nie wybiera konta automatycznie i nie udostępnia endpointu bootstrapu awansu.
