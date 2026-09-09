# Architektura synchronizacji

## SyncEngine

`SyncEngine` zachowuje model local-first: moduły czytają i zapisują wspólne repozytoria Dexie, a synchronizacja działa obok UI na webie/PWA i Androidzie. Każdy lokalny zapis trafia do trwałej `kolejkaSynchronizacji`; kolejne zmiany tego samego rekordu są scalane, a tombstone jest przenoszony przez `usunietoAt`. Wysłana paczka zachowuje `zmianaId` podczas retry, więc serwer może ją rozpoznać bez ponownego zastosowania. Ostatni udany sync, liczba oczekujących zmian, ostatni błąd i konflikty są trwałe lub wyliczane z IndexedDB.

## Provider

UI zna wyłącznie `SyncEngine` i kontrakt `RepozytoriumZdalne`. `RepozytoriumZdalneHttp` łączy ten kontrakt z `/api/sync/changes`, a serwer zapisuje rekordy trwale w istniejącym SQLite. `RepozytoriumZdalneInMemory` pozostaje wyłącznie providerem testowym.

Serwer mapuje poprawny `SYNC_ACCESS_KEY` na jeden skonfigurowany `SYNC_USER_ID`. Klient nie przesyła ani nie współdzieli identyfikatora użytkownika: każde urządzenie przekazuje wyłącznie własny `installationId`. Ten wariant jest przeznaczony do prywatnego wdrożenia jednego użytkownika za HTTPS albo w zaufanej sieci; publiczne wdrożenie nadal wymaga docelowych sesji `HttpOnly`.

## Endpoint i diagnostyka

Jedynym źródłem adresu klienta jest `VITE_SYNC_API_URL`, a klucza `VITE_SYNC_ACCESS_KEY`; oba są wstrzykiwane wyłącznie do prywatnego builda. Przy `http://` skrypt Androida generuje `network_security_config.xml` dla dokładnie tego prywatnego hosta (IPv4 prywatny, `localhost` albo `.local`). Nie ma globalnego zezwolenia cleartext. HTTPS nie wymaga wyjątku Androida.

`npm run sync:doctor` wykonuje wyłącznie odczyty: waliduje URL, DNS/IP, `/health`, preflight CORS oraz uwierzytelniony `GET /api/sync/changes`. Nie wypisuje klucza. Na serwerze domyślne `HOST=0.0.0.0` udostępnia API w LAN, a `CORS_ALLOWED_ORIGINS` ogranicza originy (domyślnie rzeczywisty origin Capacitor: `https://localhost`).

## Konflikty

Jeżeli lokalna i zdalna wersja tego samego rekordu zmieniły się od ostatniego sync i nie są identyczne, żadna nie nadpisuje drugiej. Obie wersje oraz identyfikatory instalacji trafiają do lokalnego rejestru konfliktów. Ustawienia pozwalają wybrać wersję lokalną albo zdalną. Nie zastosowano CRDT.

Reguły w prostym języku:

- identyczne wersje są uznawane za tę samą zmianę i nie tworzą duplikatu;
- lokalna zmiana oparta dokładnie na bieżącej wersji serwera może ją bezpiecznie zastąpić;
- zdalna zmiana bez lokalnej edycji jest przyjmowana automatycznie;
- równoległe edycje, edycja kontra usunięcie oraz dwa różne utworzenia tego samego `id` stają się jawnym konfliktem;
- konflikt wykryty przez serwer między pobraniem a wysłaniem powoduje ponowne pobranie i zachowanie obu wersji, nie ciche nadpisanie;
- wybór wersji lokalnej tworzy nową zmianę opartą na wersji zdalnej, a wybór zdalnej usuwa oczekującą zmianę lokalną.

## Offline

Bez połączenia silnik nie modyfikuje danych i zapisuje stan `offline`. Rekord domenowy i wpis trwałej kolejki są zapisywane w jednej transakcji Dexie, więc kolejka przeżywa restart bez osierocenia zmiany. Błąd providera zwiększa licznik prób i zachowuje ostatni błąd, a znacznik ostatniego udanego sync nie przesuwa się. Migracja jednorazowo odbudowuje kolejkę z `updatedAt` dla wcześniejszych baz.

Po skonfigurowaniu klient synchronizuje przy starcie, po wznowieniu aplikacji, po odzyskaniu sieci i trzy sekundy po zmianie zapisanej przez wspólne repozytorium. Żaden z tych przebiegów nie blokuje lokalnego zapisu ani interfejsu. Service worker stosuje dla `/api/` wyłącznie `NetworkOnly` i nie używa odpowiedzi API jako danych offline.

## Widget bridge

`WidgetSnapshotService` tworzy ograniczony `TodayWidgetSnapshot`: datę, najbliższe elementy dnia, pilne lub zaległe zadania, najbliższe przypomnienie i `updatedAt`. Snapshot jest cache/projekcją, nie źródłem prawdy. Na Androidzie bridge zapisuje JSON w prywatnym katalogu danych aplikacji. Zmiany zadań, planera, leków, wizyt i przypomnień odświeżają projekcję bez zależności Reacta od Kotlin.

## Konfiguracja

Serwer wymaga `SYNC_USER_ID` i długiego losowego `SYNC_ACCESS_KEY`. Klient wymaga odpowiadających im `VITE_SYNC_API_URL` i `VITE_SYNC_ACCESS_KEY` podczas prywatnego buildu. Dane `Blob` korzystają z istniejącego kodowania transportowego backupu. Historia i pamięć Echo oraz lokalne tabele sterujące synchronizacją nie są wysyłane.

## Braki do publicznego wdrożenia

Przed wystawieniem API do Internetu potrzebne są docelowe logowanie i sesje `HttpOnly`, konfiguracja HTTPS/reverse proxy, limity per użytkownik, rotacja klucza oraz test wdrożeniowy na rzeczywistych urządzeniach. Klucz build-time nie powinien być traktowany jako sekret w publicznie dostępnym bundle.
