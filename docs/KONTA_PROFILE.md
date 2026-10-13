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

## Etap 4 — rejestr i bazy

Rejestr IndexedDB `ogarniacz-profile` przechowuje tożsamość serwera,
użytkownika i Właściciela. Każdy profil ma osobną bazę
`ogarniacz-profil-UUID` z pełnym dotychczasowym schematem, także kolejką,
konfliktami, kursorami, ustawieniami, Echo i prywatnymi tabelami.
Nie używa installationId jako tożsamości. Wybór w localStorage nie otwiera bazy.
Zamknięcie kontekstu anuluje jego sygnał i blokuje automatyczne ponowne otwarcie.
Zmiana singletonu jest dozwolona wyłącznie podczas startu przed UI.
Etap 4 udostępnia mechanizm dla migracji; nie przełącza istniejącej instalacji
ani nie modyfikuje starej bazy.

## Etap 5 — bezstratna migracja

Źródło jest otwierane z jego istniejącym schematem, bez upgrade i bez zapisu.
Migracja wymaga jawnego potwierdzenia Właściciela zalogowanego na własne konto.
Kopiuje wszystkie tabele, UUID, relacje, daty i rzeczywiste Bloby w jednej
transakcji docelowej; weryfikuje checksum pełnej treści i ponownie sprawdza źródło.
Odmowa nadpisania niezgodnego niepustego celu chroni wcześniejsze dane.
Przerwanie transakcji wycofuje całą kopię. Przerwanie przed zapisem znacznika
można wznowić przez rozpoznanie kompletnej identycznej kopii.
Po znaczniku ukończenia ponowienie nie nadpisuje nowych danych profilu.
Aktywacja następuje dopiero po weryfikacji. SQLite pozostaje bez zmian.

Pełna techniczna kopia przed migracją używa dotychczasowej koperty AES-GCM
z zaszyfrowaną zawartością `ogarniacz-migracja-profili`, także z kolejkami
i konfliktami. Jest kopią do odzyskania źródła, a nie zwykłym eksportem sekcji.
Zachowane `ogarniacz-v1` pozostaje pierwszym źródłem odzyskania danych.
