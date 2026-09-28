# Audyt zależności — 2026-09-28

Punkt wyjścia: `main` na `ec5cbe3`; `npm audit --json`: 7 wpisów (6 moderate, 1 high). `npm audit --omit=dev --json`: 0. Wpisy pośrednie dla `xcode`, `@capacitor/cli`, `@vitest/coverage-v8` i `vitest` dziedziczą podatność pakietu źródłowego; nie są osobnymi błędami.

| Pakiet w raporcie | Źródło i ścieżka od projektu | Severity | Zasięg i decyzja |
| --- | --- | --- | --- |
| `@vitest/mocker` | `vitest → @vitest/mocker` | moderate | Tylko testy/dev server. Poprawka 4.1.11 w tej samej głównej wersji. |
| `vitest` | `vitest → @vitest/mocker` | moderate | Wpis pośredni. Aktualizacja 4.1.10 → 4.1.11. |
| `@vitest/coverage-v8` | `@vitest/coverage-v8 → vitest → @vitest/mocker` | moderate | Wpis pośredni. Aktualizacja 4.1.10 → 4.1.11 dla zgodności z Vitest. |
| `fast-uri` | `vite-plugin-pwa → workbox-build → ajv → fast-uri` | high | Tylko narzędzia builda. Cztery advisory dotyczą parsowania adresów. Poprawka zgodna z `ajv`: 3.1.5 → 3.1.8 w lockfile, bez bezpośredniej zależności. |
| `uuid` | `@capacitor/cli → xcode → uuid` | moderate | Tylko CLI/iOS, poza produkcyjnym runtime Ogarniacza. `xcode` wywołuje `uuid.v4()`, a advisory dotyczy wywołań v3/v5/v6 z buforem. Tymczasowo zaakceptowane. |
| `xcode` | `@capacitor/cli → xcode → uuid` | moderate | Wpis pośredni. Aktualne `xcode@3.0.1` wymaga `uuid@^7.0.3`, bez poprawionej wersji zgodnej z tym zakresem. |
| `@capacitor/cli` | `@capacitor/cli → xcode → uuid` | moderate | Wpis pośredni. `npm audit` proponuje cofnięcie CLI do 8.4.3; rozjechałoby to wersje `core`/`android`/CLI 8.5.0, a nie usuwa realnej ekspozycji Android runtime. Pozostawiono 8.5.0. |

`npm outdated` pokazuje także nowsze wydania bez związku z wykrytymi podatnościami. Nie aktualizowano React, Capacitor, Vite, TypeScript, Dexie ani innych fundamentów. Oficjalne pakiety Capacitor i `@capacitor-mlkit/text-recognition` pozostają w głównej wersji 8, a `core`, `android` i CLI w 8.5.0. Kontrola `npm ls` nie wykazała konfliktów peer dependencies.

Ostrzeżenia deprecation: `uuid@7.0.3` pochodzi z `@capacitor/cli → xcode`; `glob@11.1.0` z `vite-plugin-pwa → workbox-build`. W drzewie jest też `glob@13.0.6` z `@capacitor/cli → rimraf`. Nie ma dla tych wersji osobnych wpisów w bieżącym `npm audit`. Nie dodano `overrides` ani bezpośrednich zależności. Ponownie ocenić łańcuch `xcode → uuid` przed następnym wydaniem stabilnym lub po zgodnej aktualizacji Capacitor CLI.

Stan po zmianach: `npm ci` działa; pełny audit: 3 moderate (jeden łańcuch `uuid`), 0 high; produkcyjny audit: 0. Ryzyko resztkowe dotyczy wyłącznie narzędzia developerskiego, nie kodu dostarczanego w aplikacji.
