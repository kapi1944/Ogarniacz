# Produkcyjne wydanie Androida

## Granice kanałów

APK jest pełną aktualizacją Androida: dostarcza kod natywny, Capacitor, manifest, konfigurację sieci i uprawnień, pluginy, bazowy frontend oraz nowy `versionName`/`versionCode` z `package.json`. `latest.json` opisuje wyłącznie ten podpisany artefakt. Web OTA dostarcza tylko podpisany, zgodny z `minNativeVersionCode` bundle webowy przez osobny `web-ota.json`; nie zastępuje APK. Service worker Web/PWA zarządza cache i proponuje odświeżenie frontendu serwowanego przez Raspberry. Nie publikuje osobnego wydania ani nie obsługuje instalacji Androida. `/api/*` i `/health` pozostają poza cache.

## Jednorazowo w GitHub

W **Settings → Environments → New environment** utwórz `android-production`. W nim ustaw:

- **Secrets**: `ANDROID_RELEASE_KEYSTORE_BASE64` (Base64 istniejącego stałego `.jks`), `ANDROID_RELEASE_STORE_PASSWORD`, `ANDROID_RELEASE_KEY_PASSWORD`, `ANDROID_RELEASE_KEY_ALIAS`.
- **Variables**: `ANDROID_SYNC_API_URL`, `ANDROID_UPDATE_MANIFEST_URL`, `ANDROID_WEB_UPDATE_MANIFEST_URL`, `ANDROID_WEB_OTA_PUBLIC_KEY_PEM`.

Adresy aktualizacji muszą być HTTPS. Wartości publiczne są konfiguracją runtime APK; nie wpisuj tu tokenów ani kluczy prywatnych. Klucz `.jks` i hasła muszą być dokładnie tymi samymi, którymi podpisano już zainstalowane APK.

W **Settings → Actions → General → Workflow permissions** włącz odczyt i zapis dla workflowów. Jeśli `main` ma ochronę gałęzi, zezwól `github-actions[bot]` na zapis wersji przygotowanej przez ten workflow.

## Każde kolejne wydanie

Wejdź w **Actions → Produkcyjne wydanie Androida → Run workflow**, jawnie zaznacz `new_release`, wybierz `patch`, `minor` albo `major`, opcjonalnie wpisz release notes i kliknij **Run workflow**. Domyślnie nowa wersja nie jest tworzona.

Workflow wylicza wersję i `versionCode`, aktualizuje punkt zgodności Web OTA, buduje oraz weryfikuje podpisane APK, a dopiero potem tworzy tag i publiczny GitHub Release z APK, SHA-256 i `latest.json`.

Nie publikuje przy tym Web OTA; nowy tag jest tylko kontrolowaną bazą dla jego osobnego workflowu.

## Wznowienie częściowo udanej publikacji

Uruchom nowy workflow z aktualnego `main`, pozostaw `new_release=false` i wpisz dokładną `resume_version`, np. `1.0.14`. Ten tryb nie podbija wersji ani nie buduje APK. Re-run jest dozwolony tylko dla takiego jawnego wznowienia; Re-run nowego wydania pozostaje zablokowany.

Wznowienie odnajduje commit wersji na `origin/main`, sprawdza punkt zgodności Web OTA i istniejący tag. Tworzy wyłącznie brakujący tag, wskazując ten commit. Pobiera istniejące assety, sprawdza metadane, podpis, SHA-256 i rozmiar APK. Istniejących assetów nie nadpisuje; niezgodność przerywa operację. Brakujące manifest i plik SHA odtwarza z oryginalnego zweryfikowanego APK, uzupełnia brakujące assety i upublicznia draft dopiero po ich sprawdzeniu.

Nowe wydania zachowują zweryfikowane artefakty w Actions jako `android-release` przez 30 dni, przed zapisem commitu i tagu. Jeśli APK nie dotarło do release, wpisz `resume_run_id` pierwotnego runu. Bez dostępnego oryginalnego APK wznowienie zatrzyma się z diagnostyką, zamiast budować inny artefakt lub tworzyć kolejną wersję. Starsze runy sprzed tej poprawki nie mają tego archiwum.

Weryfikacja pobiera manifest i APK z `/releases/download/vX.Y.Z/`, sprawdza pola `versionName`, `versionCode`, `apkUrl`, SHA-256 i rozmiar, a następnie czeka na zgodność publicznego `/releases/latest/download/latest.json`. Każdy z trzech odczytów ma limit 120 sekund i 24 prób (łącznie do 360 sekund), z przerwami do 5 sekund i timeoutem żądania do 10 sekund dla manifestu lub 30 sekund dla APK. Log rozróżnia starą wersję, 404/przejściową niedostępność i niezgodne pola. Po limicie nadal niezgodny manifest lub APK oznacza błąd. Publikacja pozostaje na GitHub do diagnostyki i bezpiecznego wznowienia.

CI i release używają JDK 21 oraz uruchamiają celowane testy updatera APK i Web OTA. Web OTA wymaga publicznego wydania produkcyjnego z manifestem i APK zgodnymi z `minNativeVersionCode`; sam tag lub draft nie wystarcza. Konfiguracja podpisywanego manifestu pochodzi z tego samego commita co bundle.

## Przygotowanie telefonu

Zapisz model Samsunga, Android/One UI, ilość wolnego miejsca oraz wersję z **Ustawienia → Android APK → Aktualnie zainstalowana wersja**. Wykonaj eksport danych i zanotuj przykładowe zadanie, wpis Rejestru, lek, harmonogram i ostatnią przyjętą dawkę. Nie odinstalowuj aplikacji ani nie czyść jej danych. Do synchronizacji włącz dotychczasowy Tailscale i użyj własnego konta.

## TEST A — Samsung 1.0.13 → 1.0.14

1. Potwierdź `1.0.13 (1000013)` w aplikacji i wersję w systemowych informacjach o Ogarniaczu.
2. Wybierz **Sprawdź aktualizacje**. Oczekiwany wynik: dostępne `1.0.14`; manifest i APK pochodzą z oficjalnego wydania GitHub.
3. Wybierz **Pobierz i zainstaluj**. Oczekiwany wynik: postęp pobierania i etap weryfikacji SHA-256 przed uruchomieniem instalacji.
4. Jeśli system wymaga zgody „Instaluj nieznane aplikacje”, udziel jej dla Ogarniacza, wróć do niego i ponów instalację. Jeśli pojawi się **Potwierdź instalację**, wybierz je, a następnie zatwierdź aktualizację na ekranie systemowym. Zapisz również przypadek, gdy Android wykona dozwoloną aktualizację bez osobnego ekranu.
5. **Znane ograniczenie 1.0.13:** jego updater wywołuje `commit()` przed zamknięciem strumienia. Jeśli instalator nie startuje, pobierz `Ogarniacz-1.0.14-release.apk` bezpośrednio z oficjalnego release i otwórz go systemowo. Zgoda dotyczy wtedy przeglądarki lub aplikacji Pliki. To obejście, a nie zaliczony test instalatora Ogarniacza. Przy żądaniu odinstalowania lub konflikcie podpisu zatrzymaj test.
6. Po zakończeniu otwórz Ogarniacza ponownie. Oczekiwany wynik: `1.0.14 (1000014)`, zachowane konto i wszystkie zanotowane dane. Sam powrót z instalatora nie oznacza sukcesu.
7. Otwórz Pulpit, Dzisiaj, Zadania, Rejestr, Planer i Zdrowie. Oczekiwany wynik: brak błędów oraz zgodność danych; nie używaj importu demonstracyjnego.
8. Sprawdź synchronizację przez istniejący prywatny HTTPS: zmień testowe zadanie, zsynchronizuj i potwierdź zmianę na drugim kliencie własnego konta. Oczekiwany wynik: brak utraty lub duplikacji danych; ewentualne konflikty są jawne.
9. W Lekach sprawdź zachowanie leków, dawek i historii. Na osobnym testowym leku sprawdź oznaczenie dawki; nie zmieniaj rzeczywistego przyjęcia tylko na potrzeby testu.
10. Zamknij aplikację, usuń ją z ostatnich aplikacji i uruchom ponownie; następnie uruchom telefon ponownie. Oczekiwany wynik: nadal `1.0.14`, zachowane dane i sesja oraz brak propozycji starszej aktualizacji. Sprawdź także przypomnienie testowego leku przy rzeczywistych ustawieniach powiadomień/baterii Samsunga.

## TEST B — przyszły 1.0.14 → 1.0.15+

Wykonaj dopiero po osobno zatwierdzonym i opublikowanym wyższym APK. Brak nowszej wersji oznacza **NIETESTOWANE**, nie sukces. Nie publikuj nowego wydania tylko w celu odhaczenia tej listy.

**Granica dowodu:** `1.0.14` zawiera naprawę zamykania strumienia, ale nie zawiera późniejszej naprawy odzyskiwania przerwanej sesji ani flagi APK po `SUKCES`. Przejście B sprawdza instalator dostarczony w `1.0.14`; pełna kontrola późniejszych poprawek wymaga potem przejścia z APK, które je zawiera, do kolejnej wyższej wersji. Web OTA nie zmieni tych natywnych zachowań.

1. Potwierdź `1.0.14 (1000014)`, eksport danych i integralność przyszłego release; jego `versionCode` musi być wyższy. **Sprawdź aktualizacje** ma pokazać wyższą wersję i umożliwić jej pobranie. Jeżeli po zapisanym `SUKCES` brak przycisku pobrania, zapisz znaną usterkę `1.0.14`; ręczna instalacja nie zalicza tego kroku.
2. Przerwij sieć podczas pobierania. Oczekiwany wynik: czytelny błąd i ponowienie pobrania; instalator nie otwiera się przed poprawnym SHA-256.
3. Po poprawnym pobraniu przetestuj brak zgody na nieznane źródła, powrót bez zgody i ze zgodą. Oczekiwany wynik: instalacja ponawiana z zachowanego APK, bez ponownego pobrania. Można to sprawdzić po wyłączeniu sieci, gdy APK jest już pobrane.
4. Jeśli dostępny jest ekran systemowego potwierdzenia, anuluj, wróć do aplikacji i wybierz **Ponów instalację**. Powtórz po ponownym uruchomieniu aplikacji. Oczekiwany wynik: czytelny stan anulowania i retry zachowanego, ponownie zweryfikowanego pliku. Jeśli system nie wymaga potwierdzenia, test anulowania oznacz **NIETESTOWANE**.
5. Na urządzeniu testowym sprawdź małą ilość wolnego miejsca. Oczekiwany wynik: czytelny błąd bez utraty danych; po zwolnieniu miejsca można ponowić operację. Nie usuwaj danych Ogarniacza.
6. W kontrolowanym teście przerwij proces przed zatwierdzeniem sesji, uruchom aplikację i sprawdź brak wiecznego „Instalowanie…”. Ten scenariusz jest znanym ograniczeniem `1.0.14`; poprawione odzyskiwanie trzeba sprawdzić także z przyszłego APK zawierającego tę naprawę. Nie przerywaj celowo systemowej instalacji na telefonie z jedyną kopią danych.
7. Dokończ aktualizację. Sprawdź wyższą zainstalowaną wersję, dane, moduły, synchronizację, leki i restart jak w krokach A6–A10. Nie uznawaj statusu „Instalowanie…” za dowód sukcesu.

Systemowe zgody, ekran instalatora, skutki zabicia procesu, blokady One UI/Auto Blocker, rzeczywisty brak miejsca, zachowanie danych po aktualizacji, synchronizacja i przypomnienia wymagają fizycznego telefonu. Testy automatyczne nie dowodzą tych zachowań. Uszkodzony APK, inny podpis i downgrade testuj wyłącznie na kontrolowanym urządzeniu z kopią danych, bez wyłączania zabezpieczeń produkcyjnych.

Zapisz osobno wynik każdego kroku: **PASS / FAIL / NIETESTOWANE**, rzeczywistą wersję źródłową/docelową i użycie obejścia. Przy błędzie zachowaj zrzut komunikatu, godzinę, wolne miejsce, zgody źródła/Auto Blocker oraz status/sessionId i log PackageInstaller (bez sekretów i danych użytkownika).
