# Aktualizacje wszystkich platform — R1.4 / diagnostyka R1.5

## Zasady i zapis wyniku

PASS oznacza wykonany test z podanym środowiskiem. MANUAL oznacza oczekujące działanie
na urządzeniu. BLOCKED oznacza brak konkretnego warunku, np. nowszego zatwierdzonego
artefaktu. Test jednostkowy ani kompilacja nie potwierdzają aktualizacji urządzenia.
Nie publikuj nowej wersji tylko na potrzeby testu. Nie odinstalowuj Androida, nie czyść
IndexedDB/profili, nie zmieniaj sesji ani modelu danych. Wykonaj kopię danych własną
funkcją aplikacji i sprawdź jej zapis. Używaj rekordów testowych z unikalnym znacznikiem.

## Automatyzacja

| Platforma | Test | Wynik | Zakres |
|---|---|---|---|
| Android | Wersje, manifest, HTTPS, instalator i stany UI | PASS | Celowane testy platformy i paneli; granice natywne zastąpione atrapami |
| Raspberry | Kanał stable, build, konfiguracja, snapshot SQLite/WAL, restart, health, rollback | PASS | Istniejące skrypty testowe, izolowane repozytoria, testowa baza i atrapy usług |
| Raspberry | Właściciel, sesja i CSRF | PASS | Test rzeczywistego lokalnego HTTP API z testową bazą |
| Web/PWA | Wykrycie SW, odłożenie, akceptacja odświeżenia; Android bez Web OTA | PASS | Testy komponentów i przepływu |
| Windows | Równa/starsza/nowsza wersja, brak EXE, obcy URL, błędny manifest i brak sieci | BLOCKED lokalnie — brak SDK | Konsolowe testy .NET tej samej logiki co aplikacja; wynik konkretnego CI sprawdź w PR |
| Windows | Instalacja / reinstalacja / odinstalowanie z zachowaniem znacznika profilu | PASS (R1.2) | Poprzedni instalator CI 3c1954c, Windows; nie jest to dowód aktualizacji między różnymi wersjami |

## Właściciel — przygotowanie wspólne

Zapisz źródłowe i docelowe wersje, SHA wydania, platformę i godzinę. Zanotuj konto,
liczbę rekordów testowych, ustawienia motywu oraz przykładowe zadanie i Rejestr.
Nie zapisuj haseł, tokenów ani całych danych do publicznego raportu.
Jeśli brak nowszej dopuszczonej wersji, wpisz BLOCKED — brak nowszej wersji.

## Android (MANUAL)

1. Na Samsungu odczytaj zainstalowane versionName/versionCode oraz konto i ustawienia.
2. Sprawdź aktualizacje: niższy/równy versionCode nie daje instalacji, wyższy pokazuje
   dostępność. Porównaj z oficjalnym latest.json. Nie wybieraj debug APK zamiast podpisanego.
3. Po odrębnej zgodzie na aktualizację pobierz APK; przerwij sieć, sprawdź błąd i retry.
   Instalator nie może wystartować przed weryfikacją. Uszkodzony APK/inny podpis/downgrade
   badaj wyłącznie na osobnym testowym urządzeniu z kopią danych.
4. Potwierdź systemową zgodę, przetestuj anulowanie i ponów instalację. Nie odinstalowuj.
5. Po zakończeniu sprawdź rzeczywisty versionCode, konto, ustawienia, zapisane rekordy,
   pracę offline i restart aplikacji/telefonu. Sam start instalatora nie oznacza sukcesu.

## Windows (MANUAL)

1. Użyj zatwierdzonego EXE i jego SHA-256. Zanotuj wersję EXE i osobno wersję frontendu
   z Ustawień. Uruchom EXE, sprawdź ikonę i produkcyjny HTTPS bez ścieżek/hasła/parametrów.
2. Na własnym koncie zaloguj się, utwórz testowy rekord IndexedDB, zapisz wybrane ustawienie.
   Odwiedź testowany widok online, następnie odłącz sieć: zapisane widoki/dane działają z cache.
3. Menu aktualizacji musi rozróżniać aktualny EXE, nowszy produkt, brak instalatora oraz
   brak połączenia. Wyłącznie ręczne potwierdzenie pobierania; bez cichej instalacji.
4. Zamknij program i zainstaluj nowszy zatwierdzony EXE nad poprzednim, bez usuwania profilu.
   Uruchom ponownie, a potem po restarcie Windows. Porównaj rekordy, konto i ustawienia.
5. Potwierdź niezależność profilu Edge/PWA. Brak WebView2 Runtime testuj na osobnej maszynie,
   bez usuwania runtime używanego przez inne aplikacje. Nie wyłączaj SmartScreen.

## Raspberry Pi (MANUAL; awarie wyłącznie staging)

1. Odczytaj HEAD, origin/rpi-stable, wersję package.json i status aktualizatora. Nie porównuj
   dostępności z origin/main. Użyj panelu Właściciela; bez zgody nie uruchamiaj produkcyjnego update.
2. Na kopii testowej z fikcyjną bazą/config sprawdź nowe rpi-stable i uruchom istniejący updater.
   Potwierdź frontend i backend tego samego SHA, zachowany config, bazę i automatyczny restart.
3. Sprawdź /health: status ok, service ogarniacz-api, database connected.
4. Na staging zasymuluj błąd health nowej wersji. Potwierdź przywrócenie starego kodu,
   runtime i snapshotu bazy, działającą usługę oraz komunikat przyczyny/rollbacku.
   Nie kopiuj tych operacji ani wadliwych commitów na produkcyjne rpi-stable.
5. Zapisz status oraz ograniczone logi usługi bez sekretów. Przy nieudanym rollbacku
   zatrzymaj test i zachowaj kopie; nie ponawiaj destrukcyjnych kroków automatycznie.

## Web/PWA i frontend Windows (MANUAL)

1. Na testowym HTTPS otwórz aplikację i testowany widok, zapisz rekord i ustawienie w IndexedDB.
2. Udostępnij nowszy frontend na tym samym origin w środowisku testowym. Nowy SW ma
   wyświetlić komunikat; Później nie przeładowuje, Zaktualizuj aktywuje go po akceptacji.
3. Porównaj wersję frontendu po odświeżeniu, rekordy, konto i ustawienia. Zachowaj ten sam
   origin i profil; zmiana adresu nie jest aktualizacją tej samej bazy.
4. Odłącz sieć, uruchom ponownie aplikację i zapisany widok. Potwierdź dane lokalne.
   Przywróć sieć; API nie może pochodzić ze starego cache. Nie używaj Clear site data.

## Raport właściciela

| Platforma | Test | Wynik PASS / FAIL / MANUAL / BLOCKED | Uwagi: wersje, SHA, środowisko |
|---|---|---|---|
| Android | Aktualizacja APK i zachowanie danych | MANUAL | Brak dostępu do telefonu w tej sesji |
| Windows | Logowanie, offline, IndexedDB, aktualizacja między wersjami i restart OS | MANUAL | Wymagana własna sesja oraz nowszy zatwierdzony EXE |
| Raspberry | Aktualizacja i rollback urządzenia testowego | MANUAL | Brak sterowania fizycznym Pi w tej sesji |
| Web/PWA | Rzeczywiste przełączenie SW i trwałość IndexedDB | MANUAL | Potrzebne dwa frontendowe buildy na testowym origin |

Diagnostyka pokazuje faktyczny zakres: Android APK, Windows EXE, frontend Web/PWA,
a Raspberry wersję wdrożenia i znany docelowy SHA. Brak numeru oczekującego SW/nieznany
cel nie jest komunikatem aktualności. Rollback jest odrębnym wynikiem, a nie instalacją nowej wersji.
