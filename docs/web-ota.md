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

Workflow `.github/workflows/web-ota.yml` ocenia kazdy push do `main` i automatycznie publikuje tylko zmiany jednoznacznie webowe. Dopuszczone sa `src/**` (`.ts`, `.tsx`, `.css`), `public/**` i `index.html`. Kazda inna lub niejednoznaczna zmiana, w tym `android/**`, zaleznosci i konfiguracja Capacitor, konczy ocene komunikatem `Web OTA pominięte — wymagane APK` wraz z powodem. `workflow_dispatch` pozostaje jawna opcja recznej publikacji i diagnostyki.

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

Automatyczna akcja wylicza `minNativeVersionCode` z wersji w `package.json` tym samym wzorem co `android/app/build.gradle`: `major * 1_000_000 + minor * 1_000 + patch`. Przy `workflow_dispatch` pole `min_native_version_code` pozwala na jawny override; opcjonalny `bundle_version` domyslnie jest skrotem SHA commita. Generator przed podpisaniem sprawdza limit 50 MB, kanal HTTPS, format manifestu, sile klucza i zgodnosc odcisku klucza. Po publikacji pobiera oba assets przez GitHub CLI i porownuje je bajt po bajcie z artefaktami lokalnymi runnera.

Najpierw publikuj ZIP, a manifest na końcu. Nie używaj `/releases/latest` i nie publikuj źródeł React/TypeScript jako danych wykonywalnych przez klienta.
