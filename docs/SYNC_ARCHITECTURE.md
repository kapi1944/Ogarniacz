# Architektura synchronizacji

## SyncEngine

`SyncEngine` zachowuje model local-first: moduły czytają i zapisują bieżące repozytoria Dexie, a synchronizacja działa obok UI. Silnik pobiera rekordy zmienione po `updatedAt`, wysyła lokalne zmiany, pobiera zdalne i przenosi tombstones przez `usunietoAt`. Ostatni udany sync, stan offline/błędu i konflikty są trwałe w IndexedDB. Operacje dostawcy mają ograniczony retry, a równoległe wywołania korzystają z jednego przebiegu.

## Provider

UI zna wyłącznie `SyncEngine` i kontrakt `RepozytoriumZdalne`. `RepozytoriumZdalneHttp` łączy ten kontrakt z `/api/sync/changes`, a serwer zapisuje rekordy trwale w istniejącym SQLite. `RepozytoriumZdalneInMemory` pozostaje wyłącznie providerem testowym.

Serwer mapuje poprawny `SYNC_ACCESS_KEY` na jeden skonfigurowany `SYNC_USER_ID`. Klient nie przesyła ani nie współdzieli identyfikatora użytkownika: każde urządzenie przekazuje wyłącznie własny `installationId`. Ten wariant jest przeznaczony do prywatnego wdrożenia jednego użytkownika za HTTPS albo w zaufanej sieci; publiczne wdrożenie nadal wymaga docelowych sesji `HttpOnly`.

## Konflikty

Jeżeli lokalna i zdalna wersja tego samego rekordu zmieniły się od ostatniego sync i nie są identyczne, żadna nie nadpisuje drugiej. Obie wersje trafiają do lokalnego rejestru konfliktów. Ustawienia pozwalają wybrać wersję lokalną albo zdalną. Nie zastosowano CRDT.

## Offline

Bez połączenia silnik nie modyfikuje danych i zapisuje stan `offline`. Lokalne rekordy z `updatedAt` nowszym niż ostatni udany sync pełnią rolę trwałej kolejki oczekujących zmian. Błąd providera po wyczerpaniu retry zapisuje stan `błąd`; znacznik ostatniego udanego sync nie przesuwa się.

Po skonfigurowaniu klient synchronizuje przy starcie, co pięć minut, po wznowieniu aplikacji, po odzyskaniu sieci i trzy sekundy po zmianie zapisanej przez wspólne repozytorium. Żaden z tych przebiegów nie blokuje lokalnego zapisu ani interfejsu.

## Widget bridge

`WidgetSnapshotService` tworzy ograniczony `TodayWidgetSnapshot`: datę, najbliższe elementy dnia, pilne lub zaległe zadania, najbliższe przypomnienie i `updatedAt`. Snapshot jest cache/projekcją, nie źródłem prawdy. Na Androidzie bridge zapisuje JSON w prywatnym katalogu danych aplikacji. Zmiany zadań, planera, leków, wizyt i przypomnień odświeżają projekcję bez zależności Reacta od Kotlin.

## Konfiguracja

Serwer wymaga `SYNC_USER_ID` i długiego losowego `SYNC_ACCESS_KEY`. Klient wymaga odpowiadających im `VITE_SYNC_API_URL` i `VITE_SYNC_ACCESS_KEY` podczas prywatnego buildu. Dane `Blob` korzystają z istniejącego kodowania transportowego backupu. Historia i pamięć Echo oraz lokalne tabele sterujące synchronizacją nie są wysyłane.

## Braki do publicznego wdrożenia

Przed wystawieniem API do Internetu potrzebne są docelowe logowanie i sesje `HttpOnly`, konfiguracja HTTPS/reverse proxy, limity per użytkownik, rotacja klucza oraz test wdrożeniowy na rzeczywistych urządzeniach. Klucz build-time nie powinien być traktowany jako sekret w publicznie dostępnym bundle.
