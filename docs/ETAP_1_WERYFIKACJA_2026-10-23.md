# Etap 1 — stan i minimalna weryfikacja produkcji, 23.10.2026

Ten raport obejmuje punkt odniesienia pakietu oraz odczyty Raspberry wykonane przez SSH podczas finalizacji. Nie zawiera haseł, tokenów, adresów prywatnej instalacji ani danych użytkownika. Testy automatyczne nie zastępują prób na Samsungu.

## Punkt odniesienia pakietu — przed finalizacją

| Element | Status | Dowód |
| --- | --- | --- |
| Publiczny APK | wydany `v1.0.21` | najnowszy GitHub Release 22.10.2026 |
| `main` | `d17897925b1b9bcc9f7fec170c11a1379b187ec0` | GitHub Branch API 23.10.2026 |
| CI dla `main` | success | GitHub Actions 22.10.2026 |
| `rpi-stable` | `82f3d6fa8b0f70c0c75ac7505e3e669695dae6c4` | GitHub Branch API 23.10.2026 |
| Panel Raspberry | istnieje; na błędzie sieci widoczny; 404 ukrywa go intencjonalnie | kod i testy panelu |
| Web OTA | wycofane | `docs/ANDROID_RELEASE.md`, runtime Androida |
| Backup w historii Git | możliwa ekspozycja, **bez weryfikacji treści** | ścieżka pliku w diffach `901c3627` i `cb6198f` |

## Potwierdzone na Raspberry przez SSH — 23.10.2026

- HEAD urządzenia: `82f3d6fa8b0f70c0c75ac7505e3e669695dae6c4`, zgodny zarówno z referencją urządzenia, jak i odczytanym z GitHub `origin/rpi-stable`.
- `ogarniacz.service` i `tailscaled.service`: `active/running`, `enabled`.
- `/health`: `status=ok`, `service=ogarniacz-api`, `database=connected`.
- Jednostki `ogarniacz-update.service`, `ogarniacz-update-check.service` i `ogarniacz-update-rollback.service`: załadowane, `inactive/dead`, `static`.
- `ogarniacz-update.timer`: `inactive/dead`, `disabled`. Jednostki `ogarniacz-update-auto.service` i `ogarniacz-update-auto.timer`: `not-found`.
- Odczytano wyłącznie flagę `RPI_UPDATE_ENABLED=1`; nie wypisywano pozostałych wartości env. Działający endpoint `/api/rpi-update/status` bez sesji zwrócił HTTP `403`, zgodnie z kontrolą roli Właściciela w kodzie.
- Brak dostępnej zalogowanej sesji przeglądarki: widoczność panelu i odczyt statusu przez rzeczywistego Właściciela **pozostają niezweryfikowane na urządzeniu**. Lokalny kod i testy panelu dotyczą nowszego `main`.

Nie uruchamiano aktualizacji, restartu, rollbacku ani przywracania danych. Nowszy `main`, w tym poprawka panelu `d178979`, nie jest częścią odczytanego `rpi-stable` i nie został wdrożony tą kontrolą.

## Finalizacja pakietu w repozytorium — 23.10.2026

Skrypt zastosowano po przeglądzie kodu i zgodności bazowego HEAD oraz ośmiu blob SHA. Zmiana runtime czyści poprzedni `wynikApk` po błędzie kolejnego sprawdzenia; nowy test obejmuje sekwencję sukces → błąd → odzyskanie poprawnego stanu. Pozostałe zmiany dotyczą dokumentacji.

| Kontrola | Wynik lokalny |
| --- | --- |
| `npx vitest run src/services/KontrolaAktualizacjiAplikacji.test.ts` | 4/4 |
| `npm run lint` | bez błędów; 19 ostrzeżeń w niezmienianych plikach |
| `npm run typecheck` | sukces |
| `npm run test -- --pool=forks --no-file-parallelism --maxWorkers=1` | 132 pliki, 1116/1116 testów, bez pominięć |
| `npm run server:test` | 85/85, bez pominięć |
| `npm run build` | sukces, wraz z generowaniem service workera |
| `git diff --check` | bez uwag |

Vitest używał katalogu tymczasowego w repozytorium i jednego workera. Pierwszą próbę testów serwera zatrzymano po `fetch failed` wynikającym z ograniczeń lokalnych połączeń HTTP w sandboxie; pełny zestaw przeszedł po dopuszczeniu tych połączeń. Nie zmieniano testów ani modułów serwera w celu obejścia błędu.

Z kodu i istniejących testów potwierdzono kontrakty: manifest APK i SHA-256, systemowy instalator oraz wymagane potwierdzenie docelowego zainstalowanego versionCode; szyfrowany backup i oczekiwanie na zabezpieczenie `before-restore` przed zapisem; sesje z CSRF i kontrolą ról; synchronizację przez sesję, zachowanie kolejki oraz jawne konflikty HTTP 409. Testy natywne Androida są objęte istniejącym CI, a ich wynik dla końcowego SHA jest sprawdzany po push wraz z zadaniem Web. Wynik CI i SHA finalizacji są podawane w raporcie końcowym zadania.

## Raspberry — odczyty tylko diagnostyczne

Na Raspberry w istniejącej sesji SSH; nie przesyłaj pełnego pliku env ani tokenów:

```bash
cd ~/apps/Ogarniacz
git rev-parse HEAD
git status --short
git rev-parse origin/rpi-stable
systemctl is-active ogarniacz tailscaled
systemctl is-enabled ogarniacz-update-auto.timer 2>/dev/null || true
curl --silent --fail http://127.0.0.1:8787/health
sudo systemctl status ogarniacz-update.service --no-pager --lines=5
```

W panelu `Ustawienia → Synchronizacja i aktualizacje → Raspberry / serwer` na zalogowanym Właścicielu sprawdź numer commita i dostępność. W przypadku 404 upewnij się, że endpoint został jawnie aktywowany (`RPI_UPDATE_ENABLED=1`); do odpowiedzi nie kopiuj wartości pozostałych zmiennych env. 401/403 oznaczają problem z sesją/uprawnieniami, a błąd sieci powinien pokazać „Ponów połączenie”.

**Nie uruchamiaj aktualizacji, rollbacku ani zmiany env podczas samej diagnostyki.** Rzeczywisty rollback po okresie pracy nowej wersji może cofnąć również zapisy do snapshotu.

## Samsung — potwierdzenie przez użytkownika

1. Zanotuj wersję i versionCode z panelu Android APK. Porównaj z publicznym `v1.0.21`; nie zakładaj, że wydanie jest już zainstalowane.
2. Sprawdź licznik oczekujących zmian i konfliktów na wszystkich aktywnych urządzeniach. Nie uruchamiaj synchronizacji tylko po to, aby wyzerować licznik.
3. Potwierdź na bezpiecznych danych testowych zapis i odczyt zaszyfrowanego backupu oraz możliwość odszyfrowania, bez restore do produkcyjnej bazy.
4. Przetestuj instalator dopiero przy rzeczywiście nowym, autoryzowanym APK. Testy builda/CI nie są testem instalacji na Samsungu.
5. Skontroluj stan uprawnień powiadomień i alarmów, bez zmiany dawek lub resetowania danych.

## Bezpieczeństwo / backup

- Nie wklejaj do zgłoszeń logów z sesjami, pełnego env, kopii SQLite/IndexedDB ani eksportów JSON.
- Historyczny eksport wymaga decyzji operatora; `.gitignore` i usunięcie z `main` nie usuwają wcześniejszej publicznej historii.
- Eksport aplikacji nie jest automatycznie kompletną kopią profilu przeglądarki, serwera ani niewysłanej kolejki synchronizacji.
- Produkcyjne testy przywracania wykonuj wyłącznie po kontrolowanym zabezpieczeniu danych i na środowisku testowym.

## Dalsze działania

Po potwierdzeniu realnego HEAD Raspberry i stanu Samsunga zamknij otwarte pozycje w `ROADMAP.md`; nie edytuj faktów „zweryfikowano na urządzeniu” bez dowodów. Etap 2 (UI) pozostaje odrębnym zakresem.
