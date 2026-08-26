# OGARNIACZ - ETAP 5 - Miniatury, crop i asset store

Projekt lokalny:
`C:\GitHub\Projects\Ogarniacz\Ogarniacz_v1`

Dokument nadrzędny tej serii zmian:
`Ogarniacz_specyfikacja_aktualna_v2.pdf`

Jeżeli PDF jest dostępny w zadaniu lub repozytorium, przeczytaj odpowiednie sekcje przed implementacją. Ten prompt jest jednak samowystarczalny dla bieżącego etapu.

## Zasady obowiązkowe

1. W interfejsie główny ekran nazywa się **Pulpit**. Nie wprowadzaj nazw „Kokpit”, „Start” ani „Dashboard”. Starsze „Dzisiaj” może pozostać tylko jako akcja wyboru bieżącej daty lub jako wewnętrzny legacy identifier, jeśli bezpieczna migracja wymaga zachowania kompatybilności.
2. Ultimate Pomagier 3.5 jest projektem REFERENCYJNYM. Kopiuj zachowania i sprawdzoną logikę, nie firmową semantykę ani monolityczne komponenty.
3. Nie duplikuj źródeł prawdy. Pulpit agreguje dane modułów, ale nie tworzy ich drugiej kopii.
4. UI nie powinno znać fizycznego storage. Używaj istniejących repozytoriów albo małych interfejsów repository.
5. Nie przechowuj ciężkich danych/obrazów w localStorage. Dla nowych danych użytkownika preferuj istniejący magazyn offline; jeśli go nie ma, przygotuj warstwę możliwą do podmiany na IndexedDB/SQLite.
6. Nie wykonuj dużego refaktoru „przy okazji”. Zmieniaj tylko to, co jest potrzebne w bieżącym etapie.
7. Nie rób pełnego audytu repo w każdym etapie. Przeczytaj `package.json`, konfigurację i tylko pliki bezpośrednio związane z zadaniem.
8. Nie pushuj do remote.

## Preflight Git - wykonaj przed modyfikacją

```powershell
git status --short --branch
git branch --show-current
git rev-parse HEAD
git log -5 --oneline
```

Jeżeli repo ma remote, możesz wykonać `git fetch --all --prune`, ale brak dostępu do sieci nie blokuje etapu.

Jeżeli worktree zawiera niezacommitowane zmiany, których nie utworzyłeś w tym zadaniu:
- NIE resetuj,
- NIE stashuj,
- NIE usuwaj,
- NIE commituj ich razem ze swoimi zmianami.

Zatrzymaj się i zwróć `WORKTREE NOT CLEAN` z listą plików.

Jeżeli worktree jest czysty, kontynuuj na aktualnej sensownej gałęzi roboczej. Nie twórz nowej gałęzi, jeśli seria wdrożeniowa już ma własną gałąź.

## Weryfikacja po zmianach

Ustal prawidłowe skrypty z `package.json`. Uruchom dostępne:
- typecheck,
- build,
- lint,
- istniejące testy istotne dla zmienianego obszaru.

Dodawaj tylko kilka testów o wysokiej wartości. Nie twórz dziesiątek snapshotów, testów regexowych wyglądu ani osobnego „audytu jakości” całej aplikacji.

Jeżeli etap się powiedzie i worktree przed startem był czysty, utwórz jeden lokalny commit o podanej niżej treści. Bez push.

## Raport końcowy

Zakończ odpowiedź dokładnie w strukturze:

### WYNIK ETAPU
Status: `DONE` / `FIX REQUIRED` / `BLOCKED`

### Git
- branch przed/po
- HEAD przed/po
- commit

### Zrealizowano
- krótka lista faktycznie ukończonych punktów

### Pliki
- nowe
- zmienione
- jedno zdanie o roli ważniejszych plików

### Weryfikacja
- komendy
- wyniki

### Świadomie odłożone
- tylko rzeczy należące do kolejnych etapów

### Ryzyka / uwagi
- tylko realne, konkretne problemy

Na końcu napisz:
`READY FOR NEXT STAGE`
albo
`FIX REQUIRED BEFORE NEXT STAGE`

Po zakończeniu tego etapu ZATRZYMAJ SIĘ. Nie rozpoczynaj kolejnego etapu samodzielnie.

---

## Cel

Przenieś najlepsze UX miniatur z Ultimate Pomagiera, ale NIE kopiuj przechowywania dużych Data URL w localStorage.

## AssetRepository

Jeśli aplikacja ma już magazyn plików/blobów, użyj go.
Jeśli nie, wprowadź mały `AssetRepository` możliwy do oparcia o IndexedDB/SQLite.

Rekord zadania przechowuje tylko `thumbnailAssetId`/`assetRef` i ewentualne metadane kadru, nie ciężki obraz inline.

## Wejście desktop

Obsłuż:
- wybór pliku,
- drag & drop,
- wklejenie obrazu ze schowka.

Formaty: JPEG, PNG, WEBP.
Dodaj rozsądny limit wejścia i wymiaru bazując na sprawdzonych wartościach z Pomagiera, ale dopasuj do istniejących utili.

## Źródło i podgląd

Zachowaj zoptymalizowaną wersję roboczą, aby użytkownik mógł później zmienić crop bez ponownego wybierania pliku.
Wygeneruj lekki preview do Pulpitu.

## Edytor

Obsłuż:
- 16:9,
- 4:3,
- 1:1,
- zoom,
- przesunięcie X,
- przesunięcie Y,
- reset,
- anuluj,
- zastosuj.

Ogranicz wartości crop/zoom do bezpiecznych zakresów.

## Pulpit

Miniatura pojawia się nad markerem tego samego zadania i otwiera jego szczegóły.
Ustawienie `show thumbnails on timeline` ma działać bez kasowania assetu.

## Bezpieczeństwo storage

- waliduj MIME/typ,
- nie ufaj Data URL z legacy bez sprawdzenia,
- nie zapisuj obrazów w Settings/localStorage,
- usunięcie zadania powinno mieć przemyślaną politykę cleanup assetu, bez kasowania współdzielonego assetu.

## Testy

Tylko:
- clamp crop/zoom,
- zapis i odczyt asset metadata,
- odrzucenie nieobsługiwanego typu,
- task -> asset reference zachowuje się po reloadzie.

## Kryteria akceptacji

- plik/drop/paste działa,
- crop jest ponownie edytowalny,
- preview jest lekkie,
- Pulpit renderuje miniaturę przy markerze,
- żaden ciężki obraz nie trafia do localStorage.

## Commit etapu
`feat(assets): add task thumbnails and asset repository`
