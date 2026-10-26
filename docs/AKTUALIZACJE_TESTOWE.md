# Aktualizacje testowe — Etap A

Zaimplementowano fundament: Ustawienia → Połączenie i aktualizacje →
**Aktualizacje testowe**, metadane uruchomionego frontendu, odczyt GitHub i walidację
kontraktu manifestu. Nie jest to jeszcze kompletny system instalacji Beta.

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

## Kontrakt kanału testowego dla Etapu B

Poniższy kontrakt jest obsługiwany przez czytnik. Workflow `test-build.yml`
**nie został jeszcze dodany**; żaden prerelease nie został opublikowany w ramach Etapu A.

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

Przyszły pipeline ma udostępnić manifest jako plik oraz umieścić identyczny JSON
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

## Numeracja produkcyjna

Domyślne `patch` w **Publikuj Ogarniacza** korzysta ze zmienionego istniejącego
skryptu przygotowania: z `1.0.23` przechodzi do `1.1.0`, następnie do `1.1.1`.
Przygotowane, nieopublikowane `1.0.24` nie zostanie omyłkowo zaakceptowane jako
następne wydanie. Kolejne minor/major działają według dotychczasowej polityki SemVer.
Etap A nie zmienia package.json/package-lock.json i nie publikuje `1.1.0`.

## Pozostałe etapy

1. **B:** ręczny workflow dla dokładnego main po CI, sprawdzanie integralności,
   nieprzesuwane tagi i publiczne prerelease bez dotykania rpi-stable/Stable.
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

Do czasu Etapu B nie ma procedury uruchomienia/pobrania nowego buildu testowego
z GitHub Actions ani z panelu. Można uruchomić lokalnie standardowe `npm run dev`
lub `npm run build` i sprawdzić sam panel. Nie uruchamiaj publikacji produkcyjnej
tylko w celu testowania tego etapu.

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

## Pliki zmienione w tym zadaniu

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
