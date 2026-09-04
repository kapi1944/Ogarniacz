# Architektura synchronizacji

## SyncEngine

`SyncEngine` zachowuje model local-first: moduły czytają i zapisują wspólne repozytoria Dexie, a synchronizacja działa obok UI na webie/PWA i Androidzie. Każdy lokalny zapis trafia do trwałej `kolejkaSynchronizacji`; kolejne zmiany tego samego rekordu są scalane, a tombstone jest przenoszony przez `usunietoAt`. Wysłana paczka zachowuje `zmianaId` podczas retry, więc serwer może ją rozpoznać bez ponownego zastosowania. Ostatni udany sync, liczba oczekujących zmian, ostatni błąd i konflikty są trwałe lub wyliczane z IndexedDB.

## Provider

UI zna wyłącznie `SyncEngine` i kontrakt `RepozytoriumZdalne`. `RepozytoriumZdalneHttp` łączy ten kontrakt z `/api/sync/changes`, a serwer zapisuje rekordy trwale w istniejącym SQLite. `RepozytoriumZdalneInMemory` pozostaje wyłącznie providerem testowym.

Serwer mapuje poprawny `SYNC_ACCESS_KEY` na jeden skonfigurowany `SYNC_USER_ID`. Klient nie przesyła ani nie współdzieli identyfikatora użytkownika: każde urządzenie przekazuje wyłącznie własny `installationId`. Ten wariant jest przeznaczony do prywatnego wdrożenia jednego użytkownika za HTTPS albo w zaufanej sieci; publiczne wdrożenie nadal wymaga docelowych sesji `HttpOnly`.

## Konflikty

Jeżeli lokalna i zdalna wersja tego samego rekordu zmieniły się od ostatniego sync i nie są identyczne, żadna nie nadpisuje drugiej. Obie wersje oraz identyfikatory instalacji trafiają do lokalnego rejestru konfliktów. Ustawienia pozwalają wybrać wersję lokalną albo zdalną. Nie zastosowano CRDT.

## Offline

Bez połączenia silnik nie modyfikuje danych i zapisuje stan `offline`. Trwała kolejka przeżywa restart aplikacji; błąd providera zwiększa licznik prób i zachowuje ostatni błąd, a znacznik ostatniego udanego sync nie przesuwa się. Migracja jednorazowo odbudowuje kolejkę z `updatedAt` dla wcześniejszych baz.

Po skonfigurowaniu klient synchronizuje przy starcie, po wznowieniu aplikacji, po odzyskaniu sieci i trzy sekundy po zmianie zapisanej przez wspólne repozytorium. Żaden z tych przebiegów nie blokuje lokalnego zapisu ani interfejsu. Service worker stosuje dla `/api/` wyłącznie `NetworkOnly` i nie używa odpowiedzi API jako danych offline.

## Widget bridge

`WidgetSnapshotService` tworzy ograniczony `TodayWidgetSnapshot`: datę, najbliższe elementy dnia, pilne lub zaległe zadania, najbliższe przypomnienie i `updatedAt`. Snapshot jest cache/projekcją, nie źródłem prawdy. Na Androidzie bridge zapisuje JSON w prywatnym katalogu danych aplikacji. Zmiany zadań, planera, leków, wizyt i przypomnień odświeżają projekcję bez zależności Reacta od Kotlin.

## Konfiguracja

Serwer wymaga `SYNC_USER_ID` i długiego losowego `SYNC_ACCESS_KEY`. Klient wymaga odpowiadających im `VITE_SYNC_API_URL` i `VITE_SYNC_ACCESS_KEY` podczas prywatnego buildu. Dane `Blob` korzystają z istniejącego kodowania transportowego backupu. Historia i pamięć Echo oraz lokalne tabele sterujące synchronizacją nie są wysyłane.

## Braki do publicznego wdrożenia

Przed wystawieniem API do Internetu potrzebne są docelowe logowanie i sesje `HttpOnly`, konfiguracja HTTPS/reverse proxy, limity per użytkownik, rotacja klucza oraz test wdrożeniowy na rzeczywistych urządzeniach. Klucz build-time nie powinien być traktowany jako sekret w publicznie dostępnym bundle.
