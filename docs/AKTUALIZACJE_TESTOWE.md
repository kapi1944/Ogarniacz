# Aktualizacje testowe — Etapy A i B

Zaimplementowano fundament: Ustawienia → Połączenie i aktualizacje →
**Aktualizacje testowe**, metadane uruchomionego frontendu, odczyt GitHub i walidację
kontraktu manifestu. Etap B dodaje ręczne budowanie, weryfikację i opcjonalne
udostępnianie Web/Raspberry przez GitHub Actions. Nie jest to jeszcze system instalacji Beta.

## Działanie na platformach

- Android: odczyt publicznych metadanych przez istniejący `CapacitorHttp`,
  bez backendu Raspberry, sesji synchronizacji i Tailscale.
- Windows, Web, PWA i przeglądarka korzystająca z Raspberry: ten sam odczyt przez
  publiczne API GitHub. Rozpoznawane są Web/PWA i Windows; przeglądarka nie udaje
  natywnej aplikacji Windows ani nie zgaduje sprzętu serwera.
- **Sprawdź najnowszy commit** odczytuje main i status CI dokładnego SHA.
- **Sprawdź build testowy** dodatkowo wyszukuje publiczny prerelease Beta i
  weryfikuje manifest, metadane plików oraz pomyślne przebiegi CI i testowego workflow.
- Brak buildu, starszy SHA, brak lub nieudane CI są odrębnymi stanami.
  Starszy artefakt pozostaje informacją i nie jest oferowany jako build main.
- Pobieranie i instalacja są jawnie wyłączone. Nie ma jeszcze przycisków otwarcia
  Beta/Stable, ponieważ nie wdrożono równoległych instancji.

Sam odczyt nie zmienia danych, cache, service workera ani stanu stabilnych
aktualizatorów. Na otwarciu panelu nie powstają zapytania GitHub. Użytkownik może
anulować sprawdzanie; równoległe sprawdzanie jest blokowane. Natywne żądanie HTTP
może dokończyć się w tle po anulowaniu, ale jego wynik jest odrzucany.

## Pochodzenie buildu

Vite zapisuje pełny SHA, datę budowania i stan czystości źródeł w samym bundle.
Panel nie bierze SHA aplikacji z bieżącego HEAD serwera ani z manifestu w sieci.
Lokalne zmiany są wyraźnie oznaczone: SHA jest wtedy commitem bazowym.
Archiwum przygotowywane przez istniejący skrypt Raspberry otrzymuje `GITHUB_SHA`
dokładnego commita i nie dziedziczy HEAD nadrzędnego repozytorium. Bez możliwości
sprawdzenia checkoutu panel nie deklaruje czystości źródeł.

## Kontrakt kanału testowego

Poniższy kontrakt jest obsługiwany przez czytnik Etapu A i generator
`scripts/test-build.mjs`. Ręczny workflow `.github/workflows/test-build.yml`
nosi nazwę **Test Build Ogarniacza**. Dodanie workflow nie publikuje prerelease.

Kanał to publiczny, niedraftowy **prerelease**, z nowym, nieprzesuwanym tagiem
`beta-<numerBuildu>-<pełny SHA>`. Nie korzysta z `/releases/latest`.
Tag ma wskazywać istniejący commit main. Nie powstaje nowa gałąź.

Manifest `ogarniacz-test-v1` ma pola:

| Pole | Warunek |
| --- | --- |
| `format`, `repozytorium`, `galaz`, `kanal` | `ogarniacz-test-v1`, `kapi1944/Ogarniacz`, `main`, `beta` |
| `sha` | pełny SHA dokładnie użytych źródeł |
| `wersja`, `numerBuildu` | np. `1.1.0-beta.42`, `42`; bez zmiany package/lock |
| `runId`, `ciRunId` | identyfikatory przebiegów GitHub Actions |
| `data`, `opis` | data ISO 8601 i skrót zmian |
| `artefakty` | unikalne platformy `android`, `raspberry`, `web` i nazwy plików |
| każdy artefakt | `platforma`, `nazwa`, `rozmiar` w bajtach, `sha256` |
| dodatkowo Android | `pakiet`: `pl.ogarniacz.app.beta`, `sha256Certyfikatu` |

Pipeline udostępnia manifest jako plik oraz umieszcza identyczny JSON
w treści prerelease, w pojedynczym bloku kodu `json`. Czytnik korzysta z treści
publicznego API zamiast pobierać manifest przez domenę pobierania plików GitHub,
która wymagałaby osobnego sprawdzenia CORS. Nazwy, rozmiary i `digest` SHA-256
plików muszą odpowiadać publicznym metadanym assetów; brak digest blokuje walidację.

Czytnik sprawdza niezależnie przez API, że `ciRunId` wskazuje zakończony sukcesem
`ci.yml`, a `runId` zakończony sukcesem `test-build.yml` uruchomiony ręcznie,
z właściwym `run_number`. Oba muszą dotyczyć tego samego SHA i main we właściwym
repozytorium. Najnowsze CI main również musi być zielone. Nowszy nieudany przebieg
nie jest maskowany starszym zielonym. Zmiana main podczas odczytu unieważnia wynik.
Wyszukiwanie ma limit 1000 wydań; przekroczenie jest błędem, a nie fałszywym brakiem buildu.

To walidacja metadanych, **nie weryfikacja pobranego pliku, podpisu APK ani
potwierdzenie instalacji**. Te operacje pozostają zablokowane do kolejnych etapów.

## Ręczne uruchomienie Etapu B

1. W repozytorium `kapi1944/Ogarniacz` otwórz **Actions → Test Build Ogarniacza →
   Run workflow** i wybierz istniejącą gałąź **main**.
2. Najpierw upewnij się, że najnowsze CI dokładnego SHA zakończyło się sukcesem.
   Workflow nie czeka na CI: brak, błąd, anulowanie lub trwający przebieg blokuje build.
3. Pozostaw **publish_beta=false** (domyślnie). Powstaną zweryfikowane pliki
   w sekcji **Artifacts** przebiegu, bez taga, release ani wdrożenia.
4. Dopiero na osobne, świadome polecenie uruchom **nowy** przebieg z
   **publish_beta=true**, aby udostępnić publiczny prerelease. Nie używaj
   „Re-run jobs”: `run_attempt > 1` jest blokowane w obu zadaniach.

Z CLI odpowiednikiem bezpiecznego sprawdzenia jest:

```bash
gh workflow run test-build.yml --repo kapi1944/Ogarniacz --ref main -f publish_beta=false
```

Workflow przypina checkout do pełnego `github.sha`, sprawdza czystość źródeł,
`origin/main` przez Git oraz aktualny main i pochodzenie przebiegów przez API.
Wybiera najnowszy pasujący `ci.yml` dokładnego SHA/main (push lub ręczny),
bez filtrowania odpowiedzi tylko do zakończonych sukcesem. Identyfikatory
przebiegów i numer Bety pochodzą z GitHub, a opis z dokładnego commita.
Numeracja manifestu to `1.1.0-beta.<github.run_number>`; package/lock zachowują
wersję źródeł, również w paczce Raspberry. Bundle pokazuje dotychczasową wersję
aplikacji i pełny SHA; numer Bety odczytuje się z manifestu/panelu aktualizacji.

Jedna grupa concurrency blokuje równoległe przebiegi Beta bez anulowania
trwającego. Zadanie budowania ma tylko `contents: read` i `actions: read`.
Osobne zadanie publikacji ma `contents: write` i uruchamia się wyłącznie dla
`publish_beta=true` po sukcesie budowania. Nie korzysta z produkcyjnego
środowiska ani sekretów podpisywania. Potrzebny jest standardowy `GITHUB_TOKEN`
z uprawnieniami zadeklarowanymi przez workflow; polityka repozytorium musi je dopuszczać.

Po budowaniu i bezpośrednio przed upublicznieniem następuje ponowna kontrola
main/CI. Przesunięcie main albo zmiana najnowszego identyfikatora CI od
przygotowania manifestu przerywa przebieg. W takim przypadku uruchom nowy
workflow dla aktualnego main po zielonym CI.

## Pliki wynikowe

W runnerze komplet znajduje się w `artifacts/beta/`, a w GitHub Actions w
artefakcie `ogarniacz-beta-<numerBuildu>-<pełny SHA>` (retencja 30 dni).
Przy publikacji pliki stają się osobnymi assetami prerelease (C1 dodaje opcjonalny APK):

| Plik | Zawartość |
| --- | --- |
| `Ogarniacz-beta-<numerBuildu>-web.tar.gz` | kompletny `dist/` bez dodatkowego katalogu głównego: frontend, zasoby, manifest PWA, service worker |
| `Ogarniacz-beta-<numerBuildu>-raspberry.tar.gz` | `dist/`, skompilowany `dist-server/`, niezmienione `package.json` i `package-lock.json` |
| `manifest-testowy.json` | manifest `ogarniacz-test-v1`: faktyczne nazwy, rozmiary, SHA-256 i identyfikatory GitHub; Web/Raspberry oraz opcjonalnie Android po C1 |

Obie paczki zawierają `metadane-testowe.json` przy plikach frontendu
(w Raspberry: `dist/metadane-testowe.json`) z pełnym SHA, `runId` i numerem.
SHA pozostaje też w metadanych bundle Vite. Generator sprawdza obie reprezentacje.
Pakowanie korzysta z jawnej listy plików buildu i zależności, bez archiwizowania
repozytorium. Walidacja odrzuca niedozwolone ścieżki, dowiązania, pliki specjalne,
puste/niekompletne i uszkodzone archiwa, niezgodny SHA pochodzenia, rozmiar i hash.
Nie są pakowane `.env` (także `.env.example`), klucze, keystore, SQLite,
backupy, katalogi danych użytkownika, `.git`, `node_modules` ani projekt Androida.
Nowe rodzaje zasobów buildu wymagają jawnego rozszerzenia listy dozwolonych plików.

Nie ma instalacji, restartu usług, zmiany produkcyjnego originu PWA ani Web OTA.
Etap B nie tworzył APK; C1 dodaje opcjonalny podpisany APK według procedury poniżej. Nigdy nie powstaje fikcyjny wpis Androida. Panel potwierdza dostępne platformy
i wyświetla osobny komunikat o braku artefaktu Android Beta.

### Publikacja i błędy

Tag `beta-<numerBuildu>-<pełny SHA>` jest tworzony atomowo jako referencja
bezpośrednio do commita źródeł. Istniejący tag, wydanie lub ponowienie tego samego
przebiegu blokują publikację. Nie ma przesuwania tagów ani nadpisywania assetów.
Najpierw powstaje draft prerelease z jedynym blokiem `json` w treści, następnie
wszystkie pliki manifestu i sam manifest. Dopiero po sprawdzeniu rozmiarów, stanu `uploaded` i
`digest: sha256:<hash>` wszystkich plików draft jest upubliczniany.
`prerelease=true` i `make_latest=false` pozostają ustawione. Pipeline nie korzysta
z `/releases/latest`, nie przesuwa `rpi-stable` i nie uruchamia **Publikuj Ogarniacza**.

Po upublicznieniu wykonywany jest anonimowy odczyt release i taga: treść musi
odpowiadać plikowi JSON, a publiczne rozmiary/digesty muszą być zgodne z bajtami
wszystkich assetów, łącznie z manifestem. Odczyt ma ograniczoną liczbę ponowień
na propagację metadanych; brak digest nigdy nie jest pomijany. Błąd kończy workflow
niepowodzeniem. Częściowy draft/tag może pozostać do ręcznej oceny; pipeline go
nie usuwa ani nie naprawia przez nadpisanie. Kolejna próba wymaga nowego dispatchu
i nowego numeru. Awaria weryfikacji już upublicznionego wydania również blokuje
uznanie go za poprawny build przez czytnik.

W trakcie publikacji własny workflow ma status `in_progress`. Pipeline nie udaje
jego sukcesu. **Sprawdź build testowy** potwierdzi wydanie dopiero po sukcesie
całego przebiegu, przy nadal zgodnym main i zielonym najnowszym CI. Tryb
`publish_beta=false` nie tworzy wydania widocznego dla panelu. **Sprawdź najnowszy
commit** działa niezależnie w obu trybach.

### Co pozostaje do Etapu D

Paczka Raspberry nie zawiera zainstalowanych zależności ani instalatora.
Etap D musi zapewnić Node.js 24 z `node:sqlite` na docelowej architekturze oraz
zainstalować zależności produkcyjne z locka (`npm ci --omit=dev`) we własnym
katalogu Bety; backend korzysta m.in. z `zod` i `nodemailer`. Build nie wymaga
ponownej kompilacji TypeScript ani Vite na Raspberry.

Przed uruchomieniem potrzebne będą izolowane: użytkownik/katalog runtime,
konfiguracja i sekrety, SQLite/dane, port/usługa, prywatny HTTPS i origin.
`HOST`, `PORT`, `DATABASE_PATH`, `STATIC_DIR`, `CORS_ALLOWED_ORIGINS` i ewentualny
bootstrap kont muszą wskazywać wyłącznie Betę. Produkcyjny updater Raspberry
ma pozostać wyłączony (`RPI_UPDATE_ENABLED` bez wartości `1`). Uruchomienie
skompilowanego `dist-server/main.js` i potwierdzenie izolacji oraz dostępu przez
Tailscale należą do D. Etap B nie uruchamia backendu na urządzeniu ani nie
testuje migracji na produkcyjnej bazie. Osobny origin PWA należy do Etapu E.

## Numeracja produkcyjna

Domyślne `patch` w **Publikuj Ogarniacza** korzysta ze zmienionego istniejącego
skryptu przygotowania: z `1.0.23` przechodzi do `1.1.0`, następnie do `1.1.1`.
Przygotowane, nieopublikowane `1.0.24` nie zostanie omyłkowo zaakceptowane jako
następne wydanie. Kolejne minor/major działają według dotychczasowej polityki SemVer.
Etap A nie zmienia package.json/package-lock.json i nie publikuje `1.1.0`.

## Pozostałe etapy

1. **B — zaimplementowany:** ręczny workflow dla dokładnego main po CI,
   integralność Web/Raspberry, opcjonalny publiczny prerelease bez zmiany Stable.
   Rzeczywista publikacja wymaga osobnego polecenia; nie wynika z samego dodania pipeline'u.
2. **C:** wariant Android Beta, trwały osobny klucz w CI, przypięty fingerprint,
   spójny versionCode, rozdzielone zasoby/linki/powiadomienia oraz ograniczone
   rozszerzenie istniejącego downloadera i instalatora. Wymagane testy blokady
   nieprawidłowego pakietu/podpisu, downgrade, anulowania i potwierdzenia instalacji.
3. **D:** osobny runtime, SQLite, konfiguracja, usługa, port i prywatny HTTPS przez
   Tailscale; operacje Właściciela przez istniejące sesje i CSRF. Bez potwierdzenia
   izolacji wdrożenie ma pozostać zablokowane. Etap A nie bada ani nie zmienia produkcji.
4. **E:** wdrożenie webowej Bety na osobnym originie, sprawdzona izolacja IndexedDB,
   cache i service workera oraz przyciski otwarcia Beta/Stable.
5. **F:** testy pobierania, instalacji, izolacji i danych na urządzeniach, regresja
   oraz kwalifikacja do `1.1.0`. Etap A nie potwierdza gotowości tego wydania.

Artefakty można pobrać z GitHub Actions, a po świadomej publikacji także z
prerelease. Pobieranie i instalacja przez panel pozostają wyłączone.
Nie uruchamiaj publikacji produkcyjnej w celu testowania kanału Beta.

## Prywatność i ograniczenia

GitHub otrzymuje wyłącznie publiczne zapytania o repozytorium oraz IP i zwykłe
metadane połączenia. Usługa nie wysyła danych Ogarniacza, tokenów ani ciasteczek
frontendu; nie używa konfiguracji synchronizacji. Nie ma odczytu w tle, więc
wyłączenie polega na niewybieraniu przycisków. Obowiązują limity anonimowego API.
Testy lokalne używają atrap GitHub i nie potwierdzają rzeczywistego CORS, działania
na telefonie ani dostępności artefaktu. Dostęp z urządzeń wymaga późniejszego
sprawdzenia po utworzeniu kanału testowego.

Test syntetycznego updatera Raspberry używa krótkiego katalogu systemowego
zamiast katalogu w długiej ścieżce repozytorium. Pozwala to na tworzenie plików
snapshotu i journal SQLite na Windows bez zmiany produkcyjnego updatera.

## Weryfikacja Etapu A (26.10.2026)

- Pełna regresja Vitest: 138 plików, 1185 testów, sukces.
- Końcowa kopia indeksu, bez równoległych edycji innego zadania: 102 testy
  panelu/usługi i istniejących aktualizatorów, sukces; build i smoke PWA, sukces.
- Testy backendu: 90, sukces. Build backendu i typecheck: sukces.
- Testy numeracji, publikacji i metadanych: 29, sukces również na kopii indeksu.
- Regresje klasyfikacji, zabezpieczeń Raspberry, skryptów Android i wycofania
  Web OTA: sukces. Test updatera Raspberry początkowo ujawnił limit ścieżek Windows;
  po skróceniu katalogu testowego przeszedł, łącznie ze snapshotem i rollbackiem.
- Lint: bez błędów, z istniejącymi ostrzeżeniami poza zmienioną funkcjonalnością.
- Testów natywnych Androida nie uruchomiono: brak skonfigurowanego Android SDK.
  Nie testowano fizycznego telefonu, Raspberry ani rzeczywistej publikacji/CORS.

Pełna regresja poprzedza ostatnie dwa celowane przypadki testowe; końcowe 102
testy sprawdzają finalny kod tego etapu. Inne, równoległe zmiany ustawień nie są
częścią commitów aktualizatora. Nie uruchamiano żadnej publikacji ani instalacji.

## Pliki zmienione w Etapie A

- Numeracja: `.github/workflows/android-release.yml`,
  `scripts/android-release-przygotowanie.mjs`,
  `scripts/android-release-przygotowanie.test.mjs`.
- Pochodzenie buildu: `vite.config.ts`, `src/vite-env.d.ts`,
  `scripts/metadane-buildu.ts`, `scripts/metadane-buildu.test.mjs`,
  `.github/workflows/ci.yml`.
- Odczyt GitHub: `src/platform/AktualizacjeTestoweService.ts`,
  `src/platform/AktualizacjeTestoweService.test.ts`.
- Panel: `src/modules/ustawienia/PanelAktualizacjiTestowych.tsx`,
  `src/modules/ustawienia/PanelAktualizacjiTestowych.test.tsx`,
  `src/modules/ustawienia/SekcjaPolaczeniaIAktualizacji.tsx` (wyłącznie import i panel).
- Przenośność testu: `scripts/aktualizuj-rpi.test.mjs`.
- Dokumentacja: `docs/ANDROID_RELEASE.md`, `docs/AKTUALIZACJE_TESTOWE.md`.

## Weryfikacja Etapu B

Testy pipeline'u: `node --test scripts/test-build.test.mjs scripts/metadane-buildu.test.mjs`.
Obejmują bramki SHA/main/CI, numerację, brak/uszkodzenie plików, rozmiary/hashe,
duplikaty, ponowienia, wykluczenie danych, przygotowanie draftu przed publikacją,
publiczne digesty oraz rzeczywisty parser i usługę Etapu A na syntetycznym API.
Czytnik odrzuca własny workflow w toku i akceptuje komplet Web/Raspberry po sukcesie.
Test panelu sprawdza komunikat braku Androida bez blokowania pozostałych platform.

Wymagane sprawdzenia: powyższe testy, celowane testy usługi/panelu Vitest,
`npm run lint`, `npm run build:production` (z typecheckiem) i `npm run pwa:smoke`.
Syntetyczne testy publikacji nie potwierdzają rzeczywistego publicznego prerelease,
CORS na telefonie ani instalacji. Do takiego potwierdzenia konieczny jest osobno
autoryzowany przebieg z publikacją i publiczna weryfikacja po jego sukcesie.

Lokalna weryfikacja 26.10.2026: 20/20 testów pipeline'u/metadanych i 44/44
testów usługi/panelu zakończone sukcesem; typecheck, build Web/Raspberry oraz
smoke PWA poprawne. Lint bez błędów, z istniejącymi ostrzeżeniami poza zakresem.
Vitest i smoke PWA wymagały ponowienia poza sandboxem Windows z powodu blokady
cache/localhost. Nie uruchamiano publikacji Beta ani produkcyjnej.

## Etap C1 — osobna aplikacja Android Beta

Stan: **implementacja wymaga konfiguracji podpisu**. W repozytorium GitHub
26.10.2026 nie było czterech sekretów Beta ani zmiennej fingerprintu.
Nie wygenerowano klucza ani podpisanego APK; nie publikowano Bety.

Istniejący projekt Capacitor ma dodatkowy build type `beta` (`assembleBeta`).
`debug` i `release` zachowują pakiet `pl.ogarniacz.app`, dotychczasową numerację
z package.json i konfigurację podpisu release. Beta używa `pl.ogarniacz.app.beta`,
nazwy **Ogarniacz Beta**, ikony z napisem BETA i stałego oznaczenia w interfejsie.
Nie zmienia namespace Java ani package/lock. Android izoluje UID, WebView/IndexedDB,
preferencje i prywatne pliki według pakietu; nie ma współdzielonego UID.
FileProvider używa `${applicationId}.fileprovider`. Skróty Bety kierują do pakietu
Beta i `ogarniacz-beta://`; Stable zachowuje `ogarniacz://`.
Identyfikatory alarmów, kanałów i PendingIntent są dodatkowo izolowane pakietem Androida.

Beta deklaruje natywny `KANAL_BETA` i `kanalBeta` w RuntimeConfig. Test Build
kompiluje frontend z `VITE_KANAL_BETA=true`. Natywna konfiguracja Bety zawsze ma
puste adresy synchronizacji i aktualizatora produkcyjnego oraz klucz Picovoice,
niezależnie od odziedziczonych zmiennych i plików .env. Runtime usuwa adresy także
przy błędnej konfiguracji. Centralny serwis konfiguracji i RepozytoriumZdalneHttp
blokują synchronizację nawet dla jawnego URL; brak fallbacku do produkcji.
Dostarczanie powiadomień i harmonogramowanie alarmów jest zablokowane także po
imporcie testowych danych. Import kopii jest świadomą operacją użytkownika.
Połączenie z backendem testowym wymaga osobnego etapu.

### Jednorazowe przygotowanie trwałego podpisu

Wykonuje właściciel poza repozytorium, na zaufanym komputerze:

1. Utwórz **jeden osobny** klucz Beta, np. interaktywnie:
   `keytool -genkeypair -keystore ogarniacz-beta.jks -alias ogarniacz-beta -keyalg RSA -keysize 3072 -validity 10000`.
   Nie używaj istniejącego klucza produkcyjnego ani debug. Zapisz zaszyfrowaną kopię
   keystore, alias i hasła w bezpiecznym miejscu; ten sam klucz jest potrzebny do aktualizacji Bety.
2. Odczytaj fingerprint przez `keytool -list -v -keystore ogarniacz-beta.jks -alias ogarniacz-beta`.
   Sprawdź, że różni się od certyfikatu produkcyjnego. Usuń dwukropki i zapisz
   64 małe znaki hex w **Actions → Variables → ANDROID_BETA_CERT_SHA256**.
   To publiczne, niezależne przypięcie; pipeline nigdy nie bierze wartości oczekiwanej z APK.
3. W **Actions → Secrets** ustaw:
   `ANDROID_BETA_KEYSTORE_BASE64` (Base64 całego trwałego keystore),
   `ANDROID_BETA_STORE_PASSWORD`, `ANDROID_BETA_KEY_PASSWORD`, `ANDROID_BETA_KEY_ALIAS`.
   Wartości przekazuj z bezpiecznych plików/stdin lub formularza GitHub, bez wklejania
   do poleceń, logów, issue ani historii terminala. Base64 nie jest szyfrowaniem.
4. Po zielonym CI uruchom nowy Test Build z **main** i **publish_beta=false**.
   Brak któregokolwiek pola pomija APK i zapisuje „wymaga konfiguracji” w summary.
   Niepełna konfiguracja nigdy nie daje gotowości Android Beta. Błędny klucz,
   hasło, pakiet, numeracja lub certyfikat kończą build błędem, bez publikacji.

Keystore trafia tylko do prywatnego katalogu RUNNER_TEMP z uprawnieniami 0600,
nie do źródeł ani artefaktów; krok `always()` usuwa go po budowaniu.
Nie jest generowany przy kolejnych buildach. Produkcyjne sekrety nie są odczytywane.
`apksigner verify --verbose --print-certs` sprawdza integralność podpisu i wymaga
jednego certyfikatu zgodnego z przypiętym SHA-256. `aapt dump badging` niezależnie
sprawdza rzeczywisty pakiet, versionCode i versionName. Kontrola powtarza się po
pobraniu artefaktu przez zadanie publikacji, przed utworzeniem publicznego release.

### Numeracja i artefakty C1

`versionName=1.1.0-beta.<github.run_number>`, `versionCode=github.run_number`
(1–2100000000). Kolejny dispatch daje większy kod, a luki po nieudanych przebiegach
są dozwolone. Ponowienia `run_attempt > 1` pozostają zabronione. Nie resetuj licznika
workflow ani nie przenoś go do nowego workflow z niższą numeracją. Przy wyczerpaniu
zakresu wymagany jest osobny projekt zmiany numeracji. Android blokuje zwykłą
instalację APK o niższym versionCode; pipeline wymaga dokładnego kodu bieżącego
przebiegu. Nie używa opcji dopuszczających downgrade ani nie instaluje aplikacji.

Manifest nadal wymaga Web i Raspberry, dopuszczając **opcjonalny trzeci artefakt**
`Ogarniacz-beta-<numerBuildu>-android.apk`. Android pojawia się wyłącznie po
rzeczywistym podpisanym buildzie i weryfikacji. Wpis zawiera rzeczywisty rozmiar,
SHA-256 bajtów APK, `pakiet=pl.ogarniacz.app.beta` i SHA-256 certyfikatu odczytany
z APK. Razem z manifestem komplet ma trzy lub cztery pliki. Allowlista archiwów,
kontrola kompletności, publicznych digestów i blokady tagów/main/CI pozostają aktywne.
Czytnik Etapu A już obsługuje trzy platformy; test C1 potwierdza pełny odczyt i
odrzucenie niekompletnych publicznych assetów. Czytnik nie instaluje APK.

CI sprawdza Stable oraz Beta przez Gradle/Robolectric, w tym pakiet, prywatny katalog,
provider, nazwę, skróty i puste endpointy Bety. Testy JS sprawdzają brak wywołań
HTTP push/pull przy jawnym produkcyjnym adresie, brak dostarczania alarmów i linki.
Testy skryptów obejmują numerację, ponowienia, obcy/brakujący certyfikat i pakiet.
Test Build zachowuje Web/PWA, Raspberry i opcjonalny APK w Actions bez publikacji.
Testy Gradle nie potwierdzają instalacji na fizycznym Samsungu.

**C2 pozostaje niewykonany:** pobieranie i instalacja z panelu, obsługa postępu,
anulowania oraz potwierdzenie zainstalowanego pakietu i podpisu. C1 nie uruchamia
C2/D/E/F, nie zmienia Raspberry ani danych użytkowników, nie przesuwa `rpi-stable`
i nie publikuje Stable 1.1.0.
