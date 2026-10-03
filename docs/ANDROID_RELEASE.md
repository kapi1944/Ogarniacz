# Publikuj Ogarniacza

Dwa kanały produkcyjne: podpisany Android APK oraz Raspberry (frontend i backend
razem). Web OTA jest wycofany; PWA/service worker pozostają dla przeglądarki.

## Jeden workflow normalnego wydania

**Actions → Publikuj Ogarniacza → Run workflow**, gałąź `main`.
Wejścia: `version_bump` (patch domyślnie, minor lub major) i opcjonalne `release_notes`.
Nie ma `new_release`. Workflow sprawdza dokładny SHA checkoutu, aktualny main oraz
zakończone sukcesem CI typu push lub workflow_dispatch dla tego samego SHA. Brak zielonego CI zatrzymuje
publikację przed przygotowaniem wersji i artefaktów.

Klasyfikator `scripts/publikacja-klasyfikacja.mjs` porównuje historię osobno:
Android od tagu ostatniego publicznego APK, Raspberry od `rpi-stable`.
Testy, dokumentacja i jawne metadane developerskie nie wymagają publikacji;
nieznane pliki runtime wymagają obu kanałów. Brak punktu odniesienia wymaga
pierwszego zatwierdzenia. Rozbieżna historia zatrzymuje publikację.

Jeżeli Android=false, package/lock nie zmieniają wersji i nie powstaje APK.
Jeżeli Android=true, istniejące skrypty przygotowują wersję, budują i weryfikują
APK (stały signing/fingerprint, metadane Androida, versionCode, SHA-256,
latest.json). Artefakty są archiwizowane przed commitem i tagiem. Dopiero po
udanym buildzie powstaje commit wersji na main, a następnie tag i publiczny release.
Nie są wymagane manifest, klucz ani minNativeVersionCode Web OTA.

Jeżeli Raspberry=true, workflow buduje frontend i backend. Po powodzeniu
wszystkich wymaganych kroków, w tym weryfikacji publicznego APK, przesuwa
`rpi-stable` do dokładnego finalnego commita (również commita wersji APK).
Jeżeli Raspberry=false, gałąź pozostaje bez zmian. Pierwsze zatwierdzenie może
utworzyć `rpi-stable`; kolejne muszą być fast-forward, bez force-pusha.
Równoległe przesunięcie main podczas przygotowania wersji blokuje zapis wersji.

## Konfiguracja GitHub

Environment `android-production`:
- Secrets: `ANDROID_RELEASE_KEYSTORE_BASE64`, `ANDROID_RELEASE_STORE_PASSWORD`,
  `ANDROID_RELEASE_KEY_PASSWORD`, `ANDROID_RELEASE_KEY_ALIAS` — istniejący klucz.
- Variables: `ANDROID_SYNC_API_URL`, `ANDROID_UPDATE_MANIFEST_URL` — pełne HTTPS.

Workflow potrzebuje `contents: write` i `actions: read`. Ochrona main musi dopuszczać
zapis commita wersji przez workflow; ochrona rpi-stable musi dopuszczać wyłącznie
zatwierdzający workflow. Nie dopuszczaj force-pusha tego kanału.

## Jawne wznowienie częściowego APK

**Actions → Wznów częściowe wydanie Android APK**: podaj `resume_version` X.Y.Z
oraz opcjonalnie `resume_run_id` z oryginalnymi artefaktami `android-release`.
Ten workflow nie buduje APK ani nie podbija wersji. Wyszukuje commit wersji na
origin/main, weryfikuje tag, signing, metadane, SHA-256 i istniejące assety.
Nie nadpisuje niezgodnych artefaktów. Brak oryginalnego APK zatrzymuje wznowienie.
Archiwum Actions jest zachowane przez 30 dni.

Wznowienie naprawia wyłącznie publikację APK i nie zatwierdza arbitralnego main
na Raspberry. Zatwierdzenie Raspberry wykonuje normalny workflow po zielonym CI
aktualnego main. Jeśli commit wersji zapisany tokenem workflow nie ma CI, uruchom
Actions → CI → Run workflow na main, a po sukcesie normalny workflow publikacji.
Opublikowany już APK nie otrzyma wtedy ponownego bumpa. Nie używaj Re-run
do tworzenia nowej wersji.

Weryfikacja publiczna używa przypiętych URL `/releases/download/vX.Y.Z/` oraz
ograniczonych ponowień ruchomego `latest.json`. Testy lokalne nie publikują release,
nie tworzą produkcyjnych tagów i nie zastępują testu na fizycznym Samsungu.

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
