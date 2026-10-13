# Architektura synchronizacji

## SyncEngine

`SyncEngine` zachowuje model local-first: moduły czytają i zapisują wspólne repozytoria Dexie, a synchronizacja działa obok UI na webie/PWA i Androidzie. Każdy lokalny zapis trafia do trwałej `kolejkaSynchronizacji`; kolejne zmiany tego samego rekordu są scalane, a tombstone jest przenoszony przez `usunietoAt`. Wysłana paczka zachowuje `zmianaId` podczas retry, więc serwer może ją rozpoznać bez ponownego zastosowania. Ostatni udany sync, liczba oczekujących zmian, ostatni błąd i konflikty są trwałe lub wyliczane z IndexedDB.

## Provider

UI zna wyłącznie `SyncEngine` i kontrakt `RepozytoriumZdalne`. `RepozytoriumZdalneHttp` łączy ten kontrakt z `/api/sync/changes`, a serwer zapisuje rekordy trwale w istniejącym SQLite. `RepozytoriumZdalneInMemory` pozostaje wyłącznie providerem testowym.

Serwer wyznacza właściciela danych z zalogowanej sesji `HttpOnly`, nie z danych przesłanych przez klienta. Każde urządzenie przekazuje wyłącznie własny `installationId`. Synchronizacja nie ma alternatywnej ścieżki uwierzytelnienia poza kontem i sesją.

## Endpoint i diagnostyka

Adres klienta ustala centralny `RuntimeConfigService`. Web/PWA odczytuje `window.__OGARNIACZ_RUNTIME_CONFIG__.syncApiUrl`, następnie `VITE_SYNC_API_URL`; gdy endpoint jest pusty, korzysta z `location.origin` wyłącznie dla HTTPS. Dzięki temu Web/PWA serwowane przez własny backend używa same-origin `/api/auth/*` i `/api/sync/*` bez wpisywania adresu ani zmiennej buildu. Jawny endpoint pozostaje dostępny dla osobnego hostingu Web/PWA; błędny endpoint nie jest zastępowany fallbackiem. HTTP i origin `null` nie uruchamiają automatycznej konfiguracji.

Android APK nadal odczytuje osobną konfigurację natywną przez `RuntimeConfigPlugin`, bez fallbacku do originu WebView (`https://localhost`), także przy błędzie odczytu wtyczki. Endpoint musi wskazywać pełny origin HTTPS Tailscale Serve. Sesja jest losowym, hashowanym po stronie bazy tokenem w cookie `HttpOnly; Secure; SameSite=None`, a zapisy wymagają osobnego tokenu CSRF. Android nie ma wyjątku cleartext; surowy HTTP LAN nie jest obsługiwaną ścieżką synchronizacji.

`npm run sync:doctor` wykonuje wyłącznie odczyty: waliduje URL, DNS/IP, `/health`, preflight CORS i dostępność endpointu sesji. Uwierzytelniony sync wymaga interaktywnego logowania w aplikacji. `CORS_ALLOWED_ORIGINS` ogranicza originy i zezwala na credentials wyłącznie dla wpisanych adresów.

Ustawienia → Synchronizacja → Diagnostyka synchronizacji pokazują ostatni wynik połączenia z backendem, stan sesji, czasy udanego pull i push oraz ostatniej próby, bieżące liczby rekordów outboxu i konfliktów, kontrolowany ostatni błąd, protokół/host endpointu i skrócony installationId. Podsumowanie połączenia wskazuje wymagane logowanie, decyzję o konflikcie lub oczekujące zmiany. Stan połączenia jest wynikiem ostatniej operacji, nie osobnym sprawdzaniem zdrowia serwera.

Opcjonalne metadane diagnostyczne są dopisywane do istniejącego lokalnego `stanSynchronizacji`, bez zmiany indeksów Dexie, encji synchronizowanych ani protokołu. Starsze zapisy pozostają zgodne: brak czasu oznacza „jeszcze nie wykonano”, a kursora `ostatniSync` nie interpretuje się jako czasu pull/push. Czasy odnoszą się do poprawnej odpowiedzi providera; pusty pull jest udany, natomiast push bez wysyłanych zmian nie tworzy nowego czasu. Metadane przeżywają ponowne otwarcie bazy. Liczniki są odczytywane z istniejących tabel przez `useLiveQuery`, bez pollingu UI. Ostatni kontrolowany błąd pozostaje historią także po udanej ponownej synchronizacji; udana odpowiedź usuwa wymóg ponownego logowania.

Diagnostyka nie kopiuje rekordów, treści odpowiedzi, stack trace, emaila konta, cookies, haseł ani tokenów. Komunikaty błędów pochodzą wyłącznie ze słownika kontrolowanych kategorii; starszy surowy błąd nie jest wyświetlany. Endpoint pomija credentials, ścieżkę, query i fragment, a CSRF pokazuje wyłącznie dostępność.

## Konflikty

### Health 2.0 — prywatne źródła dokumentów i starsze APK

Dokument powiązany z lokalnym wynikiem badania otrzymuje `sekcjePrywatnosci: ['dokumentacja']`, a materiał sesji — `['dokumentacja', 'psychoterapia']`. Pole zawiera wyłącznie klasyfikację uprawnień, bez treści ani ID sesji/wyniku. Edytor potrzebuje grantu Dokumenty oraz aktywnych grantów odpowiednich sekcji Zdrowia. Zwykłe dokumenty zachowują dotychczasową synchronizację.

Klasyfikacja narasta: odpięcie lub zmiana źródła nie zdejmuje ochrony. Repozytorium odrzuca jej usunięcie; serwer zachowuje sumę zapisanej i przesłanej klasyfikacji, także przy zapisie ze starszego klienta. Zapis źródła, klasyfikacja dokumentu i aktualizacja oczekującej zmiany odbywają się w jednej transakcji. Istniejące relacje są uzgadniane idempotentnie przed odczytem kolejki; opcjonalne pole nie wymaga nowych tabel ani indeksów Dexie. Pull i rozstrzygnięcie konfliktu zachowują klasyfikację lokalną.

Przed konfliktem treści klient przesyła klasyfikację na pobranej wersji dokumentu. Serwer utrwala samo zaostrzenie dostępu do istniejącego dokumentu również wtedy, gdy późniejszy zapis treści kończy się `409`; treść i `updatedAt` tej wersji pozostają wtedy bez zmian. Ochrona dawnych dokumentów na serwerze zaczyna obowiązywać dopiero po przekazaniu klasyfikacji przez zaktualizowanego klienta do zaktualizowanego serwera. Serwer nie może odtworzyć nieznanych mu lokalnych relacji. Nie usuwa się zdalnych rekordów.

`POST /api/sync/changes` nadal zwraca `200` dla poprawnej paczki, ale pomija całą tabelę `wpisyTerapii` przed kontrolą grantów, konfliktów i zapisem. Historyczne rekordy pozostają nienaruszone, a odczyt nadal wymaga właściwych uprawnień. Odpowiedź ma postać `{ zapisano, pominiete }`: `zapisano` liczy rzeczywiste zapisy (bez pominiętych i wcześniej przetworzonych zmian), a `pominiete` zawiera `{ tabela, rekordId, zmianaId?, powod: 'tabela_lokalna' }`, bez prywatnych treści. Pozostałe prawidłowe rekordy w tej samej paczce synchronizują się normalnie.

**Starsze APK wymagają aktualizacji klienta.** Dotychczasowy klient ignorujący body odpowiedzi `200` może pokazać wysłaną notatkę jako zsynchronizowaną, choć serwer jej nie zapisał. Nie da się poprawić takiego komunikatu w już zainstalowanym APK samą zmianą serwera. Aktualny klient wyklucza `wpisyTerapii` z transportu; nie ma retry blokującego całą paczkę przez lokalną tabelę.

Brak zarejestrowanego kontekstu odmawia chronionych operacji, z wyjątkiem zgodnego konta właściciela. Świadomy tryb lokalny działa po odczytaniu ustawień i zarejestrowaniu kontroli kontekstu; domyślne ustawienia renderowania nie otwierają dostępu przed ich odczytem. Wyłączenie kontekstu rejestruje odmowę również dla właściciela.

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

Klient nie wymaga sekretów w konfiguracji; uwierzytelnienie zapewnia sesja. Web/PWA na własnym HTTPS nie wymaga `VITE_SYNC_API_URL`, natomiast APK zachowuje jawny adres w konfiguracji natywnej. Dane `Blob` korzystają z istniejącego kodowania transportowego backupu. Historia i pamięć Echo oraz lokalne tabele sterujące synchronizacją nie są wysyłane.
