# Wspólne buildy i publikacja Ogarniacza

## Kanały

- Każdy `push` do `main` uruchamia **CI**: lint, testy, frontend, backend Raspberry, niepodpisany Android Debug oraz prawdziwy instalator Windows (Inno Setup + .NET WebView2). Artefakty CI są w zakładce **Actions → CI** i nie są produkcyjnymi aktualizacjami.
- Po udanym CI aktualnego `main` workflow **Automatyczna publikacja po CI** uruchamia istniejący **Publikuj Ogarniacza**. Brak zielonego CI albo zmieniony `main` blokują publikację.
- Istniejący workflow kontroluje certyfikat Androida, `versionCode`, publikację APK i gałąź `rpi-stable`. Zmiany wyłącznie w dokumentacji/testach nie muszą tworzyć kolejnej wersji produktu.
- Po udanym nowym wydaniu APK dwa dodatkowe zadania dołączają do **tej samej wersji GitHub Release** pliki `Ogarniacz-X.Y.Z-Setup.exe`, `Ogarniacz-X.Y.Z-Web.tar.gz`, `Ogarniacz-X.Y.Z-RaspberryPi.tar.gz` i sumy SHA-256. Nie są publikowane nieweryfikowane pliki z losowej gałęzi; budowa korzysta z tagu wydania.
- Raspberry Pi nadal pobiera **`rpi-stable`** i uruchamia etapowy instalator z rollbackiem. Samo utworzenie `tar.gz` nie wdraża aplikacji na urządzeniu. PWA i WebView2 otrzymują nowy interfejs po aktualizacji serwera i zatwierdzeniu aktualizacji service workera.

## Windows

Instalator Windows to natywna powłoka WebView2 obsługująca PWA hostowane przez produkcyjny serwer HTTPS; **nie kopiuje** IndexedDB przeglądarki Edge ani danych Androida. Przy pierwszym uruchomieniu podaj pełen adres HTTPS serwera Ogarniacza, np. Tailscale Serve. Do pierwszej instalacji PWA i zalogowania wymagany jest dostęp do tego adresu; po poprawnym zapisaniu offline shell aplikacji może być dostępny przez service worker. WebView2 wymaga Microsoft Edge WebView2 Runtime. Aplikacja Windows używa trwałego profilu `%LOCALAPPDATA%/Ogarniacz/Desktop/WebView2`, który nie jest usuwany przy aktualizacji instalatora.

Zmiana adresu serwera oznacza zmianę źródła danych w IndexedDB; przed zmianą wykonaj kopię danych w aplikacji. Element `Adres serwera…` w menu pozwala świadomie zmienić serwer. `Sprawdź nową wersję instalatora` porównuje wersję z publicznym GitHub Release i otwiera pobranie po zgodzie użytkownika. Nie instaluje niepodpisanego EXE bez pytania. Bez certyfikatu Authenticode Windows może pokazać ostrzeżenie SmartScreen — nie wyłączaj weryfikacji systemowej.

Dla developerów pozostaje `npm run desktop:dev`: start lokalnego Vite i osobne okno Edge. Nie uruchamiaj tego jako wersji produkcyjnej.

## Użytkownik końcowy

- **Windows:** Pobierz `Ogarniacz-X.Y.Z-Setup.exe` z najnowszego GitHub Release i zainstaluj. Aktualizację instalki pobierz po komunikacie; frontend odświeża się przez PWA serwera.
- **Android:** Pobierz podpisany `Ogarniacz-X.Y.Z-release.apk`. Wbudowany updater nadal sprawdza podpis i nie instaluję APK bez zgody użytkownika.
- **Raspberry Pi:** Używaj istniejącego aktualizatora `rpi-stable`, ustawionego timerem lub wywołanego ręcznie.
- **Web/PWA:** Otwórz produkcyjny adres HTTPS i zainstaluj PWA przez Edge/Chrome; service worker oferuje aktualizację po wdrożeniu serwera.

## Bezpieczeństwo i odzyskiwanie

Publikacja produkcyjna potrzebuje tych samych sekretów `android-production`, które są już opisane w `ANDROID_RELEASE.md`. Bez nich release kończy się błędem — **nie stosuj** debug APK jako zamiennika produkcyjnego. Zewnętrzne endpointy synchronizacji pozostają chronione tak jak dotychczas. Nigdy nie publikuj kluczy podpisu.

Jeśli budowa Windows albo paczek Web/Raspberry nie powiedzie się po opublikowaniu APK, cały workflow powinien być oznaczony na czerwono, a release może wymagać uzupełnienia. Nie należy usuwać istniejącego poprawnego APK ani nadpisywać plików `--clobber`; sprawdź logi i wznowienie w kontrolowany sposób. W aktualizacji Raspberry zachowaj backup, status usługi i możliwość rollbacku.

### Testy akceptacyjne

1. PR: `CI` sprawdza wszystkie 3 joby (`web`, `android`, `windows`); Android Debug i paczki na Actions są nieprodukcyjne.
2. `push` do `main`: zakończone sukcesem CI uruchamia jeden workflow publikacji najnowszego SHA.
3. Release: APK ma właściwy fingerprint/versionCode/manifest, instalator Windows jest zbudowany dla identycznego tagu, a sumy SHA-256 są dołączone.
4. Windows: instalacja, logowanie HTTPS, trwały IndexedDB, praca offline po cache, aktualizacja i odinstalowanie bez utraty profilu.
5. RPi: etapowe wdrożenie `rpi-stable` + rollback przy symulacji awarii; PWA: przycisk aktualizacji i niezmienione dane IndexedDB.
6. Publikacja nie uruchamia się przy czerwonym CI, na PR, dla starego SHA, ani wskutek commita samego workflow wydawniczego bez zielonego CI.
