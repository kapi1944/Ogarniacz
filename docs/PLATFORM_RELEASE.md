# Wspólne wydania Ogarniacza — R1.1

Każde wydanie produktu ma jedną wersję X.Y.Z dla podpisanego Android APK,
instalatora Windows, Web/PWA i paczki Raspberry Pi. Źródłem wersji pozostaje
`package.json` z identycznym numerem w obu miejscach `package-lock.json`.
Nie ma osobnego bumpa dla Windows lub serwera. Dotychczasowy klasyfikator nadal
rozpoznaje zmiany kanałów, ale alternatywa Android **lub** Raspberry uruchamia
cały zestaw. Zmiana tylko backendu lub Windows również wymaga wszystkich platform.
Dokumentacja i testy mogą być pominięte; nieznany plik wymaga wydania.

## Uruchomienie i bramki

**Actions → Publikuj Ogarniacza → Run workflow**, wyłącznie `main`.
`version_bump`: patch / minor / major; `release_notes`: opcjonalne.
`source_sha`: opcjonalny dokładny SHA wejściowego CI (automatyzacja przekazuje go jawnie).
Bez niego obowiązuje SHA uruchomienia. PR, obce repozytorium, czerwone lub niedokończone CI,
CI innego workflow i przestarzały main są blokowane przed zmianą wersji.

`auto-publish.yml` pozostaje, ale **domyślnie nie publikuje**. Dopiero zmienna
repozytorium GitHub `AUTO_PUBLISH_ENABLED=true` świadomie włącza dispatch po zielonym
CI zdarzenia push na aktualny main. Brak zmiennej lub inna wartość oznaczają wyłączenie.
Nie ustawiamy tej zmiennej w repo ani podczas wdrażania R1.1. Bramka jest ponownie
sprawdzana w workflow publikacji. Sam commit wersji nie uruchamia kolejnego pełnego
wydania, nawet gdy jego CI zostało uruchomione ręcznie. Wspólna grupa concurrency
`android-production-release` serializuje nowe wydania, Re-run i wznowienia.

## Kolejność

1. Potwierdź aktualny main i zakończone sukcesem **CI dokładnego SHA źródłowego**.
2. Ustal wspólną wersję istniejącym `android-release-przygotowanie.mjs`.
3. Zapisz commit zmieniający wyłącznie wersje package/lock, bez nowego kodu.
   Commit zawiera `Wydanie-Zrodlo` i `Wydanie-CI`. Zwykły push na main jest
   rezerwacją wersji; sprawdzenie main przed pushem i fast-forward chronią wyścigi.
   Ten zapis następuje przed buildami, aby wszystkie platformy miały **ten sam SHA**
   i aby awaria runnera nie utraciła przydzielonego numeru. Powiązanie z zielonym CI
   jest weryfikowane ponownie: rodzic oraz jedynie zmiany numerów w package/lock.
4. Zbuduj Android, używając istniejącego klucza; zweryfikuj podpis i metadane.
5. Zbuduj Windows (.NET WebView2 + Inno Setup); sprawdź wersję aplikacji i instalatora.
6. Zbuduj Web/PWA i wykonaj smoke PWA.
7. Zbuduj backend i paczkę Raspberry z **gotowego frontendu etapu Web**, bez jego przebudowy.
8. Każdy ukończony etap zapisz oddzielnie w Actions (do 90 dni, ograniczone polityką repo).
   Potwierdzenie etapu zawiera wersję, SHA commita wersji, SHA źródłowe CI, ID CI,
   nazwy, rozmiary i SHA-256 plików. Web/Raspberry zawierają także `wydanie.json`;
   Windows instaluje ten plik wraz z aplikacją.
9. Pobierz wszystkie etapy, zweryfikuj sumy, podpis APK i wersje wewnątrz tar.gz.
   Sprawdź aktualność main i monotoniczność względem aktualnego publicznego wydania.
10. Utwórz lub sprawdź niezmienny tag `vX.Y.Z` i GitHub Release **draft**.
    Draft jest wyszukiwany także w stronicowanej liście wydań GitHub.
11. Dodaj brakujące pliki. Istniejące muszą mieć identyczne bajty — bez `--clobber`,
    kasowania ani zastępowania niezgodnych plików. Ponownie pobierz wszystkie assety
    z GitHub i sprawdź kompletność oraz SHA-256; sprawdź main jeszcze raz.
12. Dopiero po pełnym sukcesie upublicznij draft. Sprawdź publiczne APK i manifest.
13. **Osobny job** zatwierdza `rpi-stable` zwykłym fast-forward do SHA wydania.

Wymagane assety: `Ogarniacz-X.Y.Z-release.apk`, jego `.sha256`, `latest.json`,
`Ogarniacz-X.Y.Z-Setup.exe`, jego `.sha256`, `Ogarniacz-X.Y.Z-Web.tar.gz`,
`Ogarniacz-X.Y.Z-RaspberryPi.tar.gz`, potwierdzenia `android.json`, `windows.json`,
`web.json`, `raspberry.json`, wspólne `SHA256SUMS.txt` i `wydanie.json`.
**Niekompletne artefakty oznaczają brak publicznego wydania.**

## Wznowienie i granice atomowości

**Actions → Wznów częściowe wydanie wszystkich platform**, podaj `resume_version=X.Y.Z`.
Workflow zleca ten sam `android-release.yml` na main. Można też użyć tego wejścia
bezpośrednio lub Re-run oryginalnego workflow. Numer nie jest wyznaczany ponownie.
Powtórne zdarzenie CI tego samego źródłowego SHA odnajduje ten sam commit wersji.

Ukończone etapy są pobierane po nazwie zawierającej wersję i pełny SHA. Sprawdzane
jest pochodzenie archiwum z oficjalnego workflow dispatch na main, potem potwierdzenie
SHA-256 i wersji. Przy braku archiwum szukamy kompletnego etapu w drafcie/publicznym
release. Poprawny etap nie jest budowany ani wysyłany drugi raz. Nieukończone etapy
są budowane ponownie z zapisanego SHA. Niezgodne archiwum nie powoduje cichego rebuildu.
Wygaśnięcie archiwum i brak pełnego etapu w release mogą wymagać odbudowy; jeśli istniejące
częściowe assety mają wtedy inne sumy, proces zatrzymuje się do ręcznej diagnostyki.

Nie rozpoczynamy następnej wersji, gdy poprzednia rezerwacja jest niezakończona.
Jeśli main przesunął się po rezerwacji, nie upubliczniamy starego draftu. Wznowienie
nie cofa main i nie omija tej bramki: wymagana jest świadoma decyzja operatora co do
niedokończonej wersji. Historyczne wydania bez metadanych R1.1 nie są automatycznie
przerabiane ani usuwane przez wznowienie nowego procesu.

Publikacja zestawu GitHub (A) i udostępnianie aktualizacji urządzeniom (B) są odrębne.
Awaria `rpi-stable` po publikacji daje jawny błąd; release i dane pozostają zachowane.
Wznowienie tej wersji sprawdza publiczne pliki i ponawia zatwierdzenie kanału,
bez ponownego wysyłania poprawnych assetów. Samo przesunięcie gałęzi nie jest dowodem
wdrożenia na fizycznym Raspberry. Istniejący aktualizator Pi nadal wykonuje etapowy
deploy, backup i rollback usługi; jego błąd raportuje operator urządzenia i ponawia
aktualizator po usunięciu przyczyny. Workflow GitHub nie ma poświadczeń do urządzenia,
nie monitoruje go i nie cofa publicznego release ani danych użytkownika.

## Konfiguracja i weryfikacja

Wymagane sekrety/zmienne środowiska `android-production` są opisane w
[ANDROID_RELEASE.md](ANDROID_RELEASE.md). Workflow potrzebuje `contents: write`
i `actions: read`; dispatch automatyczny/wznowienia potrzebuje `actions: write`.
Ochrona main musi dopuszczać commit wersji, a rpi-stable wyłącznie zatwierdzający workflow,
bez force-pusha. Windows bez certyfikatu Authenticode nadal może wyświetlać SmartScreen.

`npm run android:release:test` testuje bramki, kompletność, uszkodzone sumy,
niezgodne wersje, błąd podpisu, częściowy draft, ponowienie publikacji i rzeczywiste
lokalne repozytoria Git (wspólna wersja, powtórne CI, zmiana main, wyłączenie automatyzacji).
CI wykonuje tę bramkę. Lokalna weryfikacja workflow przez actionlint nie publikuje.
Testy skryptów nie potwierdzają produkcyjnego podpisania ani instalacji na urządzeniu.

## Windows

Instalator Windows to natywna powłoka WebView2 obsługująca PWA hostowane przez produkcyjny serwer HTTPS; **nie kopiuje** IndexedDB przeglądarki Edge ani danych Androida. Przy pierwszym uruchomieniu podaj pełen adres HTTPS serwera Ogarniacza, np. Tailscale Serve. Do pierwszej instalacji PWA i zalogowania wymagany jest dostęp do tego adresu; po poprawnym zapisaniu offline shell aplikacji może być dostępny przez service worker. WebView2 wymaga Microsoft Edge WebView2 Runtime. Aplikacja Windows używa trwałego profilu `%LOCALAPPDATA%/Ogarniacz/Desktop/WebView2`, który nie jest usuwany przy aktualizacji instalatora.

Zmiana adresu serwera oznacza zmianę źródła danych w IndexedDB; przed zmianą wykonaj kopię danych w aplikacji. Element `Adres serwera…` w menu pozwala świadomie zmienić serwer. `Sprawdź nową wersję instalatora` porównuje wersję z publicznym GitHub Release i otwiera pobranie po zgodzie użytkownika. Nie instaluje niepodpisanego EXE bez pytania. Bez certyfikatu Authenticode Windows może pokazać ostrzeżenie SmartScreen — nie wyłączaj weryfikacji systemowej.

Dla developerów pozostaje `npm run desktop:dev`: start lokalnego Vite i osobne okno Edge. Nie uruchamiaj tego jako wersji produkcyjnej.

## Użytkownik końcowy

- **Windows:** Pobierz `Ogarniacz-X.Y.Z-Setup.exe` z najnowszego GitHub Release i zainstaluj. Aktualizację instalki pobierz po komunikacie; frontend odświeża się przez PWA serwera.
- **Android:** Pobierz podpisany `Ogarniacz-X.Y.Z-release.apk`. Wbudowany updater nadal sprawdza podpis i nie instaluję APK bez zgody użytkownika.
- **Raspberry Pi:** Używaj istniejącego aktualizatora `rpi-stable`, ustawionego timerem lub wywołanego ręcznie.
- **Web/PWA:** Otwórz produkcyjny adres HTTPS i zainstaluj PWA przez Edge/Chrome; service worker oferuje aktualizację po wdrożeniu serwera.
