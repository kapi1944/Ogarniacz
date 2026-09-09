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

Workflow `.github/workflows/web-ota.yml` ocenia kazdy push do `main` i reczne uruchomienie. Automatycznie publikuje tylko zmiany jednoznacznie webowe od ostatniego punktu zgodnosci z APK. Dopuszczone sa `src/**` (`.ts`, `.tsx`, `.css`), `public/**` i `index.html`. Kazda inna lub niejednoznaczna zmiana, w tym `android/**`, zaleznosci i konfiguracja Capacitor, wymaga najpierw nowego APK oraz zwiekszenia `minNativeVersionCode`. `workflow_dispatch` z jawnym `force_web_ota` moze ominac tylko klasyfikacje plikow i zapisuje wyrazne ostrzezenie w logu; nigdy nie omija wymaganego tagu zgodnego APK.

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

Jedynym zrodlem `minNativeVersionCode` jest `config/web-ota-compatibility.json`. Pierwsza wartosc `1000007` rezerwuje Web OTA dla bootstrapowego APK 1.0.7. Workflow wymaga istniejacego tagu wydanego APK wynikajacego z tego kodu (`v1.0.7`) i analizuje wszystkie zmiany od tego tagu do `HEAD`. Zmiana wymagajaca nowego APK musi zwiekszyc numer oraz zostac wydana pod odpowiadajacym mu tagiem, zanim kolejne Web OTA bedzie dozwolone. Opcjonalny `bundle_version` domyslnie jest skrotem SHA commita. Generator przed podpisaniem sprawdza limit 50 MB, kanal HTTPS, format manifestu, sile klucza i zgodnosc odcisku klucza. Po publikacji pobiera oba assets przez GitHub CLI i porownuje je bajt po bajcie z artefaktami lokalnymi runnera.

Najpierw publikuj ZIP, a manifest na końcu. Nie używaj `/releases/latest` i nie publikuj źródeł React/TypeScript jako danych wykonywalnych przez klienta.
