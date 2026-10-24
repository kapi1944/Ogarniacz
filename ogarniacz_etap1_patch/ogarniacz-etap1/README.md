# Ogarniacz — etap 1: przygotowane zmiany bez publikacji

Przygotowano 23.10.2026 w oparciu o `main=d17897925b1b9bcc9f7fec170c11a1379b187ec0`.

**Stan:** GitHub odrzucił zapis zarówno przez Git Objects API, jak i Contents API (`403 Resource not accessible by integration`), dlatego **żadna z tych zmian nie została zapisana w repozytorium**. Nie przeprowadzono lokalnych testów projektu; środowisko tej sesji nie może pobrać repo i zależności z internetu. Skrypt `aplikuj_etap1.py` przeszedł kontrolę składni Python, a jego dziewięć transformacji sprawdzono w lokalnej próbie na syntetycznym repozytorium Git: transformacje, zachowanie BOM, `git diff --check` oraz odrzucenie ponownej próby na brudnym drzewie. Dodatkowo ponownie zweryfikowano zgodność wszystkich ośmiu oryginalnych blob SHA z `main`. **To nie jest uruchomienie testów Ogarniacza**: nadal wymagane są testy projektu i CI na rzeczywistych zmianach.

## Zawartość

- `aplikuj_etap1.py` — niedestrukcyjny skrypt zastosowania dziewięciu zmian z kontrolą wersji istniejących tekstów (przerywa, jeśli repo się zmieniło). Nie wywołuje gita, nie publikuje, nie dotyka env ani bazy.
- `docs/ROADMAP.md` i `docs/OPEN_DECISIONS.md` — aktualizacje dokumentów.
- `docs/ETAP_1_WERYFIKACJA_2026-10-23.md` — udokumentowany status oraz minimalna kontrola live.

## Przed zastosowaniem

Zabezpiecz istniejące lokalne zmiany; wykonaj na właściwym `main` i bez prac równoległych. Zweryfikuj wejściowy SHA i porównaj zmiany. Skrypt pisze dziewięć plików w repozytorium. Uruchomienie z innego katalogu nie jest wspierane.

```bash
cd /sciezka/do/Ogarniacz
git status --short
git rev-parse HEAD
python /sciezka/do/paczki/aplikuj_etap1.py
npx vitest run src/services/KontrolaAktualizacjiAplikacji.test.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git diff --stat
```

Dopiero po testach i przeglądzie zmian wykonaj commit oraz push fast-forward, sprawdź CI. **Nie uruchamiaj publikacji ani wdrożenia.**

## Stan repo potwierdzony na GitHubie 23.10.2026

- `main=d17897925b1b9bcc9f7fec170c11a1379b187ec0`
- `rpi-stable=82f3d6fa8b0f70c0c75ac7505e3e669695dae6c4`
- Najnowszy publiczny Android APK: `v1.0.21`.
- CI ostatniego `main`: sukces; nowych zmian z pakietu jeszcze nie obejmuje.
- Fizycznego Raspberry i Samsunga nie weryfikowano; ich wersje, stan danych i działanie aktualizatora są do potwierdzenia przez operatora.

## Ryzyko historycznych danych

W publicznej historii Git zidentyfikowano commit zawierający ścieżkę `ogarniacz-przed-migracja.json`. Nie odczytywano jego treści i nie można orzec, czy zawierał realne sekrety. Nie używaj narzędzi online do analizy zawartości. Usunięcie pliku z HEAD nie usuwa go z historii.
