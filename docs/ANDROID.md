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

Deploy buduje frontend, wykonuje Capacitor sync i debug APK, instaluje przez `adb install -r -d`, potwierdza wersję pakietu i uruchamia aplikację. Nie odinstalowuje Ogarniacza, więc zachowuje jego dane. Debug nie wymaga release keystore.

## B. Tworzenie release

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

Wersja pochodzi wyłącznie z `package.json`; Gradle wylicza `versionCode` jako `major * 1000000 + minor * 1000 + patch`. Przed kolejnym wydaniem podbij ją jednym z poleceń:

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

### Signed release i manifest

Build aplikacji przeznaczonej do aktualizacji musi znać pełny adres HTTPS manifestu. Jedynym punktem konfiguracji klienta jest `VITE_ANDROID_UPDATE_MANIFEST_URL` (odpowiednik `UPDATE_MANIFEST_URL` dla Vite). Repozytorium ma obecnie ustawione w `.env.production` źródło GitHub Releases:

```powershell
VITE_ANDROID_UPDATE_MANIFEST_URL=https://github.com/kapi1944/Ogarniacz/releases/latest/download/latest.json
```

Można je nadpisać zmienną procesu albo w lokalnym, ignorowanym `.env.production.local`:

```powershell
$env:VITE_ANDROID_UPDATE_MANIFEST_URL='https://github.com/kapi1944/Ogarniacz/releases/latest/download/latest.json'
npm run android:release
```

Późniejsza migracja na Raspberry Pi wymaga wyłącznie zmiany tego URL-a podczas budowania. Logika pobierania i instalacji pozostaje bez zmian.

Opcjonalny absolutny `apkUrl`:

```bash
npm run android:release -- --base-url https://ogarniacz.local/updates/
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

W GitHub Release dodaj wszystkie trzy pliki jako assets. Względny `apkUrl` z manifestu zostanie rozwiązany względem `releases/latest/download/`, więc nie trzeba wpisywać domeny GitHuba do manifestu. Repozytorium i release muszą być publiczne, ponieważ aplikacja nie przechowuje tokenu GitHub. Nie oznaczaj wydania jako draft ani prerelease, bo endpoint `/releases/latest/` ich nie wybiera. Klient nie jest związany z GitHubem ani konkretną domeną.

## C. OTA bez kabla

W **Ustawienia → Informacje o aplikacji** przycisk **Sprawdź aktualizacje** pobiera `latest.json`, porównuje `versionCode`, pobiera nowszy APK do prywatnej pamięci podręcznej, sprawdza SHA-256 i otwiera systemowy instalator przez `content://` z `FileProvider`. Android wymaga potwierdzenia instalacji. Przy pierwszej próbie może też otworzyć zgodę **Instaluj nieznane aplikacje** dla Ogarniacza; zgoda nie jest żądana przy starcie aplikacji.

Źródło powinno udostępniać manifest oraz APK przez HTTPS. To stały release key pozwala Androidowi potwierdzić, że nowy APK jest aktualizacją tej samej aplikacji; SHA-256 dodatkowo wykrywa uszkodzenie pobranego pliku. Przy błędnej sumie plik tymczasowy jest usuwany, a instalator nie zostaje uruchomiony.

Kolejne OTA muszą mieć wyższy `versionCode`, ten sam `applicationId` i podpis z tego samego stałego keystore. Publikuj najpierw APK, a `latest.json` jako ostatni plik, aby manifest nigdy nie wskazywał niegotowego artefaktu. Aktualizacja nie odinstalowuje aplikacji i zachowuje IndexedDB oraz pozostałe dane prywatne.

### Pierwsze prawdziwe OTA przez GitHub Releases

Warunkiem jest zainstalowana bazowa wersja **release** Ogarniacza, podpisana tym samym stałym keystore i z wbudowanym adresem GitHub z `.env.production`. Jeśli telefon ma wersję debug albo starszy build bez tego adresu, wykonaj jednorazowe przejście opisane w sekcji D.

1. Na komputerze upewnij się, że `main` jest czysty, a `android/keystore.properties` wskazuje dokładnie ten sam zachowany keystore, którym podpisano wersję na Galaxy S23+.
2. Podbij wersję, np. `npm run version:patch`. Nowy `versionCode` musi być większy od zainstalowanego.
3. Uruchom `npm run android:release -- --release-notes-file .\informacje-o-wydaniu.md`.
4. W GitHubie utwórz zwykły, publiczny release (nie draft/prerelease), najlepiej z tagiem zgodnym z wersją, np. `v1.0.3`.
5. Dodaj jako assets pliki z `android/app/build/outputs/apk/release/`: `Ogarniacz-X.Y.Z-release.apk`, `Ogarniacz-X.Y.Z-release.apk.sha256` oraz `latest.json`. Opublikuj release dopiero po dodaniu kompletu.
6. Na Galaxy S23+ otwórz **Ogarniacz → Ustawienia → Informacje o aplikacji → Sprawdź aktualizacje**. Panel pokaże dostępną wersję i informacje o wydaniu.
7. Wybierz **Pobierz i zainstaluj**. Ogarniacz pokaże postęp, pobierze APK i sprawdzi SHA-256.
8. Jeśli Android otworzy ekran **Instaluj nieznane aplikacje**, zezwól Ogarniaczowi, wróć do aplikacji i wybierz **Uruchom instalator**.
9. W systemowym instalatorze potwierdź aktualizację. Cicha instalacja nie jest używana.
10. Po instalacji uruchom Ogarniacza i sprawdź w panelu, czy widoczna jest nowa wersja. Komputer, ADB i Raspberry Pi nie uczestniczą w krokach 6–10.

## D. Jednorazowe przejście debug → release

Debug APK i release APK są podpisane różnymi kluczami. Android nie zainstaluje release jako aktualizacji debug i nie należy obchodzić tej ochrony.

1. W działającej wersji debug przejdź do **Ustawienia → Dane / Backup**.
2. Pozostaw wszystkie sekcje zaznaczone, wybierz **Utwórz backup**, a następnie **Zapisz plik JSON** lub **Udostępnij backup**.
3. Potwierdź, że plik JSON znajduje się poza prywatnymi danymi aplikacji. Dopiero wtedy odinstaluj wersję debug.
4. Zainstaluj release APK podpisany stałym kluczem i uruchom aplikację.
5. W tym samym panelu wybierz **Wybierz backup do restore**, sprawdź zweryfikowany manifest i przywróć wszystkie sekcje.
6. Kolejne wersje instaluj już przez OTA. Nie wymagają ponownego eksportu ani odinstalowania.

Nie odinstalowuj debug, jeśli backup nie został zapisany i zweryfikowany. `android:deploy` nie zastąpi potem release, ponieważ celowo używa klucza debug.
