# Smoke test: Android, Web/PWA i Raspberry Pi

Wykonuj punkty po kolei na tym samym koncie Właściciela. Użyj unikalnego znacznika, np. `SMOKE-2026-09-28-1930`, we wszystkich testowych zadaniach. Przed testem otwórz raz widok Zadań w Web/PWA, włącz Tailscale na Samsungu i komputerze oraz upewnij się, że **Ustawienia → Synchronizacja** pokazują `0` oczekujących zmian i `0` konfliktów na obu urządzeniach.

Jeżeli dla Raspberry, Web OTA albo APK nie ma nowszej wersji, poprawne „wersja aktualna” potwierdza tylko sprawdzanie manifestu. Instalację oznacz wtedy jako **nieprzetestowaną**, a nie zaliczoną.

## 1. Logowanie i odtworzenie sesji

- **Wykonaj:** wyloguj się na Samsungu i w Web, zaloguj to samo konto Właściciela. Na obu urządzeniach otwórz **Ustawienia → Synchronizacja → Diagnostyka synchronizacji** i sprawdź `zalogowany`, `Właściciel`, CSRF `dostępny`, autoryzację `sesja` oraz host HTTPS Tailscale. Zamknij aplikację Samsung z ekranu ostatnich aplikacji, uruchom ją ponownie; zamknij i ponownie otwórz kartę Web.
- **Oczekuj:** oba klienty wracają bez formularza logowania, diagnostyka nadal pokazuje sesję i CSRF, a **Synchronizuj teraz** kończy się bez `401`/`403`.
- **Błąd:** ponowne logowanie po restarcie, `niezalogowany`, brak CSRF, `401`, powtarzalny `403` albo inny host/protokół.
- **Tylko przy błędzie zbierz:** zrzut całej diagnostyki z obu klientów; `adb logcat -d -v time > ogarniacz-android.log`; na Pi `sudo journalctl -u ogarniacz --since "10 minutes ago" --no-pager`.

## 2. Zapis Android → Web

- **Wykonaj:** na Samsungu dodaj zadanie `<ZNACZNIK>-A2W`, odczekaj 5 sekund i wybierz **Synchronizuj teraz**. W Web wybierz **Synchronizuj teraz** i odszukaj zadanie.
- **Oczekuj:** zadanie pojawia się w Web dokładnie raz; na Samsungu liczba oczekujących zmian wraca do `0`.
- **Błąd:** brak zadania, duplikat, stale rosnąca kolejka, stan `błąd` lub ponowne żądanie logowania.
- **Tylko przy błędzie zbierz:** zrzuty stanu synchronizacji z obu urządzeń oraz `sudo journalctl -u ogarniacz --since "10 minutes ago" --no-pager`.

## 3. Zapis Web → Android

- **Wykonaj:** w Web dodaj zadanie `<ZNACZNIK>-W2A`, odczekaj 5 sekund i wybierz **Synchronizuj teraz**. Na Samsungu wznow aplikację, wybierz **Synchronizuj teraz** i odszukaj zadanie.
- **Oczekuj:** zadanie pojawia się na Samsungu dokładnie raz; Web pokazuje `0` oczekujących zmian.
- **Błąd:** brak lub duplikat zadania, nieaktualny rekord po ręcznej synchronizacji albo błąd sesji/CSRF.
- **Tylko przy błędzie zbierz:** zrzuty stanu synchronizacji; `adb logcat -d -v time > ogarniacz-android.log`; `sudo journalctl -u ogarniacz --since "10 minutes ago" --no-pager`.

## 4. Chwilowa utrata połączenia i outbox

- **Wykonaj:** włącz tryb samolotowy na Samsungu. Dodaj zadanie `<ZNACZNIK>-OFFLINE`, zamknij aplikację i uruchom ją ponownie nadal offline. Potwierdź, że zadanie istnieje i w Ustawieniach jest co najmniej `1` oczekująca zmiana. Wyłącz tryb samolotowy, włącz Tailscale, wznow aplikację i odczekaj 10 sekund; jeśli potrzeba, wybierz **Synchronizuj teraz**. Następnie zsynchronizuj Web.
- **Oczekuj:** zapis działa offline i przeżywa restart; po odzyskaniu sieci outbox spada do `0`, a zadanie pojawia się w Web dokładnie raz.
- **Błąd:** utrata lokalnego zadania, próba blokowania zapisu offline, kolejka pozostająca po skutecznej łączności albo duplikat po ponowieniu.
- **Tylko przy błędzie zbierz:** zrzut licznika oczekujących przed i po powrocie sieci; `adb logcat -d -v time > ogarniacz-android.log`; na Pi `sudo journalctl -u ogarniacz --since "15 minutes ago" --no-pager`.

## 5. Zmiana tej samej encji po obu stronach

- **Wykonaj:** utwórz i zsynchronizuj zadanie `<ZNACZNIK>-KONFLIKT`, aż będzie identyczne na obu klientach. Otwórz widok Zadań w Web, następnie odłącz Samsung i komputer od sieci. Na Samsungu zmień tytuł na `<ZNACZNIK>-KONFLIKT-TEL`, a w Web na `<ZNACZNIK>-KONFLIKT-WEB`. Przywróć sieć najpierw w Web i zsynchronizuj, potem na Samsungu. W Ustawieniach Samsunga porównaj obie wersje, wybierz jedną świadomie, ponownie zsynchronizuj oba klienty.
- **Oczekuj:** aplikacja pokazuje konflikt zamiast cichego nadpisania. Po wyborze oba klienty mają jedną, tę samą wybraną wersję, `0` konfliktów i `0` oczekujących zmian.
- **Błąd:** jedna wersja znika bez pytania, brak obu wariantów w karcie konfliktu, konflikt wraca po rozstrzygnięciu albo urządzenia kończą z różną treścią.
- **Tylko przy błędzie zbierz:** zrzut karty konfliktu i stan synchronizacji z obu urządzeń; `sudo journalctl -u ogarniacz --since "15 minutes ago" --no-pager`.

## 6. Sprawdzenie aktualizacji Raspberry z panelu

- **Wykonaj:** w Web otwórz **Ustawienia → Aktualizacja Raspberry** i wybierz **Sprawdź aktualizacje**. Zanotuj wersję, commit i dostępność. Na Pi porównaj je z `cd /home/kacper/apps/Ogarniacz && git rev-parse --short HEAD && git rev-parse --short origin/main`.
- **Oczekuj:** panel kończy stanem `aktualna` albo pokazuje `dostępna`; SHA panelu odpowiada bieżącemu HEAD. Android nie pokazuje panelu Raspberry.
- **Błąd:** panel znika mimo `RPI_UPDATE_ENABLED=1`, kończy w nieskończonym sprawdzaniu, pokazuje inne SHA albo zwraca błąd sesji Właściciela/CSRF.
- **Tylko przy błędzie zbierz:** `cat /home/kacper/apps/Ogarniacz/data/aktualizacja-rpi/status`; `sudo journalctl -u ogarniacz-update-check.service -u ogarniacz --since "10 minutes ago" --no-pager`; `curl -fsS http://127.0.0.1:8787/health`.

## 7. Bezpiecznie wymuszona nieudana aktualizacja Raspberry

Wykonuj tylko wtedy, gdy panel w punkcie 6 pokazuje aktualizację dostępną. Test zmienia chwilowo wyłącznie śledzony dokument i sprawdza bramkę ochronną przed zmianą HEAD.

- **Wykonaj:** na Pi uruchom:

  ```bash
  cd /home/kacper/apps/Ogarniacz
  cp docs/ROADMAP.md /tmp/ROADMAP.md.smoke-backup
  printf '\n<!-- smoke: blokada aktualizatora -->\n' >> docs/ROADMAP.md
  ```

  W panelu wybierz **Zainstaluj aktualizację**. Po pojawieniu się błędu przywróć plik i potwierdź czyste repo:

  ```bash
  cd /home/kacper/apps/Ogarniacz
  cp /tmp/ROADMAP.md.smoke-backup docs/ROADMAP.md
  git status --short
  curl -fsS http://127.0.0.1:8787/health
  ```

- **Oczekuj:** aktualizacja zatrzymuje się z informacją o lokalnych zmianach, HEAD pozostaje bez zmian, aplikacja i baza nadal działają. Po przywróceniu pliku `git status --short` jest pusty; ponowne sprawdzenie działa. To test kontrolowanego niepowodzenia przed instalacją. Automatyczny rollback po awarii builda/healthchecku wymaga osobnego, zaplanowanego testu z kontrolowanym wadliwym commitem.
- **Błąd:** zmiana HEAD mimo brudnego repo, niedostępna aplikacja/healthcheck, usunięcie danych albo brak końcowego stanu `error`.
- **Tylko przy błędzie zbierz:** `git status --short`; `git rev-parse HEAD`; `cat data/aktualizacja-rpi/status`; `sudo journalctl -u ogarniacz-update.service -u ogarniacz --since "15 minutes ago" --no-pager`.

## 8. Udana aktualizacja Raspberry i PWA/service worker

- **Wykonaj:** po czystym wyniku `git status --short`, jeśli panel pokazuje nowszą wersję, wybierz **Zainstaluj aktualizację**. Nie odświeżaj ręcznie Web podczas restartu. Po sukcesie poczekaj na komunikat PWA **Nowa wersja Ogarniacza jest gotowa**; możesz przyspieszyć kontrolę, wyłączając i włączając sieć. Wybierz **Aktualizuj teraz**, wróć do Zadań i sprawdź wcześniejsze rekordy oraz aktywną sesję. Następnie odłącz komputer od sieci, odśwież wcześniej otwarty widok Zadań, sprawdź lokalne rekordy i ponownie włącz sieć.
- **Oczekuj:** panel przechodzi przez pobieranie, instalowanie, budowanie i restart do `sukces`; Web odzyskuje połączenie, PWA proponuje odświeżenie, a po nim dane i sesja pozostają. Offline ładuje się zapisany shell i dane lokalne, a synchronizacja pokazuje brak łączności. Po powrocie sieci `/api/*` pobiera bieżące odpowiedzi z serwera.
- **Błąd:** panel zatrzymany w stanie roboczym, brak powrotu Web, pusta baza po odświeżeniu, formularz logowania, brak komunikatu PWA dla faktycznie nowego frontendu, niedostępny wcześniej otwarty widok offline albo stare odpowiedzi API po odzyskaniu serwera.
- **Tylko przy błędzie zbierz:** w przeglądarce eksport Console i Network oraz zrzut **Application → Service Workers**; na Pi `cat data/aktualizacja-rpi/status`; `sudo journalctl -u ogarniacz-update.service -u ogarniacz --since "20 minutes ago" --no-pager`; `curl -fsS http://127.0.0.1:8787/health`.

## 9. Web OTA na Samsungu

- **Wykonaj:** w Samsungu otwórz **Ustawienia → Android Web OTA**, zanotuj aktualny bundle i commit, wybierz **Sprawdź szybką aktualizację**. Jeśli jest dostępna i zgodna z APK, wybierz **Zastosuj szybką poprawkę**. Po przeładowaniu wróć do panelu, sprawdź nowy bundle oraz wcześniejsze zadania i sesję.
- **Oczekuj:** brak aktualizacji daje stan `aktualna`; dostępna poprawka przechodzi pobieranie, SHA-256, podpis i aktywację. Zmienia się bundle/commit, lecz wersja APK i dane pozostają bez zmian. Manifest wymagający nowszego APK daje czytelny stan `wymaga APK` bez instalacji.
- **Błąd:** aktywacja niepodpisanego lub niezgodnego bundle, pusta aplikacja po restarcie, utrata danych/sesji, zmiana wersji APK albo zapętlenie startu bez powrotu do poprzedniego/wbudowanego bundle.
- **Tylko przy błędzie zbierz:** zrzut panelu z bundle i commitem; `adb logcat -d -v time > ogarniacz-web-ota.log`. Nie usuwaj danych aplikacji; użyj przycisku przywrócenia poprzedniej lub wbudowanej wersji, jeśli panel jest dostępny.

## 10. Sprawdzenie nowego APK

- **Wykonaj:** w Samsungu otwórz **Ustawienia → Aktualizacja aplikacji**, zanotuj zainstalowane `versionName (versionCode)` i wybierz **Sprawdź aktualizacje**. Porównaj wynik z publicznym `latest.json`. Jeśli manifest wskazuje wyższy kod, panel ma pokazać nową wersję i informacje o wydaniu; nie instaluj jej w ramach tego punktu, jeśli nie zaplanowano osobnego testu instalatora.
- **Oczekuj:** bieżący APK daje `aktualna`, a publiczny nowszy APK daje `dostępna`; Web OTA i aktualizacja Raspberry nie zmieniają tego wyniku ani numeru APK.
- **Błąd:** niewykrycie wyższego `versionCode`, propozycja tej samej/starszej wersji, pomylenie manifestu Web OTA z `latest.json` albo błąd źródła aktualizacji w produkcyjnym APK.
- **Tylko przy błędzie zbierz:** zrzut panelu i pobrany `latest.json`; w PowerShell `adb shell dumpsys package pl.ogarniacz.app | Select-String -Pattern 'versionName|versionCode'`; `adb logcat -d -v time > ogarniacz-apk.log`.

## Wynik końcowy

Test jest zaliczony, gdy punkty 1–6 przechodzą, kontrolowana awaria z punktu 7 nie narusza usługi ani danych, a każdy dostępny kanał aktualizacji przechodzi odpowiedni punkt 8–10. Przy braku nowszego artefaktu zapisz **nieprzetestowane — brak nowszej wersji**. Po zakończeniu usuń wyłącznie rekordy zaczynające się od użytego znacznika smoke testu.
