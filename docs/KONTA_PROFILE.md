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

## Etap 6 — uruchomienie i zmiana konta

Przed inicjalizacją bazy aplikacja sprawdza sesję serwera i dobiera profil.
Offline odtwarza wyłącznie ostatni profil tego serwera z rejestru IndexedDB.
Nie przełącza kont offline. Tryb anonimowy ma osobną bazę `ogarniacz-lokalny`
i nie może synchronizować kolejki do konta. W samodzielnej instalacji bez
serwera i bez profili dotychczasowy tryb lokalny zachowuje starą bazę.

Pierwsze przypisanie źródła wymaga potwierdzenia oraz zapisania szyfrowanej
kopii. Można zamiast tego rozpocząć z pustym profilem. Jawne przypisanie
rezerwuje źródło w rejestrze, także podczas wznawiania po przerwaniu.
Wymuszona zmiana hasła odbywa się przed otwarciem i inicjalizacją bazy danych.

Zmiana sesji najpierw zamyka widok i bazę, anuluje sygnał kontekstu, zatrzymuje
cykl synchronizacji oraz usuwa powiadomienia i migawkę widgetu. Następuje pełne
przeładowanie. Sygnał storage zawiadamia inne karty; nie jest dowodem tożsamości.
Trwające żądanie natywnego CapacitorHttp może fizycznie dokończyć transport,
ale jego odpowiedź zostaje odrzucona po zamknięciu kontekstu.
Nowy klient wiąże sync z użytkownikiem i Właścicielem przez nagłówki sprawdzane
z cookie na serwerze. Starsze klienty zachowują istniejący kontrakt.
Backend ponownie sprawdza sesję i CSRF po odebraniu ciała push.

## Etap 7 — kopie w kontekście profilu

Manifest v3 otrzymuje opcjonalny kontekst serwera i Właściciela. Cały manifest
pozostaje wewnątrz szyfrogramu; publiczna koperta nie zawiera tożsamości.
Import odrzuca innego Właściciela lub serwer, również w trybie anonimowym.
Starsze kopie v1–v3 bez kontekstu wymagają w profilu jawnego wyboru przypisania.
Odczyt i walidacja starych kopii pozostają zgodne.
Eksport i restore sprawdzają niezmienność bazy i kontekstu także po operacjach
asynchronicznych, po zapisie before-restore i wewnątrz transakcji zapisu.
Kopia ochronna musi mieć ten sam profil. Konta, role systemowe, sesje i granty
serwerowe nie są źródłami backupu i nie są modyfikowane przez import.
Zgodność zwykłego ID i checksum nie jest kryptograficznym dowodem autorstwa.
