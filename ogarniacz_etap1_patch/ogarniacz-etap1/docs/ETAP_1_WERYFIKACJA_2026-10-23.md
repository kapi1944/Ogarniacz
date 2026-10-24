# Etap 1 — stan i minimalna weryfikacja produkcji, 23.10.2026

Ten raport dotyczy kodu i metadanych GitHub, **nie** zastępuje odczytu urządzeń. Nie zawiera haseł, tokenów, adresów prywatnej instalacji ani danych użytkownika.

## Ustalone na GitHubie

| Element | Status | Dowód |
| --- | --- | --- |
| Publiczny APK | wydany `v1.0.21` | najnowszy GitHub Release 22.10.2026 |
| `main` | `d17897925b1b9bcc9f7fec170c11a1379b187ec0` | GitHub Branch API 23.10.2026 |
| CI dla `main` | success | GitHub Actions 22.10.2026 |
| `rpi-stable` | `82f3d6fa8b0f70c0c75ac7505e3e669695dae6c4` | GitHub Branch API 23.10.2026 |
| Panel Raspberry | istnieje; na błędzie sieci widoczny; 404 ukrywa go intencjonalnie | kod i testy panelu |
| Web OTA | wycofane | `docs/ANDROID_RELEASE.md`, runtime Androida |
| Backup w historii Git | możliwa ekspozycja, **bez weryfikacji treści** | ścieżka pliku w diffach `901c3627` i `cb6198f` |

SHA na urządzeniu nie został tutaj zmierzony. Operator zgłosił wykonanie aktualizacji SSH, ale jej **docelowy SHA i healthcheck pozostają niepotwierdzone**. Nie należy uznawać nowszego `main` za wdrożony, jeśli `rpi-stable` go nie zawiera.

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
