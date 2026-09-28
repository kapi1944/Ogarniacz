# Audyt aktualizacji, kont i dostępu — 2026-09-27

Zakres: lokalny `main` oraz pliki repozytorium po potwierdzonej weryfikacji sesyjnej synchronizacji na fizycznym Androidzie. Stan implementacji uzupełniono po commitach do `5e3a6de` (2026-09-28). Nie edytowano ani nie zweryfikowano w tym audycie konfiguracji `/etc/ogarniacz/ogarniacz.env` na działającym Raspberry.

## Aktualizacje: przed → po

| Mechanizm | Wyzwalacz, przedmiot i stan | Rollback, potrzeba i nakładanie | Model po audycie |
| --- | --- | --- | --- |
| APK Android | Ustawienia lub kontrola po starcie/powrocie aplikacji; `latest.json` i APK z GitHub Release. Instalator Androida i `StanInstalacjiApk` zapisują przebieg na urządzeniu. Publikacja: ręczny `android:release` albo `android-release.yml`. | Brak automatycznego downgrade APK; ponowienie instalacji i status systemowy. Jedyna pełna aktualizacja natywna; pozostaje. | Bez zmian. APK jest nadrzędne dla natywnej konfiguracji i zgodności Web OTA. |
| Web OTA Android | Ustawienia lub ta sama kontrola; `web-ota.json` i podpisany ZIP `dist`. `web-ota.yml` po zielonym CI lub ręcznie, z klasyfikacją zmian. Stan w `SharedPreferences` i katalogu `files/web-ota`. | Powrót do poprzedniego lub wbudowanego bundle. Daje szybsze poprawki wyłącznie webowe, ale nakłada się na frontend APK; `minNativeVersionCode` i natywna konfiguracja ograniczają konflikt. | Pozostaje jako jeden opcjonalny kanał webowy, bez obejścia bramki APK. |
| PWA/service worker | Przeglądarka rejestruje Workbox; sprawdza nowy shell co 15 minut i po powrocie online. Stan w Cache Storage i rejestracji SW. | Ponowne pobranie poprzedniego builda wymaga przywrócenia serwera; brak osobnego rollbacku. Nie publikuje release ani nie cache'uje `/api/`. | Tylko cache/offline i przeładowanie frontendu po wdrożeniu serwera. |
| Raspberry updater | Webowy panel Ustawień Właściciela korzysta z `/api/rpi-update`; na Androidzie widoczne są osobne panele APK i Web OTA. Trzy jednostki oneshot wywołują jeden `aktualizuj-rpi.sh`. Aktualizuje checkout `main`, zależności, build i usługę. Stan i para SHA w `data/aktualizacja-rpi/`; API jest domyślnie wyłączone przez `RPI_UPDATE_ENABLED`. | Automatyczny powrót po błędzie `npm ci`, builda, restartu lub healthchecku i jedna ręczna akcja `/rollback` w tym samym skrypcie. `flock` oraz kontrola jednostki chronią przed równoległym uruchomieniem; stary zewnętrzny timer wymaga sprawdzenia na Pi. | Jedyny docelowy updater Raspberry. Bez timera w repo; instalacja jednostek i działanie na Pi pozostają do potwierdzenia. |
| `deploy-rpi.sh` | Ręczne wywołanie na Pi; `git pull`, `npm ci`, build, uzgodnienie `ogarniacz.service`, restart. Nie zapisuje własnego stanu ani SHA. | Brak rollbacku. Dubluje bieżącą aktualizację Raspberry; zachowany tymczasowo dla instalacji/przejścia. | Blokuje się przed `git pull`, gdy `RPI_UPDATE_ENABLED=1`; usunięto zalecenie używania go do bieżących aktualizacji. |
| Stary `update.sh` i timery systemd | Nie ma ich w śledzonym drzewie Git ani odwołań wykonawczych repo. Mogą istnieć tylko na działającym Pi. | Nieznane: bez odczytu `/etc/systemd/system/` i crontab nie wolno uznać ich za martwe na urządzeniu. | Nie są częścią modelu. Przed aktywacją updatera należy je wykryć i wyłączyć na Pi; bez zdalnego dostępu nie usuwano ich z urządzenia. |

`configure-tailscale-rpi.sh` jest jednorazową konfiguracją proxy HTTPS, nie updaterem. `sync:doctor`, `android:doctor`, `android:sync`, `android:build` i `android:deploy` są narzędziami diagnostyki/budowy/deweloperskiego wdrożenia; nie stanowią kanałów aktualizacji użytkownika. `ci.yml` weryfikuje build, nie publikuje go. `pwa:smoke` tylko sprawdza artefakt SW.

## Uwierzytelnianie: przed → po

| Element | Stan i autoryzacja | Model po audycie |
| --- | --- | --- |
| Konta, sesje i role | `uzytkownicy`, `czlonkostwa`, `sesje` i `granty_dostepu` w SQLite; sesja w cookie HttpOnly, token w bazie jako hash. Właściciel pełny dostęp, Edytor przez grant modułu. | Jedyny docelowy system użytkownika i uprawnień serwera. Lokalny „Podgląd jako Edytor” nie uwierzytelnia na serwerze. |
| CSRF | Osobny token sesji; wymagany przy zapisach kont/sync oraz akcjach Raspberry. | Pozostaje. |
| `OWNER_BOOTSTRAP_TOKEN` | Tylko pierwsze konto Właściciela na pustym serwerze; po bootstrapie nie tworzy kolejnego. | Jednorazowy klucz instalacyjny; usunąć z live env po utworzeniu konta. |
| Stara autoryzacja synchronizacji | Ścieżka migracyjna została usunięta po weryfikacji aktywnego Androida. | Brak alternatywnego uwierzytelnienia synchronizacji. |
| Sync API | Sesja, `installationId`, filtr tabel i grantów; każdy zapis wymaga CSRF. | Wyłącznie konto i sesja. |
| API aktualizacji Raspberry | Tylko sesja Właściciela, CSRF, lokalne połączenie do Node i dozwolony origin. | Pozostaje. Dopuszcza dokładny origin Tailscale z `CORS_ALLOWED_ORIGINS`, aby panel pod prywatnym HTTPS działał. |
| APK i Web OTA | Publiczne manifesty/artefakty HTTPS; APK sprawdza wersję i SHA, Web OTA także podpis i zgodność natywną. | Bez logowania do pobrania; autoryzację publikacji zapewniają workflow i GitHub. |

## Sieć i dostęp

| Droga | Użycie i konflikt | Docelowy stan |
| --- | --- | --- |
| Prywatne HTTPS przez Tailscale Serve | Serve przekazuje do `127.0.0.1:8787`; ten sam origin obsługuje Web/PWA i API. Produkcyjny Android ma adres HTTPS zapisany w APK; `CORS_ALLOWED_ORIGINS` dopuszcza dokładny origin PWA oraz `https://localhost` Capacitor. Backend domyślnie nasłuchuje na `127.0.0.1`. | Produkcyjna droga dostępu. `PUBLIC_URL` nie miało odbiorcy poza parsowaniem env, więc usunięto je z konfiguracji. |
| Surowe HTTP LAN | Historyczny APK mógł mieć zapisany prywatny adres i wymagać `HOST=0.0.0.0`. Zweryfikowany produkcyjny Android korzysta już z HTTPS Tailscale; bieżący build Androida nie dopuszcza cleartext HTTP. | Usunięte z produkcyjnej ścieżki kodu. Jeśli live env nadal jawnie ustawia `HOST=0.0.0.0`, ręczne przełączenie na loopback wymaga potwierdzenia pozostałych aktywnych klientów. |
| Własny origin Capacitor | `https://localhost` w WebView wywołuje to samo API przez `VITE_SYNC_API_URL`; cookie i CSRF. | Pozostaje koniecznym originem klienta Android. |

Jeśli live env nadal ustawia `HOST=0.0.0.0`, surowy port może pozostawać dostępny równolegle z Serve; stan urządzenia trzeba sprawdzić osobno. Adres serwera synchronizacji jest utrwalony w konfiguracji natywnej APK z `VITE_SYNC_API_URL` podanego przy buildzie, więc nowy build nie przełącza już zainstalowanego starego APK. `CORS_ALLOWED_ORIGINS` nie jest adresem API, tylko listą dokładnych originów HTTPS dopuszczonych do wywołań przeglądarkowych.

## Stan po usunięciu zgodności migracyjnej

1. Na Pi odczytać jednostki, timery i crontab oraz potwierdzić brak uruchomień starego `update.sh` i `deploy-rpi.sh`; dopiero wtedy wyłączyć ich pozostałości i włączyć nowy aktualizator.
2. Aktywny Android został potwierdzony na HTTPS Tailscale, zalogowanej sesji, synchronizacji w obu kierunkach i odtworzeniu sesji po restarcie. Alternatywna autoryzacja sync została usunięta z kodu i przykładów konfiguracji.
3. Po potwierdzeniu wszystkich aktywnych klientów na HTTPS Tailscale przełączyć live `HOST` na loopback i potwierdzić dostęp wyłącznie przez Serve.
