# Ogarniacz — wskaźnik dla modeli

Główna instrukcja: `docs/INSTRUCTIONS.md`

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
- `docs/ECHO_AGENT_ARCHITEKTURA.md`, `docs/echo-model-lokalny.md` — szczegóły modułu Echo
- `docs/web-ota.md` — OTA i release webowy
- `docs/SPECYFIKACJA_OGARNIACZ_V1.md` — specyfikacja produktu
- `docs/ROADMAP.md` — plan rozwoju
- `docs/OPEN_DECISIONS.md` — otwarte decyzje
- `docs/VOICE_CHECKPOINT_2026-08-27.md` — snapshot prac nad głosem

Przy konflikcie: dokumenty zasad są nadrzędne co do reguł. Dokumenty szczegółowe są źródłem detali technicznych.

Zasada nadrzędna: dobieraj najlepsze rozwiązanie techniczne. Minimalizuj zakres zmian, ale nie kosztem jakości, poprawności i utrzymywalności.
