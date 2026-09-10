# Architektura synchronizacji

## SyncEngine

`SyncEngine` zachowuje model local-first: moduły czytają i zapisują wspólne repozytoria Dexie, a synchronizacja działa obok UI na webie/PWA i Androidzie. Każdy lokalny zapis trafia do trwałej `kolejkaSynchronizacji`; kolejne zmiany tego samego rekordu są scalane, a tombstone jest przenoszony przez `usunietoAt`. Wysłana paczka zachowuje `zmianaId` podczas retry, więc serwer może ją rozpoznać bez ponownego zastosowania. Ostatni udany sync, liczba oczekujących zmian, ostatni błąd i konflikty są trwałe lub wyliczane z IndexedDB.

## Provider

UI zna wyłącznie `SyncEngine` i kontrakt `RepozytoriumZdalne`. `RepozytoriumZdalneHttp` łączy ten kontrakt z `/api/sync/changes`, a serwer zapisuje rekordy trwale w istniejącym SQLite. `RepozytoriumZdalneInMemory` pozostaje wyłącznie providerem testowym.

Serwer wyznacza właściciela danych z zalogowanej sesji `HttpOnly`, nie z danych przesłanych przez klienta. Każde urządzenie przekazuje wyłącznie własny `installationId`. Opcjonalne `SYNC_ACCESS_KEY` i `SYNC_USER_ID` pozostają tylko mostem migracyjnym dla już zainstalowanego APK; po zalogowaniu urządzeń klucz należy usunąć z serwera.

## Endpoint i diagnostyka

Jedynym źródłem adresu klienta jest `VITE_SYNC_API_URL`. Sesja jest losowym, hashowanym po stronie bazy tokenem w cookie `HttpOnly; Secure; SameSite=None`, a zapisy wymagają osobnego tokenu CSRF. Przy `http://` skrypt Androida generuje wyjątek wyłącznie dla dokładnego prywatnego hosta; wdrożenie internetowe używa HTTPS i nie wymaga wyjątku Androida.

`npm run sync:doctor` wykonuje wyłącznie odczyty: waliduje URL, DNS/IP, `/health`, preflight CORS i dostępność endpointu sesji. Uwierzytelniony sync sprawdza tylko w trybie migracyjnym z lokalnym kluczem; zwykła sesja wymaga interaktywnego logowania. `CORS_ALLOWED_ORIGINS` ogranicza originy i zezwala na credentials wyłącznie dla wpisanych adresów.

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

## Konta i reguły dostępu

Pierwsze konto Właściciela powstaje raz, po podaniu `OWNER_BOOTSTRAP_TOKEN` przechowywanego wyłącznie w env serwera. Hasła są hashowane przez `scrypt`, a endpointy logowania, odzyskiwania i przyjmowania zaproszeń mają limit prób na adres źródłowy. Odzyskanie dostępu wykorzystuje jednorazowe kody, unieważnia wszystkie sesje i wymaga ponownego logowania. Zaproszenie Edytora jest losowym, jednorazowym tokenem ważnym 7 dni.

W prostym języku:

- Właściciel widzi i synchronizuje wyłącznie własny zbiór danych;
- Edytor widzi moduł dopiero po jawnym grancie odczytu, a zmienia go dopiero po osobnym grancie edycji;
- grant konkretnej sekcji nie otwiera całego modułu w ogólnym API synchronizacji;
- ustawienia i dane Echo nie są udostępniane Edytorowi przez sync;
- cofnięcie grantu działa od następnego żądania, a cofnięcie Edytora dodatkowo usuwa jego sesje dla tego Właściciela;
- serwer zawsze wyznacza Właściciela i rolę z sesji, więc UI ani klient nie mogą podmienić identyfikatora konta.

Urządzenie pozostające offline może nadal mieć wcześniej pobraną lokalną kopię — cofnięcie dostępu nie jest zdalnym kasowaniem pamięci urządzenia. Po odzyskaniu sieci serwer nie zwróci już danych ani nie przyjmie kolejnych zmian cofniętego Edytora.

Klient wymaga `VITE_SYNC_API_URL`. `VITE_SYNC_ACCESS_KEY` nie jest wymagany i nie może być traktowany jako sekret w publicznym bundle. Dane `Blob` korzystają z istniejącego kodowania transportowego backupu. Historia i pamięć Echo oraz lokalne tabele sterujące synchronizacją nie są wysyłane.
