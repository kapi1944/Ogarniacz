# Ogarniacz — roadmapa rozwoju (aktualizacja 23.10.2026)

Stan wersji przy aktualizacji dokumentu: publiczny APK `v1.0.21`, `main=d178979`, `rpi-stable=82f3d6f`. SHA są punktem kontrolnym, **nie** źródłem prawdy dla późniejszych wydań. Raport weryfikacji: [ETAP_1_WERYFIKACJA_2026-10-23.md](ETAP_1_WERYFIKACJA_2026-10-23.md).

## Statusy i zasada dowodowa

- **Wdrożone w kodzie** — istnieje implementacja i testy; nie oznacza to potwierdzenia działania na urządzeniu.
- **Zweryfikowane w CI** — zakończony powodzeniem workflow dla wskazanego SHA.
- **Do potwierdzenia na urządzeniu** — wymaga obserwacji Raspberry/Androida/HA przez operatora.
- **Planowane** — nie zlecaj ponownie gotowych fundamentów.

## Etap 1 — stabilizacja, wydania i prywatność (najbliższy)

**Wdrożone w kodzie / sprawdzone historycznie w CI:**
- konta Właściciel/Edytor, sesje i CSRF; lokalne profile, granty i synchronizacja local-first;
- outbox, rozstrzyganie konfliktów, diagnostyka i bezpieczny eksport raportu;
- szyfrowany backup, kontrolowane przywracanie z kopią ochronną;
- podpisane APK z kontrolą SHA-256 i stanem instalacji, PWA/service worker;
- osobny aktualizator Raspberry z kanału `rpi-stable`, zabezpieczeniami i rollbackiem;
- ręczna integracja Home Assistant wybranych encji;
- style Klasyczny, Luxury i Flat, oficjalny branding i biblioteka multimediów.

**Pozostaje:**
1. **Raspberry:** odczytać rzeczywisty HEAD po aktualizacji SSH, stan `/health`, jednostek, `RPI_UPDATE_ENABLED`, sesji Właściciela i widoczność panelu. `main` nie oznacza wdrożenia: Raspberry śledzi zatwierdzony `rpi-stable`. Odróżnić udane sprawdzenie od udanej instalacji i przetestowanego rollbacku.
2. **Android:** na rzeczywistym urządzeniu sprawdzić zainstalowany versionCode, aktualizator APK, ponowne uruchomienie i zachowanie danych. Test instalacji wymaga *rzeczywiście nowszego* APK. Nie publikować wersji jedynie dla testu.
3. **Synchronizacja:** sprawdzić sesję, pull/push, kolejkę i konflikty na aktywnych klientach; brak sieci nie może usuwać danych.
4. **Backup:** potwierdzić pochodzenie oraz odtwarzalność kopii i zakres eksportu; osobno zabezpieczyć niewysłaną kolejkę telefonu, jeśli istnieje. Nie używać produkcyjnej bazy do prób restore.
5. **Bezpieczeństwo:** przeanalizować ekspozycję historycznego `ogarniacz-przed-migracja.json` z commita `901c3627` (usuniętego z bieżącego drzewa w `cb6198f`). Samo dodanie `.gitignore` nie usuwa historii. Nie kopiować treści pliku do narzędzi/raportów i nie przepisywać historii bez świadomej decyzji operatora.
6. **Poczta resetowania hasła:** konfiguracja SMTP/Resend jest opcjonalna; rzeczywiste doręczenie i bezpieczny reset pozostają do potwierdzenia, bez ujawniania sekretów.

## Etap 2 — Dzisiaj 2.0 i ergonomia (po etapie 1)

- dopracowanie osi czasu, najbliższych czynności i działań szybkich bez duplikowania modeli;
- poprawa responsywności i obsługi dotykowej: Android → panel Raspberry → desktop;
- konsekwentna obsługa błędów, uprawnień i stanu offline;
- spójność stylów Klasyczny/Luxury/Flat, czytelność ikon i prawdziwy rozmiar brandingu;
- ręczne testy przypomnień dawek i powiadomień Androida z uwzględnieniem ograniczeń baterii i alarmów.

## Etap 3 — Smart Home i Echo (po etapie 2)

- rozwinięcie istniejącego panelu `SekcjaDom` i adaptera Home Assistant, nie drugi backend automatyki;
- ergonomia kafelków i czytelny stan autoryzowanych encji;
- ograniczone narzędzia Echo do odczytu oraz **potwierdzanych** poleceń włączenia/wyłączenia;
- dopracowanie ciągłości dialogu, STT/TTS i zachowania mikrofonu przy zmianach cyklu życia;
- testy na urządzeniach; rzeczywiste wake word nadal zależy od prywatnej konfiguracji natywnej.

## Dalszy backlog (poza etapami 1–3)

- prywatna biblioteka plików (odrębna od obecnego publicznego katalogu GitHub);
- integracje kalendarza, poczty i map; planer podróży;
- opcjonalny Windows/Tauri i panel diagnostyki sprzętu PC (PWM/DC, RGB/ARGB);
- przeglądarkowe e2e głównych ścieżek CRUD, dostępność z czytnikiem ekranu;
- dodatkowe role tylko po potwierdzeniu realnej potrzeby.

## Kanały aktualizacji — aktualny kontrakt

- **Android:** wyłącznie instalacja podpisanego APK; Web OTA jest wycofane.
- **Raspberry:** kod serwera i webowego frontendu tylko z zatwierdzonego `rpi-stable`.
- **Web/PWA:** service worker na tym samym originie; nie utożsamiaj go z natywnym Androidem.
- Publikacja, zmiana `rpi-stable` i instalacja na urządzeniu to **różne operacje**, żadna nie wynika automatycznie z samego zielonego CI.
