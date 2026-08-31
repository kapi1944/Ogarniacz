# Architektura synchronizacji

## SyncEngine

`SyncEngine` zachowuje model local-first: moduły czytają i zapisują bieżące repozytoria Dexie, a synchronizacja działa obok UI. Silnik pobiera rekordy zmienione po `updatedAt`, wysyła lokalne zmiany, pobiera zdalne i przenosi tombstones przez `usunietoAt`. Ostatni udany sync, stan offline/błędu i konflikty są trwałe w IndexedDB. Operacje dostawcy mają ograniczony retry, a równoległe wywołania korzystają z jednego przebiegu.

## Provider

UI zna wyłącznie `SyncEngine` i kontrakt `RepozytoriumZdalne`. Obecny `RepozytoriumZdalneInMemory` służy do testów mechaniki i traci dane po przeładowaniu aplikacji. Nie jest backendem produkcyjnym.

## Konflikty

Jeżeli lokalna i zdalna wersja tego samego rekordu zmieniły się od ostatniego sync i nie są identyczne, żadna nie nadpisuje drugiej. Obie wersje trafiają do lokalnego rejestru konfliktów. Ustawienia pozwalają wybrać wersję lokalną albo zdalną. Nie zastosowano CRDT.

## Offline

Bez połączenia silnik nie modyfikuje danych i zapisuje stan `offline`. Błąd providera po wyczerpaniu retry zapisuje stan `błąd`; znacznik ostatniego udanego sync nie przesuwa się.

## Widget bridge

`WidgetSnapshotService` tworzy ograniczony `TodayWidgetSnapshot`: datę, najbliższe elementy dnia, pilne lub zaległe zadania, najbliższe przypomnienie i `updatedAt`. Snapshot jest cache/projekcją, nie źródłem prawdy. Na Androidzie bridge zapisuje JSON w prywatnym katalogu danych aplikacji. Zmiany zadań, planera, leków, wizyt i przypomnień odświeżają projekcję bez zależności Reacta od Kotlin.

## Braki do produkcji

Potrzebny jest wybrany backend zgodny z `RepozytoriumZdalne`, uwierzytelnienie, autoryzacja, szyfrowanie transportu i danych wrażliwych, serwerowy kursor zmian, obsługa plików/Blob, limity oraz testy integracyjne wielu urządzeń. Pełny widget Glance i natywne odczytanie snapshotu nie są jeszcze zaimplementowane.
