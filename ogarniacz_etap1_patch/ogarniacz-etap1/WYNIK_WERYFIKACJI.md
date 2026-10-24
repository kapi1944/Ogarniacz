# Ogarniacz — wynik dostępnej weryfikacji pakietu, 23.10.2026

## Zweryfikowane

- Bieżący `main`: `d17897925b1b9bcc9f7fec170c11a1379b187ec0`.
- Bieżący `rpi-stable`: `82f3d6fa8b0f70c0c75ac7505e3e669695dae6c4`.
- Ostatnie CI dla `main`: zakończone `success` przed pakietem.
- Ostatnie wydanie Android APK: `v1.0.21`.
- Osiem SHA bazowych plików repozytorium używanych przez skrypt: wszystkie zgodne z aktualnym `main`.
- Skrypt zmian: `python -m py_compile` bez błędów.
- Syntetyczny test aplikacji patcha w lokalnym repo Git: 9 zmian; BOM zachowany; `git diff --check` bez uwag; próba ponownego uruchomienia została zablokowana przez kontrolę stanu repozytorium.
- Integracja GitHub wcześniej odrzuciła próbę zapisu przez Git Objects API i Contents API (403). Zmiany nie trafiły do zdalnego `main`.

## Niewykonane — nie należy oznaczać jako sukces

- Uruchomienie testów Vitest, lint, typecheck i build na zmienionym kodzie całego repo (brak pobranego repozytorium/zależności w dostępnym środowisku).
- Commit i push zmian do `main`.
- CI nowego commita.
- Odczyt HEAD i healthcheck na fizycznym Raspberry po aktualizacji SSH.
- Test fizycznego Samsunga, instalatora APK, alarmów i danych.
- Odtworzenie produkcyjnego backupu (celowo nie wykonywano).
- Inspekcja treści historycznego pliku kopii (celowo nie wykonywano).
- Publikacja lub wdrożenie (celowo nie wykonywano).

## Kryterium zaliczenia

Przekazać pakiet do lokalnej kopii repozytorium, zastosować go po kontroli zgodności, uruchomić wszystkie wymagane testy, wykonać commit i push fast-forward, sprawdzić CI, a testy rzeczywistych urządzeń raportować oddzielnie. Bez automatycznego wydawania APK i bez aktualizacji Raspberry.
