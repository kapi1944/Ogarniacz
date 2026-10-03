# Android Web OTA — kanał wycofany

Od 2026-10-03 Android jest aktualizowany wyłącznie podpisanym APK.
Przed inicjalizacją Capacitor migracja usuwa stan Web OTA (active, pending,
previous, rejected), klucz serverBasePath i pliki wyłącznie z files/web-ota.
Nie korzysta ze ścieżek usuwania zapisanych w metadanych. Nie czyści danych
IndexedDB/Dexie, konta, sesji, innych ustawień ani plików użytkownika.
Migracja jest idempotentna. Błąd zapisu resetu blokuje start WebView;
czyszczenie pozostawionych plików jest ponawiane przy kolejnym starcie.
Capacitor startuje z domyślnych assets public. Plugin nie jest rejestrowany,
a frontend nie udostępnia Web OTA. Workflow nie publikuje nawet ręcznie.
Raspberry aktualizuje frontend i backend razem z repozytorium; jego PWA
oraz service worker pozostają bez zmian. Fizyczny test migracji Samsunga
wymaga przyszłego podpisanego APK i nie jest zastąpiony testami lokalnymi.

## Historyczna dokumentacja i skrypty (legacy)

# Web OTA Android

Web OTA publikuje wyłącznie gotowy ZIP z zawartością `dist`. Kanał jest niezależny od `latest.json` OTA APK i używa stałego tagu GitHub Release `web-ota`.

Manifest `web-ota.json` zawiera: `bundleVersion`, pełny `commitSha`, absolutny adres HTTPS `url`, `sha256`, `signature`, `minNativeVersionCode` i `publishedAt`.

Podpis `SHA256withRSA` jest liczony z tekstu UTF-8 z polami rozdzielonymi znakiem nowej linii:

```text
ogarniacz-web-ota-v1
bundleVersion
commitSha
url
sha256
minNativeVersionCode
publishedAt
```

Publiczny klucz X.509 PEM należy przed buildem APK umieścić jako `android/web-ota-public-key.pem`. Plik jest ignorowany przez Git; wzór znajduje się w `android/web-ota-public-key.example.pem`. Prywatny klucz nie może trafić do repozytorium — w GitHub Actions powinien być odtwarzany wyłącznie z sekretu na czas podpisania manifestu.

Workflow `.github/workflows/web-ota.yml` uruchamia się automatycznie po zielonym pełnym CI dla pushu do `main` oraz ręcznie wyłącznie z `main`. W obu przypadkach przed publikacją potwierdza sukces CI typu `push` na `main` dla dokładnie tego samego SHA. Buduje i podpisuje bundle z jednego checkoutu ocenionego commita. Publikuje tylko zmiany jednoznacznie webowe od ostatniego punktu zgodności z APK; sprawdza wszystkie pliki dotknięte przez każdy commit po tym punkcie, także gdy późniejszy commit cofnie zmianę lub przeniesie plik. Dopuszczone są `src/**` (`.ts`, `.tsx`, `.css`), `public/**` i `index.html`, z wyłączeniem `src/platform/**`, natywnej konfiguracji runtime, kontroli aktualizacji i potwierdzania gotowości bundle. Każda inna lub niejednoznaczna zmiana, w tym `android/**`, zależności i konfiguracja Capacitor, wymaga najpierw nowego APK oraz zwiększenia `minNativeVersionCode`. Klasyfikatora nie można ominąć ręcznym uruchomieniem: pominięcie raportuje `Web OTA pominięte — wymagane nowe APK` i nie jest błędem pipeline. Pierwsza publikacja Web OTA również wymaga rzeczywistej bezpiecznej zmiany webowej po wydanym APK.

Workflow:

1. zbudować `dist` dla wskazanego commita,
2. spakować zawartość `dist` tak, aby `index.html` był w katalogu głównym ZIP,
3. policzyć SHA-256 ZIP,
4. ustawić minimalny zgodny `versionCode` APK,
5. podpisać dokładnie powyższy tekst prywatnym kluczem,
6. zastąpić assets `web-ota.zip` i `web-ota.json` w release o tagu `web-ota`.

W srodowisku GitHub `web-ota-production` skonfiguruj:

- sekret `WEB_OTA_PRIVATE_KEY` z prywatnym kluczem RSA (minimum 3072 bity),
- zmienna `WEB_OTA_PUBLIC_KEY_SHA256` z SHA-256 publicznego klucza SPKI DER osadzonego w APK.

Odcisk klucza mozna obliczyc lokalnie bez ujawniania klucza prywatnego:

```powershell
openssl pkey -pubin -in android/web-ota-public-key.pem -outform DER | openssl dgst -sha256
```

Jedynym źródłem `minNativeVersionCode` jest `config/web-ota-compatibility.json`. Wartość musi wskazywać publiczne wydanie APK z tagiem i `latest.json` o zgodnych `versionName` oraz `versionCode`. Workflow analizuje wszystkie zmiany od tego tagu do ocenionego commita. Zmiana wymagająca nowego APK musi zwiększyć numer oraz zostać wydana pod odpowiadającym mu tagiem, zanim kolejne Web OTA będzie dozwolone. Opcjonalny `bundle_version` domyślnie jest skrótem SHA commita. Generator przed podpisaniem sprawdza limit 50 MB, kanał HTTPS, format manifestu, siłę klucza i zgodność odcisku klucza. ZIP jest sprawdzany lokalnie i ponownie po wysłaniu przed publikacją manifestu; końcowa weryfikacja sprawdza pobrane assets, `index.html`, SHA-256, podpis, commit SHA i `minNativeVersionCode`.

Najpierw publikuj ZIP, a manifest na końcu. Nie używaj `/releases/latest` i nie publikuj źródeł React/TypeScript jako danych wykonywalnych przez klienta.
