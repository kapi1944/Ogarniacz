# Konta i profile

## Etap 3 — konta

Role systemowe są niezależne od członkostw i grantów. Administrator widzi
metadane kont, ale nie otrzymuje prawa odczytu cudzych rekordów.
Tworzenie konta zakłada własne członkostwo Właściciela, bez cudzych grantów.
Hasło początkowe i reset administracyjny wymagają zmiany hasła.
Do tego czasu backend blokuje dane, synchronizację i operacje administracyjne.
Reset wydaje jeden kod odzyskiwania ważny godzinę i zastępuje hash losowym,
nieujawnionym hasłem. Użytkownik ustawia własne hasło przez istniejące
„Odzyskaj dostęp”; poprawny zapis atomowo zużywa kod i zdejmuje wymuszenie.
Kod nie jest utrwalany w przeglądarce i nie można go ponownie pobrać.
Reset unieważnia sesje oraz stare kody odzyskiwania. Blokada i archiwizacja
zachowują dane; reaktywacja wymaga ponownego logowania.

API pod istniejącą ochroną sesji i CSRF:
- GET /api/account/users — metadane kont;
- POST /api/account/users — konto z hasłem tymczasowym;
- PUT /api/account/users — metadane, rola, aktywacja, blokada lub archiwizacja;
- POST /api/account/users/password — jednorazowy reset (UUID konta);
- GET /api/account/users/UUID — szczegóły metadanych konta;
- POST /api/account/sessions/revoke-others — odwołanie pozostałych sesji.

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

## Stan etapów i walidacja — 14 października 2026

Pełne specyfikacje etapów 3–8 odzyskano z historii zadania „Prompt systemu kont”.
Nie odtwarzano istniejących etapów 1–2. Początek pierwotnego zadania:
`084bd32`; początek późniejszego uzupełnienia etapów 1–3: `23b5d7a`.

| Etap | Stan | Commit |
| --- | --- | --- |
| 1 — metadane kont i rola systemowa | Ukończony wcześniej, zachowany | e7d360f |
| 2 — hasła i własne sesje | Ukończony, następnie uzupełniony | 084bd32; b066449 |
| 3 — administracja kontami i pierwszy administrator | Ukończony | e38d865 |
| 4 — rejestr i odrębne bazy | Ukończony | 7e3e6ba |
| 5 — bezstratna migracja | Ukończony | ab956d9 |
| 6 — kontekst, przełączanie i synchronizacja | Ukończony | 96a3c9d |
| 7 — kopie w kontekście konta | Ukończony | 3abdef7 |
| 8 — interfejs kont w Ustawieniach | Ukończony | 23b5d7a |

Etap 8 korzysta ze wspólnego widoku `/ustawienia/konta` i panelu konta:
metadane własnego konta, administracja wyłącznie dla administratora, własne
sesje, udostępnianie istniejącymi grantami oraz przełączanie przez pełny restart.
Reset administracyjny wymaga potwierdzenia. Pola nie używają autofocus.
Potwierdzona utrata sesji zamyka profil; nie przełącza go do trybu anonimowego.

Uzupełnienie `b066449`: termin wygaśnięcia sesji, wylogowanie pozostałych
sesji, szczegóły konta oraz jednorazowy reset z godziną ważności i migracją v7.
Commit zawierający tę aktualizację dokumentacji dodaje testy klienta i UI;
jego SHA jest podany w końcowym raporcie zadania.

Walidacja bieżącego uzupełnienia:
- 47 testów backendu: konta, migracje/tożsamości i serwer; bez pomijania testów;
- 18 testów klienta API oraz obu komponentów zarządzania kontami;
- TypeScript, build Web/PWA i kompilacja backendu.

Wcześniejsza walidacja etapów 3–8 w tym zadaniu obejmowała: 63 testy całego
backendu, 67 testów regresji izolacji/repozytoriów/UI, 78 testów usług kopii
i migracji oraz 15 testów panelu kopii. Zbiory nakładają się, nie należy
sumować tych liczb. Lint przeszedł z wcześniejszymi ostrzeżeniami poza zmianami.

W przeglądarce sprawdzono lokalną makietę z fikcyjnymi kontami: nawigację
Ustawienia → Konta, listę kont i sesji, A → B → A oraz brak panelu administratora
na zwykłym koncie. Przy viewport 390 × 844 nie było poziomego przepełnienia
i fokus pozostawał na BODY. To jest dowód UI z testowym adapterem, nie
potwierdzenie produkcyjnego połączenia z serwerem ani test fizycznego telefonu.

### Pierwsze uruchomienie i granice gotowości

Przy osobnym wdrożeniu: zweryfikowana kopia SQLite, normalne migracje backendu,
jawne wskazanie pierwszego administratora lokalnym poleceniem powyżej,
ponowne logowanie i świadome przypisanie starej bazy z szyfrowaną kopią.
Nie wybieramy konta ani Właściciela automatycznie.
Nowy kod resetu przekazuje się poza aplikacją bezpiecznym kanałem;
nie zapisuje się go w logach, zgłoszeniach ani nieszyfrowanych kopiach.

Backend i Web/PWA są sprawdzone lokalnie. Wdrożenie na Raspberry Pi, fizyczny
Android, alarmy/widgety na urządzeniu oraz produkcyjna migracja wymagają
osobnego odbioru. Nie zbudowano ani nie zainstalowano nowego APK.
Nie wykonano release ani deploymentu i nie otwierano produkcyjnej bazy.
Zmiana konta offline jest odrzucana; można korzystać z bieżącego profilu.
IndexedDB pozostaje nieszyfrowane na urządzeniu. Historyczny typ urządzenia
sesji jest nieznany; nie dopisujemy domniemanych identyfikatorów urządzeń.
Znacznik zmiany sesji po awarii jest odzyskiwany przez Web Locks; przeglądarka
bez tego mechanizmu może wymagać zakończenia zmiany w drugiej karcie.
