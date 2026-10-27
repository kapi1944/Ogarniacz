# Android

## A. Codzienny development

Włącz na telefonie **Opcje programistyczne → Debugowanie USB**, podłącz go pierwszy raz i zaakceptuj klucz RSA. Dla Wireless Debugging sparuj/połącz telefon narzędziem Android Studio albo standardowymi poleceniami `adb pair` i `adb connect`. Ogarniacz nie tworzy własnego mechanizmu parowania — gdy `adb devices` widzi urządzenie, ten sam pipeline działa przez USB i Wi-Fi.

Androidowy toolchain wymaga Node.js 22 lub nowszego oraz JDK 21.

```bash
npm run android:doctor
npm run android:deploy
```

Doctor sam wyszukuje wymagane przez obecny toolchain JDK 21 (w tym Android Studio JBR), Android SDK oraz `platform-tools/adb`, bez globalnego ustawiania `JAVA_HOME` i `PATH`. Inne wersje JDK pokazuje jako niezgodne. Przy wielu urządzeniach wskaż jedno:

```bash
npm run android:deploy -- --device SERIAL
```

Deploy przed buildem odczytuje pakiet na wskazanym urządzeniu. Dopuszcza nową
instalację lub istniejący pakiet z flagą `DEBUGGABLE`; produkcyjny APK i niepewny
odczyt blokują operację. Następnie buduje frontend, wykonuje Capacitor sync i debug
APK, instaluje przez `adb install -r`, potwierdza wersję i uruchamia aplikację.
Nie odinstalowuje Ogarniacza, nie czyści danych i nie wymusza downgrade.
Debug nie wymaga release keystore. Telefon produkcyjny aktualizuj oficjalnym APK.

### Pobieranie APK po 1.0.18

Stable korzysta z publicznego manifestu
`https://github.com/kapi1944/Ogarniacz/releases/latest/download/latest.json`.
Brak adresu w konfiguracji APK lub błąd jej odczytu włącza to domyślne źródło;
jawnie skonfigurowany adres pozostaje zachowany. Beta nie korzysta ze Stable.
Sprawdzenie i pobranie nie wymagają konta, Tailscale ani Raspberry Pi.
Panel APK pokazuje źródło bez parametrów zapytania i danych logowania.

Manifest i APK obsługują do pięciu przekierowań HTTPS bez danych logowania.
Względny adres APK z GitHub jest rozwiązywany względem przypiętego wydania
z łańcucha przekierowań manifestu, aby zmiana `latest` w trakcie pobierania
nie podmieniła artefaktu. Pozostają weryfikacje rozmiaru i SHA-256.
Przed zgodami i otwarciem sesji instalatora sprawdzane są packageName,
zgodność versionName/versionCode z manifestem, wyższy kod od zainstalowanego
oraz bieżące certyfikaty obu APK. PackageInstaller nadal weryfikuje instalację.
Nie zmieniono applicationId ani klucza Stable.

W panelu APK można wybrać kontrolę co 1, 4, 12 lub 24 godziny albo tylko ręczną.
Domyślne zachowanie pozostaje: kontrola przy uruchomieniu aplikacji, następnie
przy powrocie po co najmniej czterech godzinach. Wybrany okres dotyczy powrotów;
nie dodano usługi sprawdzającej po zamknięciu aplikacji. Tryb ręczny wyłącza też
kontrolę przy uruchomieniu. Ustawienie jest lokalne dla urządzenia, niezależne
od konta i synchronizacji; nie zmienia istniejących rekordów użytkownika.

Zachowane APK można ponowić z globalnego powiadomienia również bez wyniku
kontroli sieciowej. Usunięcie APK z cache przez Androida jest rozpoznawane
przy odczycie stanu i umożliwia ponowne pobranie zamiast nieskutecznego retry.

Próby wymagające fizycznego Samsunga (APK zawierające te zmiany → osobno
zatwierdzony, opublikowany wyższy versionCode): aktualizacja bez konta i z
wyłączonym Tailscale, brak dostępu do Raspberry, zgoda na nieznane aplikacje
i powrót bez/z tą zgodą, systemowe potwierdzenie, anulowanie i retry offline,
restart procesu przed zatwierdzeniem sesji, utrata sieci podczas pobierania,
Auto Blocker/One UI, mało miejsca, odczyt faktycznej nowej wersji i zachowanie
danych po aktualizacji. Bez wyższego wydania pełna instalacja pozostaje
NIETESTOWANA; nie publikuj wersji tylko na potrzeby tej listy.

Weryfikacja publicznego wydania 1.1.0 (2026-10-27): manifest HTTPS
302 → 302 → 200; produkcyjny `PobieranieApk` pobrał przez te same hosty
60 495 024 bajty. SHA-256:
`542e10af89901c6bd0c666ba6378328a9eea0fdff06c492798c0fd8afb515d3d`.
`aapt` potwierdził `pl.ogarniacz.app`, versionCode `1001000`, versionName `1.1.0`;
`apksigner verify` potwierdził podpis i certyfikat z `config/android-release.json`.
To kontrola publicznych artefaktów na JDK, bez instalacji i publikacji APK.

Panel APK ponownie odczytuje zainstalowaną wersję i trwały stan instalatora po
zdarzeniu `aktywny` istniejącego lifecycle. Natywna obsługa potwierdza sukces
odczytem `PackageManager`: zainstalowany `versionCode` musi zgadzać się z celem
aktualizacji, również po ponownym uruchomieniu procesu. Sam wynik
`STATUS_SUCCESS` bez zgodnej wersji nie oznacza zakończonej aktualizacji.
Powrót bez zmiany wersji i bez aktywnej sesji daje `NIEPOTWIERDZONO`, a jawny
wynik anulowania pozostaje `ANULOWANO`. Zweryfikowany APK pozostaje dostępny
do ponowienia. Odczyt wersji i wyniku nie wymaga połączenia z serwerem.

Regresja obejmuje odczyt wersji pakietu i trwałego stanu w Robolectric oraz
wznowienie panelu w jsdom. Fizyczny Samsung wymaga osobnej próby: aktualizacja
oficjalnym podpisanym APK do wyższego `versionCode`, anulowanie instalatora,
powrót bez zmiany wersji i ponowny start aplikacji. Testy automatyczne nie
potwierdzają zachowania systemowego instalatora na urządzeniu.

Ścieżka aktualizacji: `AktualizacjeService` pobiera `latest.json` przez natywny
`CapacitorHttp`, waliduje manifest i rozwiązuje `apkUrl`. `AktualizacjePlugin`
przekazuje transfer do `PobieranieApk`: HTTPS → maksymalnie pięć przekierowań →
strumieniowy zapis `cache/aktualizacje/<nazwa>.apk.part` → fsync → SHA-256 →
dotychczasowa finalizacja i ponowne sprawdzenie SHA-256. Dopiero zweryfikowany
plik może trafić do istniejącego `PackageInstaller`, który egzekwuje zgodność
pakietu, wersji i podpisu. Nie zmieniono klucza ani mechanizmu instalacji.

Odtworzony błąd dotyczy odczytu parametrów Capacitor: `PluginCall.getLong()`
przyjmuje tylko javowy `Long`, a liczby JSON `versionCodeDocelowy: 1000018`
i `rozmiar: 55241786` są odczytywane jako `Integer`. Przed poprawką plugin
zwracał `BLAD_POBIERANIA: Manifest nie zawiera prawidłowej wersji APK.` jeszcze
przed siecią, a UI maskował go komunikatem o internecie. Lokalny odczyt obsługuje
teraz `Integer` i `Long`, nadal odrzucając ułamki i tekst. Ten sam odczyt jest
używany przy uruchamianiu istniejącego instalatora.

Weryfikacja publicznego wydania 1.0.18 (2026-10-20): manifest HTTP 200,
APK `https://github.com/kapi1944/Ogarniacz/releases/latest/download/Ogarniacz-1.0.18-release.apk`
przechodzi HTTPS 302 → 302 → 200 do `release-assets.githubusercontent.com`.
Produkcyjny kod pobierania Java zapisał 55 241 786 bajtów, SHA-256 zgodny
z manifestem: `edd6ad893213ff4db89e8373f8717a72c188bacdccaaaa5ebb09d7bb64c59e46`.
`apksigner verify` potwierdził poprawność podpisu; SHA-256 certyfikatu zgadza się
z `config/android-release.json`. Zarówno poprzedni, jak i obecny `Accept`
otrzymały HTTP 200: hipoteza o HTTP 406 nie została potwierdzona.
`Accept: */*`, `Accept-Encoding: identity` i wyłączenie cache pozostają;
nie przypisujemy im usunięcia odtworzonej przyczyny. Próba na JDK nie potwierdza
stanu sieci/TLS konkretnego Samsunga; przy innym błędzie potrzebny jest log urządzenia.

Timeout połączenia wynosi 15 s, odczytu 30 s. Zerwanie sieci, DNS lub timeout
powodują maksymalnie jedno automatyczne ponowienie po 500 ms (dwie próby łącznie).
Tak samo obsługiwane są przejściowe HTTP 408/500/502/503/504. Każda próba zaczyna od pierwotnego
adresu i bajtu zero z nowym SHA-256; nie używa Range ani nie dokleja danych.
Błąd TLS/certyfikatu (także zagnieżdżony), trwały HTTP, HTTP 429, rozmiaru,
braku miejsca, zapisu lub SHA nie uruchamia automatycznego retry.
Użytkownik może ponowić pobranie po usunięciu przyczyny. Części są usuwane po
błędzie, a równoległe pobieranie we wtyczce jest blokowane.

Diagnostyka rozróżnia `BLAD_SIECI` (DNS/TLS/TIMEOUT/POLACZENIE), `BLAD_HTTP`
(kod HTTP), `BLAD_ROZMIARU`, `BLAD_ZAPISU`, `BRAK_MIEJSCA`, `BLEDNY_SHA`,
`BLAD_FINALIZACJI` oraz dotychczasowe błędy instalatora. Log `AktualizacjeApk`
zawiera wyłącznie kod, etap, rodzaj, HTTP i numer próby; nie zapisuje URL,
Location, query, treści odpowiedzi ani surowego wyjątku sieciowego.
`INTERNET` wystarcza do transferu; prywatny cache nie wymaga uprawnień do
pamięci współdzielonej. `REQUEST_INSTALL_PACKAGES` dotyczy późniejszej instalacji.

Regresja: `PobieranieApkTest`, `AktualizacjePluginTest`,
`AktualizacjeUstawien.test.tsx` i `AktualizacjePrzeplyw.test.ts`.
Testy transportu używają kontrolowanych połączeń i faktycznych plików.
Regresja granicy Capacitor używa Robolectric i rzeczywistego parsowania JSON:
test odtworzył odrzucenie prawidłowej wersji przed naprawą.
Te testy nie zastępują próby HTTPS na fizycznym urządzeniu.
Weryfikacja lokalna poprawki: 39 testów Gradle (18 pluginu, 15 transportu,
6 regresji wycofanego Web OTA), 40 testów frontendowych, typecheck,
build Vite oraz `assembleDebug` zakończone poprawnie.

**Istniejąca 1.0.16:** poprawka natywna działa dopiero po zainstalowaniu APK,
który ją zawiera. Nie naprawia wstecz pobierania działającego w 1.0.16.
Jeśli stary downloader blokuje aktualizację, pobierz przyszły oficjalny APK
przeglądarką i zainstaluj go nad obecną aplikacją, z tym samym podpisem i wyższym
versionCode. Nie odinstalowuj aplikacji ani nie czyść danych. Ten patch nie
podnosi wersji i nie publikuje wydania.

Próba na Samsungu podczas kolejnej aktualizacji:

1. Zainstaluj oficjalny APK zawierający poprawkę; zanotuj wersję i versionCode.
   Dopiero aktualizacja **z tej wersji do następnej wyższej** sprawdza naprawiony
   downloader (np. 1.0.19 → 1.0.20, jeśli te wydania zostaną opublikowane).
2. Uruchom pobieranie w aplikacji. Po części transferu wyłącz sieć na ponad
   30 s. Przywróć połączenie podczas retry albo po komunikacie błędu naciśnij
   „Ponów pobieranie”. Postęp może wrócić do zera; częściowy plik nie może
   uruchomić instalatora.
3. Po pełnym transferze sprawdź etap SHA-256, systemową zgodę/potwierdzenie,
   instalację i nową wersję po ponownym uruchomieniu. Sprawdź zachowanie danych.
4. Przy niepowodzeniu zanotuj kategorię i HTTP w UI oraz pobierz wyłącznie
   diagnostykę updatera: `adb logcat -d -s AktualizacjeApk:W '*:S'`.
   Nie udostępniaj pełnego logcat ani podpisanych adresów CDN.

## B. Tworzenie release

### Eksport kopii po 1.0.16

„Zapisz plik JSON” korzysta z systemowego `ACTION_CREATE_DOCUMENT` (Storage Access
Framework), z nazwą kopii i MIME `application/json`. Nie zapisuje już po cichu
w `Documents/Ogarniacz`. Użytkownik wybiera lokalizację, także Google Drive,
jeśli zainstalowany i zalogowany dostawca dokumentów udostępnia go w tym oknie.
Nie wymaga to osobnej integracji z API Drive ani uprawnienia do całej pamięci.

`ZAPISANO` oznacza zamknięcie strumienia zapisu oraz zgodność SHA-256 pełnego
odczytu dokumentu z wysłanymi bajtami UTF-8. `ANULOWANO` odpowiada anulowaniu
wyboru; brak URI, odmowa dostępu, błąd zapisu/odczytu lub niezgodna zawartość dają
`BŁĄD`. Przy błędzie dostawcy może pozostać częściowy dokument; nie usuwamy go
automatycznie. Potwierdzenie dotyczy dostawcy dokumentów, a nie zakończenia jego
ewentualnego przesyłania do chmury. Kopia ochronna przed restore korzysta z tej
samej ścieżki; anulowanie lub błąd zatrzymuje przywracanie przed zapisem danych.

„Udostępnij backup” wysyła sam plik, bez opisu, URL ani tematu. Istniejący
Capacitor Share nadaje MIME JSON, zamienia `file://` na `content://` oraz dodaje
`EXTRA_STREAM`, `ClipData` i `FLAG_GRANT_READ_URI_PERMISSION`. Manifest rejestruje
wymagany `FileProvider` z dostępem tylko do `cache/eksport/`. Przed wysłaniem
sprawdzamy rzeczywisty plik, dozwolony katalog, MIME i pełny odczyt przez provider.
Każde udostępnienie ma własny katalog, aby nie nadpisać załącznika czytanego przez
odbiorcę. Nie usuwamy go zaraz po zamknięciu okna; nadal podlega czyszczeniu cache
przez Androida. Wybór aplikacji nie potwierdza zapisania pliku w Drive. Capacitor
nie zawsze rozróżnia zamknięcie okna od wyboru celu; wtedy UI pokazuje brak
potwierdzenia, nigdy `ZAPISANO`.

Zmiana obejmuje bridge natywny i jego rejestrację w `MainActivity`, dlatego wymaga
nowego oficjalnego APK. Klasyfikator publikacji rozpoznaje `android/` i pliki
platformy jako zmiany wymagające APK; istniejący workflow z `main` wykona sync
i dołączy je do następnego zatwierdzonego wydania. Ta naprawa nie podbija wersji
i nie uruchamia wydania ani aktualizacji Raspberry. AES-GCM, koperta v1, formaty
wewnętrzne v1–v3 i istniejące dane pozostają bez zmian.

Testy automatyczne: `FileService.test.ts`, `ShareService.test.ts`,
`BackupUstawien.test.tsx`, regresja `BackupService.test.ts` i `BackupProfili.test.ts`.
`EksportPlikuPluginTest` używa Robolectric (tylko zależność testowa), testowego
dostawcy dokumentów oraz faktycznego FileProvider i Capacitor Share. CI Android
uruchamia całą klasę na Linuksie. AndroidX 1.17.0 sprawdza przynależność do katalogu
z separatorem `/`, a Robolectric na Windows przekazuje ścieżki z `\`. Powodowało
to dwa błędy `Failed to find configured root that contains`. Lokalny shadow testowy
normalizuje separator hosta przed wywołaniem oryginalnego `removeTrailingSlash`;
oryginalne kontrole katalogu, kanonikalizacja, odczyt i Capacitor Share pozostają
wykonywane. Testy odrzucają sąsiedni katalog, APK i próbę wyjścia przez `..`.
Manifest i produkcyjny FileProvider pozostają bez zmian: tylko `cache/eksport/`,
`exported=false`, tymczasowe uprawnienia URI i authority zależne od applicationId.
Stable/Debug używają `pl.ogarniacz.app`, Beta — `pl.ogarniacz.app.beta`.
Aktualizator przekazuje APK do sesji PackageInstaller przez strumień, bez
udostępniania katalogu `cache/aktualizacje/` przez FileProvider.
Nie zastępuje to testu prawdziwego odbiorcy działającego z innym UID.

Próba na fizycznym Samsungu z APK zawierającym poprawkę (bez odinstalowywania
aplikacji i bez czyszczenia danych):

1. Utwórz zaszyfrowaną kopię; zapisz do wybranego folderu lokalnego. Sprawdź
   `ZAPISANO`, obecność i rozmiar JSON. Wczytaj plik, odszyfruj i sprawdź manifest;
   nie uruchamiaj przywracania danych.
2. Powtórz przez systemowy wybór Drive, jeśli jest dostępny. Sprawdź plik również
   w Drive, pobierz go i sprawdź odszyfrowanie oraz manifest.
3. Udostępnij do Drive i drugiej aplikacji obsługującej pliki. Potwierdź odbiór
   rzeczywistego JSON, bez tekstu zastępującego plik, oraz poprawne odszyfrowanie.
   Sam wybór aplikacji lub powrót z okna nie jest dowodem zapisu.
4. Anuluj okno zapisu i udostępniania. Sprawdź `ANULOWANO` albo uczciwy brak
   potwierdzenia dla niejednoznacznego wyniku share. Nie może pojawić się sukces.
5. Na danych testowych sprawdź niedostępnego dostawcę, brak miejsca, odmowę
   dostępu i utratę sieci Drive. Błąd nie może być przedstawiony jako zapis.

Dokumentacja platformy: [SAF](https://developer.android.com/training/data-storage/shared/documents-files)
i [Capacitor Share](https://capacitorjs.com/docs/apis/share).

Jeden release keystore oraz alias `ogarniacz` muszą być zachowane do wszystkich kolejnych wydań. Ich utrata uniemożliwi aktualizowanie już zainstalowanej aplikacji. Jednorazowe utworzenie klucza poza repozytorium:

```bash
npm run android:keystore:create
```

`keytool` poprosi interaktywnie o hasła; skrypt ich nie zapisuje ani nie wyświetla. Następnie skopiuj `android/keystore.properties.example` do ignorowanego `android/keystore.properties`, ustaw ścieżkę do tego samego pliku `.jks` i uzupełnij sekrety. Nie commituj żadnego z tych plików. Kopię keystore i haseł przechowuj w bezpiecznym miejscu.

Proces bez przekazywania hasła przez terminal lub logi można wykonać jednorazowo automatycznie:

```bash
npm run android:keystore:create -- --automatycznie
```

Skrypt generuje kryptograficznie losowe hasło, przekazuje je do `keytool` przez zmienną środowiskową i zapisuje wyłącznie w ignorowanym `android/keystore.properties`. Keystore pozostaje w `~/.ogarniacz/keys/ogarniacz-release.jks`. Skrypt nie nadpisze istniejącego klucza ani konfiguracji. Koniecznie wykonaj zaszyfrowaną kopię obu plików; utrata któregokolwiek uniemożliwi kolejne wydania. Hasło nie pojawia się w logach.

Wersja pochodzi wyłącznie z `package.json`; Gradle wylicza `versionCode` jako
`major * 1000000 + minor * 1000 + patch`. Wersję publikowaną przygotowuje workflow
**Publikuj Ogarniacza**. Nie podbijaj jej ręcznie dla lokalnego testu.

### Signed release i manifest

Build aplikacji musi znać pełne adresy HTTPS manifestu APK oraz serwera synchronizacji. Gradle zapisuje je w `BuildConfig`, a `RuntimeConfig` przekazuje je frontendowi przez natywny bridge. Android Web OTA jest wycofany. Wersja webowa może dostarczyć równoważne wartości przez `window.__OGARNIACZ_RUNTIME_CONFIG__`; zmienne `VITE_*` pozostają fallbackiem developmentu.

```powershell
VITE_ANDROID_UPDATE_MANIFEST_URL=https://github.com/kapi1944/Ogarniacz/releases/latest/download/latest.json
```

Można je nadpisać zmienną procesu albo w lokalnym, ignorowanym `.env.production.local`:

```powershell
$env:VITE_ANDROID_UPDATE_MANIFEST_URL='https://github.com/kapi1944/Ogarniacz/releases/latest/download/latest.json'
npm run android:release
```

Produkcyjny manifest APK jest pobierany z GitHub Releases. Serwer Raspberry nie pośredniczy w aktualizacji APK; adres źródła można zmienić podczas budowania bez zmiany logiki instalatora.

Opcjonalny absolutny `apkUrl`:

```bash
npm run android:release -- --base-url https://example.com/updates/
```

Informacje pokazywane w panelu aktualizacji można dodać bezpośrednio albo z pliku:

```powershell
npm run android:release -- --release-notes "Poprawki stabilności i panelu OTA."
npm run android:release -- --release-notes-file .\informacje-o-wydaniu.md
```

Skrypt odnajduje wynik Gradle dynamicznie i wypisuje jego pełną ścieżkę. Standardowo artefakty powstają w `android/app/build/outputs/apk/release/`:

- `Ogarniacz-X.Y.Z-release.apk` — podpisany APK;
- `Ogarniacz-X.Y.Z-release.apk.sha256` — suma SHA-256;
- `latest.json` — `versionName`, `versionCode`, `apkUrl`, SHA-256, rozmiar, opcjonalne informacje o wydaniu i czas publikacji.

`android:release` bez opcji publikacji tworzy wyłącznie lokalne artefakty testowe;
dopuszcza ponowne zbudowanie aktualnie opublikowanej wersji, zachowując kontrolę
podpisu i blokadę starszego versionCode. Publikuje tylko **Publikuj Ogarniacza**.
Opcje `--publish` i `--publish-existing` wymagają dokładnego kontekstu tego workflow
na `main`; lokalny token ani zapisane poświadczenia Git nie odblokowują publikacji.
Wznowienie oryginalnych artefaktów jest dostępne tylko przez osobny zatwierdzony
workflow opisany w `ANDROID_RELEASE.md`. Nie przesyłaj lokalnych plików ręcznie.

## C. OTA bez kabla

### Weryfikacja sesyjnej synchronizacji na fizycznym Samsungu

Po zbudowaniu nowego APK z jawną, procesową zmienną `VITE_SYNC_API_URL` wskazującą prywatny HTTPS Tailscale:

1. Zainstaluj nowy APK jako aktualizację; nie odinstalowuj działającej aplikacji ani nie czyść jej danych.
2. Uruchom Ogarniacza i zaloguj konto Właściciela.
3. Wejdź w **Ustawienia → Synchronizacja → Diagnostyka synchronizacji**. Potwierdź: `Android`, host Tailscale, `HTTPS`, `zalogowany`, `Właściciel`, CSRF `dostępny` i autoryzację klienta `sesja`.
4. Utwórz na telefonie testowe zadanie i użyj **Synchronizuj teraz**.
5. Potwierdź pojawienie się zadania w Ogarniaczu na Raspberry Pi lub w Web.
6. Utwórz drugi testowy rekord w Web i użyj synchronizacji; potwierdź rekord na telefonie.
7. Zamknij aplikację całkowicie z ekranu ostatnich aplikacji.
8. Uruchom ją ponownie. Diagnostyka musi ponownie wskazać `zalogowany`, CSRF `dostępny` oraz `sesja`; wykonaj **Synchronizuj teraz** bez ponownego logowania.

`401` oznacza brak albo wygaśnięcie sesji i wymaga ponownego logowania. `403` z informacją o CSRF oznacza, że klient odświeża sesję i ponawia zapis; jeśli błąd pozostaje, zatrzymaj migrację. Konflikt synchronizacji ma status „wymaga decyzji” oraz kartę konfliktu w tym panelu — wybierz wersję lokalną albo zdalną dopiero po sprawdzeniu obu rekordów.

Po przejściu tego scenariusza na wszystkich aktywnych Androidach stara ścieżka uwierzytelnienia synchronizacji została usunięta. Zatrzymaj kolejne wdrożenie przy HTTP/LAN/innym hoście, `niezalogowany` po restarcie, braku CSRF, 401, powtarzalnym 403 CSRF, braku rekordu po sync albo konflikcie bez świadomego rozstrzygnięcia.

W **Ustawienia → Informacje o aplikacji** przycisk **Sprawdź aktualizacje** pobiera `latest.json`, porównuje `versionCode`, pobiera nowszy APK do prywatnej pamięci podręcznej, sprawdza SHA-256 i otwiera systemowy instalator przez `content://` z `FileProvider`. Android wymaga potwierdzenia instalacji. Przy pierwszej próbie może też otworzyć zgodę **Instaluj nieznane aplikacje** dla Ogarniacza; zgoda nie jest żądana przy starcie aplikacji.

Źródło powinno udostępniać manifest oraz APK przez HTTPS. To stały release key pozwala Androidowi potwierdzić, że nowy APK jest aktualizacją tej samej aplikacji; SHA-256 dodatkowo wykrywa uszkodzenie pobranego pliku. Przy błędnej sumie plik tymczasowy jest usuwany, a instalator nie zostaje uruchomiony.

Kolejne OTA muszą mieć wyższy `versionCode`, ten sam `applicationId` i podpis z tego samego stałego keystore. Publikuj najpierw APK, a `latest.json` jako ostatni plik, aby manifest nigdy nie wskazywał niegotowego artefaktu. Aktualizacja nie odinstalowuje aplikacji i zachowuje IndexedDB oraz pozostałe dane prywatne.

### Test opublikowanego APK przez GitHub Releases

Warunkiem jest zainstalowana bazowa wersja **release** Ogarniacza, podpisana tym samym stałym keystore i z wbudowanym adresem GitHub z `.env.production`. Jeśli telefon ma wersję debug albo starszy build bez tego adresu, wykonaj jednorazowe przejście opisane w sekcji D.

Publikację wykonuje workflow opisany w `docs/ANDROID_RELEASE.md`. Klasyfikuje zmiany obu kanałów; wersję APK przygotowuje tylko wtedy, gdy Android wymaga publikacji.

1. Po zatwierdzonym wydaniu na Galaxy S23+ otwórz **Ogarniacz → Ustawienia → Informacje o aplikacji → Sprawdź aktualizacje**. Panel pokaże dostępną wersję i informacje o wydaniu.
2. Wybierz **Pobierz i zainstaluj**. Ogarniacz pokaże postęp, pobierze APK i sprawdzi SHA-256.
3. Jeśli Android otworzy ekran **Instaluj nieznane aplikacje**, zezwól Ogarniaczowi, wróć do aplikacji i wybierz **Uruchom instalator**.
4. W systemowym instalatorze potwierdź aktualizację. Cicha instalacja nie jest używana.
5. Po instalacji uruchom Ogarniacza i sprawdź w panelu nową wersję. Komputer, ADB i Raspberry Pi nie uczestniczą w tych krokach.

## D. Jednorazowe przejście debug → release

Debug APK i release APK są podpisane różnymi kluczami. Android nie zainstaluje release jako aktualizacji debug i nie należy obchodzić tej ochrony.

1. W działającej wersji debug przejdź do **Ustawienia → Dane / Backup**.
2. Pozostaw wszystkie sekcje zaznaczone, wybierz **Utwórz backup**, a następnie **Zapisz plik JSON** lub **Udostępnij backup**.
3. Potwierdź, że plik JSON znajduje się poza prywatnymi danymi aplikacji. Dopiero wtedy odinstaluj wersję debug.
4. Zainstaluj release APK podpisany stałym kluczem i uruchom aplikację.
5. W tym samym panelu wybierz **Wybierz backup do restore**, sprawdź zweryfikowany manifest i przywróć wszystkie sekcje.
6. Kolejne wersje instaluj już przez OTA. Nie wymagają ponownego eksportu ani odinstalowania.

Nie odinstalowuj debug, jeśli backup nie został zapisany i zweryfikowany. `android:deploy` nie zastąpi potem release, ponieważ celowo używa klucza debug.

## Lokalna blokada aplikacji Android

Ustawienia → Konta i uprawnienia → Blokada aplikacji → Konfiguruj blokadę aplikacji.
Domyślnie wyłączona. Natywny formularz pozwala ustawić PIN 4–12 cyfr albo hasło
minimum 8 znaków bez białych znaków, z dwukrotnym potwierdzeniem. Zmiana kodu,
czasu, opcji restartu i wyłączenie wymagają aktualnego kodu. Puste nowe pola
zachowują dotychczasowy kod. Nie ma odzyskiwania zapomnianego kodu.

Czas jest liczony od przejścia w tło: natychmiast, 1/5/15/30/60 minut.
Osobna opcja wymusza odblokowanie po utworzeniu aktywności, także po śmierci
procesu; po jej wyłączeniu nadal obowiązuje zapamiętany czas tła.
Osłona natywna zakrywa WebView przy pauzie i przed pierwszym wyświetleniem.
FLAG_SECURE chroni okno i podgląd ostatnich aplikacji przy włączonej blokadzie.

Oddzielne prywatne SharedPreferences przechowują konfigurację, losową sól,
PBKDF2-HMAC-SHA256 (600000 iteracji) uwierzytelnione HMAC-SHA256 z nieeksportowalnym
kluczem Android Keystore oraz trwały licznik prób. Pięć błędów wymusza minutę
przerwy; kolejne błędy ponawiają przerwę. Cofnięcie zegara blokuje próby do
wyrównania czasu. Sekrety nie trafiają do WebView, synchronizacji ani backupu.
Blokada nie szyfruje bazy i nie wylogowuje konta. Nie zmienia schematów danych,
Web/PWA, serwera ani aktualizacji APK. Utrata klucza kończy się odmową dostępu.

Testy Robolectric sprawdzają konfigurację, błędny kod, zmianę i wyłączenie,
limit po odtworzeniu obiektu, czas tła i restart. Używają testowego klucza HMAC;
nie potwierdzają sprzętowego Keystore ani zachowania One UI. Samsung wymaga
próby w trybie samolotowym: PIN/hasło, wszystkie czasy, przycisk Wstecz,
tło/ostatnie aplikacje, zabicie procesu, restart telefonu, limit prób,
zmiana/wyłączenie z błędnym i poprawnym kodem oraz zachowanie prawdziwych danych
i zalogowanej sesji. Nie czyść danych aplikacji podczas tych prób.
