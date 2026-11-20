# Ogarniacz — wskaźnik dla modeli

Główna instrukcja: [docs/INSTRUCTIONS.md](docs/INSTRUCTIONS.md). Wczytaj ją na początku zadania; szczegóły dobieraj z poniższej mapy.

## Dokumenty zasad (nadrzędne)

- `docs/ARCHITECTURE.md` — architektura, refaktor, zakres zmian, backend
- `docs/DATA.md` — model danych, migracje, kompatybilność
- `docs/API.md` — zewnętrzne API, SDK, biblioteki, chmura, płatne usługi
- `docs/SECURITY.md` — sekrety, dane użytkownika, release, signing
- `docs/TESTING.md` — testy, regresja, release

## Dokumenty szczegółowe (wczytuj przy potrzebie)

- `docs/ANDROID.md` — szczegóły platformy Android
- `docs/RASPBERRY_PI.md` — backend, serwer, deploy
- `docs/SYNC_ARCHITECTURE.md`, `docs/ARCHITEKTURA_SERWER_SYNC.md` — szczegóły synchronizacji
- `docs/DATA_MODEL.md` — szczegółowy model danych
- `docs/ECHO.md` — aktualna mapa Echo, głosu, pamięci i testów; starsze szczegóły są podlinkowane w tym dokumencie
- `docs/ANDROID_RELEASE.md` — aktualne wydania APK i rpi-stable; `docs/web-ota.md` — dokumentacja historyczna wycofanego Web OTA
- `docs/SPECYFIKACJA_OGARNIACZ_V1.md` — specyfikacja produktu
- `docs/ROADMAP.md` — plan rozwoju
- `docs/OPEN_DECISIONS.md` — otwarte decyzje
- `docs/VOICE_CHECKPOINT_2026-08-27.md` — snapshot prac nad głosem

Przy konflikcie: dokumenty zasad są nadrzędne co do reguł. Dokumenty szczegółowe są źródłem detali technicznych.

Mapa warstw i współdzielonych komponentów: `docs/ARCHITECTURE.md`. Plan dalszych prac Upgrade 2026: `docs/UPGRADE_2026.md` — czytaj tylko przy kontynuacji tych etapów. Zasady proporcjonalności są w `docs/INSTRUCTIONS.md`.

## Skille Codex

Wspólne źródła skilli są w `.agents/skills/`. Codex odkrywa je w tym katalogu; Claude Code może odczytać wskazany `SKILL.md` na potrzeby zadania, bez kopiowania biblioteki do `.claude/skills/`. Dobieraj skill według `description` i czytaj tylko potrzebne odwołania. Skill nie rozszerza zakresu zgody użytkownika.

- [ogarniacz-test-selector](.agents/skills/ogarniacz-test-selector/SKILL.md) — dobór i wykonanie weryfikacji.
- [ogarniacz-github-workflow](.agents/skills/ogarniacz-github-workflow/SKILL.md) — Git, commit, push, PR i odczyt CI.
- [ogarniacz-smart-forms](.agents/skills/ogarniacz-smart-forms/SKILL.md) — wspólne pola i zachowanie formularzy.
- [ogarniacz-ui-design-system](.agents/skills/ogarniacz-ui-design-system/SKILL.md) — spójność komponentów, stylów i motywów.
- [ogarniacz-module-builder](.agents/skills/ogarniacz-module-builder/SKILL.md) — rozwój modułów, w tym integracja Echo i zmiany przekraczające granicę synchronizacji.
- [ogarniacz-debugger](.agents/skills/ogarniacz-debugger/SKILL.md) — odtworzenie błędu, diagnoza i naprawa przyczyny.
