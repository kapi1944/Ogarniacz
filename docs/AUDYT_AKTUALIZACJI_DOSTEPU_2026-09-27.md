# Audyt aktualizacji, kont i dostępu — 2026-09-27

Zakres: lokalny `main` (`e8685a9`) i pliki repozytorium. Nie sprawdzono stanu działającego Raspberry, zainstalowanych APK, jednostek `/etc/systemd/system/` ani konfiguracji GitHub. Wnioski o usuwaniu zgodności zależą od tych odczytów.

## Aktualizacje: przed → po

| Mechanizm | Wyzwalacz, przedmiot i stan | Rollback, potrzeba i nakładanie | Model po audycie |
| --- | --- | --- | --- |
| APK Android | Ustawienia lub kontrola po starcie/powrocie aplikacji; `latest.json` i APK z GitHub Release. Instalator Androida i `StanInstalacjiApk` zapisują przebieg na urządzeniu. Publikacja: ręczny `android:release` albo `android-release.yml`. | Brak automatycznego downgrade APK; ponowienie instalacji i status systemowy. Jedyna pełna aktualizacja natywna; pozostaje. | Bez zmian. APK jest nadrzędne dla natywnej konfiguracji i zgodności Web OTA. |
| Web OTA Android | Ustawienia lub ta sama kontrola; `web-ota.json` i podpisany ZIP `dist`. `web-ota.yml` po zielonym CI lub ręcznie, z klasyfikacją zmian. Stan w `SharedPreferences` i katalogu `files/web-ota`. | Powrót do poprzedniego lub wbudowanego bundle. Daje szybsze poprawki wyłącznie webowe, ale nakłada się na frontend APK; `minNativeVersionCode` i natywna konfiguracja ograniczają konflikt. | Pozostaje jako jeden opcjonalny kanał webowy, bez obejścia bramki APK. |
| PWA/service worker | Przeglądarka rejestruje Workbox; sprawdza nowy shell co 15 minut i po powrocie online. Stan w Cache Storage i rejestracji SW. | Ponowne pobranie poprzedniego builda wymaga przywrócenia serwera; brak osobnego rollbacku. Nie publikuje release ani nie cache'uje `/api/`. | Tylko cache/offline i przeładowanie frontendu po wdrożeniu serwera. |
| Raspberry updater | Właściciel przez `/api/rpi-update`; panel Ustawień nie jest jeszcze zaimplementowany. Trzy jednostki oneshot wywołują jeden `aktualizuj-rpi.sh`. Aktualizuje checkout `main`, zależności, build i usługę. Stan i para SHA w `data/aktualizacja-rpi/`. | Automatyczny powrót po błędzie builda/healthchecku i jedna ręczna akcja `/rollback` w tym samym skrypcie. Konflikt z równoległym `deploy-rpi.sh` i zewnętrznym timerem. | Jedyny docelowy updater Raspberry. Bez timera w repo. |
| `deploy-rpi.sh` | Ręczne wywołanie na Pi; `git pull`, `npm ci`, build, uzgodnienie `ogarniacz.service`, restart. Nie zapisuje własnego stanu ani SHA. | Brak rollbacku. Dubluje bieżącą aktualizację Raspberry; zachowany tymczasowo dla instalacji/przejścia. | Blokuje się przed `git pull`, gdy `RPI_UPDATE_ENABLED=1`; usunięto zalecenie używania go do bieżących aktualizacji. |
| Stary `update.sh` i timery systemd | Nie ma ich w śledzonym drzewie Git ani odwołań wykonawczych repo. Mogą istnieć tylko na działającym Pi. | Nieznane: bez odczytu `/etc/systemd/system/` i crontab nie wolno uznać ich za martwe na urządzeniu. | Nie są częścią modelu. Przed aktywacją updatera należy je wykryć i wyłączyć na Pi; bez zdalnego dostępu nie usuwano ich z urządzenia. |

`configure-tailscale-rpi.sh` jest jednorazową konfiguracją proxy HTTPS, nie updaterem. `sync:doctor`, `android:doctor`, `android:sync`, `android:build` i `android:deploy` są narzędziami diagnostyki/budowy/deweloperskiego wdrożenia; nie stanowią kanałów aktualizacji użytkownika. `ci.yml` weryfikuje build, nie publikuje go. `pwa:smoke` tylko sprawdza artefakt SW.

## Uwierzytelnianie: przed → po

| Element | Stan i autoryzacja | Model po audycie |
| --- | --- | --- |
| Konta, sesje i role | `uzytkownicy`, `czlonkostwa`, `sesje` i `granty_dostepu` w SQLite; sesja w cookie HttpOnly, token w bazie jako hash. Właściciel pełny dostęp, Edytor przez grant modułu. | Jedyny docelowy system użytkownika i uprawnień serwera. Lokalny „Podgląd jako Edytor” nie uwierzytelnia na serwerze. |
| CSRF | Osobny token sesji; wymagany przy zapisach kont/sync oraz akcjach Raspberry. | Pozostaje. |
| `OWNER_BOOTSTRAP_TOKEN` | Tylko pierwsze konto Właściciela na pustym serwerze; po bootstrapie nie tworzy kolejnego. | Jednorazowy klucz instalacyjny; usunąć z live env po utworzeniu konta. |
| `SYNC_USER_ID` i `SYNC_ACCESS_KEY` | Opcjonalny Bearer wyłącznie na `/api/sync/*`, poza sesją i CSRF; daje uprawnienia Właściciela. `SYNC_USER_ID` może też zachować identyfikator danych podczas pierwszego bootstrapu konta. Klient ma jeszcze obsługę `VITE_SYNC_ACCESS_KEY`. | Legacy migracyjne tylko dla aktywnego starszego APK. Zachować do potwierdzenia logowania wszystkich urządzeń i powiązania danych; potem usunąć obie zmienne z live env, zmienną klienta i kod Bearer z obu stron. Nie wkładać klucza do nowego publicznego bundle. |
| Sync API | Sesja albo legacy Bearer, `installationId`, filtr tabel i grantów; zapis sesyjny wymaga CSRF. | Docelowo tylko sesja. Legacy wyłączyć po sprawdzeniu urządzeń. |
| API aktualizacji Raspberry | Tylko sesja Właściciela, CSRF, lokalne połączenie do Node i dozwolony origin. | Pozostaje. Dopuszcza dokładny origin Tailscale z `CORS_ALLOWED_ORIGINS`, aby panel pod prywatnym HTTPS działał. |
| APK i Web OTA | Publiczne manifesty/artefakty HTTPS; APK sprawdza wersję i SHA, Web OTA także podpis i zgodność natywną. | Bez logowania do pobrania; autoryzację publikacji zapewniają workflow i GitHub. |

## Sieć i dostęp

| Droga | Użycie i konflikt | Docelowy stan |
| --- | --- | --- |
| Prywatne HTTPS przez Tailscale Serve | Serve przekazuje do `127.0.0.1:8787`; ten sam origin obsługuje Web/PWA i API. `VITE_SYNC_API_URL` wskazuje go w Androidzie; `CORS_ALLOWED_ORIGINS` dopuszcza dokładny origin PWA oraz `https://localhost` Capacitor. | Preferowana droga. `PUBLIC_URL` nie miało odbiorcy poza parsowaniem env, więc usunięto je z konfiguracji. |
| Surowe HTTP LAN | Historyczny APK może mieć zapisany adres `http://192.168.0.116:8787`; wymaga `HOST=0.0.0.0` i wygenerowanego wyjątku Android Network Security Config dla dokładnego prywatnego hosta. | Tymczasowo tylko dla zweryfikowanego urządzenia. Po migracji APK na HTTPS ustaw `HOST=127.0.0.1`, usuń stary origin LAN i wyjątek z kolejnego APK. Nie dodano wyjątków. |
| Własny origin Capacitor | `https://localhost` w WebView wywołuje to samo API przez `VITE_SYNC_API_URL`; cookie i CSRF. | Pozostaje koniecznym originem klienta Android. |

Równoległe drogi do tego samego API istnieją, gdy `HOST=0.0.0.0` oraz Serve są jednocześnie aktywne: przeglądarka i APK mogą używać zarówno LAN HTTP, jak i HTTPS Tailscale. Jedynym źródłem adresu klienta jest `VITE_SYNC_API_URL` utrwalone natywnie w APK; zmiana builda nie przełącza już zainstalowanego starego APK. `CORS_ALLOWED_ORIGINS` nie jest adresem API, tylko listą originów dopuszczonych do wywołań przeglądarkowych.

## Warunki dalszego usunięcia legacy

1. Na Pi odczytać jednostki, timery i crontab oraz potwierdzić brak uruchomień starego `update.sh` i `deploy-rpi.sh`; dopiero wtedy usunąć ich pozostałości.
2. Na każdym aktywnym Androidzie potwierdzić wersję, adres HTTPS Tailscale, zalogowaną sesję i udaną synchronizację bez Bearer. Potem wyłączyć `SYNC_ACCESS_KEY` i usunąć most z kodu.
3. Po migracji ostatniego APK z LAN przełączyć live `HOST` na loopback i potwierdzić dostęp wyłącznie przez Serve.
