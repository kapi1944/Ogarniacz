# Centralna biblioteka multimediów Ogarniacza

Publiczne materiały projektu są dostępne w aplikacji: **Wiedza → Multimedia**
(`/multimedia`). Źródłem bieżącej listy jest `multimedia/katalog.json` na `main`
w publicznym repozytorium `kapi1944/Ogarniacz`. Zmiana katalogu i materiałów
nie wymaga kolejnego APK w instalacji, która zawiera już ten moduł.

## Zawartość i klasyfikacja

Rodzaje materiałów opisuje `kategoria` (obecnie ikony i arkusze identyfikacji).
Status jest odrębny od rodzaju:

- `OFICJALNE`: zatwierdzone zasoby produkcyjne w `assets/branding/`.
- `PROMOCYJNE`: zatwierdzone materiały do promocji projektu.
- `ALTERNATYWNE`: zatwierdzone warianty poza podstawową identyfikacją.
- `ARCHIWALNE`: materiały zachowane historycznie, nie do użycia produkcyjnego.
- `ROBOCZE`: materiały bez zatwierdzenia lub wymagające klasyfikacji.

Samo wystąpienie `PRO` w nazwie nie oznacza zatwierdzenia. `wymagaKlasyfikacji`
oznacza, że przeznaczenie nie jest potwierdzone. Nie przypisujemy fikcyjnego użycia.
Pole `wykorzystanie` zawiera wyłącznie potwierdzone miejsca; pusta lista oznacza
brak potwierdzonego wykorzystania w aplikacji.

**Oficjalne**: `assets/branding/Ikona mózg–żarówka w zieleni i złocie_PRO.png`
jest źródłem generowania ikon Web/PWA i Android przez `scripts/generuj-ikony.py`.
`assets/branding/ogarniacz-pro.ico` jest poprawnym ICO produkcyjnym,
identycznym z `public/favicon.ico`. Szczegóły: [oficjalne zasoby](../assets/branding/README.md).

Dostarczony PNG PRO w `multimedia` jest identyczny bajt w bajt z oficjalnym
oryginałem. Pozostaje lokalnie bez zmian, z dokładną regułą `.gitignore`;
katalog publikuje jedną referencję do `assets/branding`, a `duplikatyLokalne`
dokumentuje oryginalne położenie. Pozostałe dostarczone pliki są zachowane
bez zmiany nazw i bajtów. Nie ma nowych kopii oficjalnych ikon.

Oba dostarczone ICO (`…_PRO.ico`, `OGARNIACZ_IKONA_KAFEL.ico`) deklarują
256 × 256, ale zawierają odpowiednio obrazy 1100 × 1100 i 1146 × 1044.
To materiały **ARCHIWALNE**, z ostrzeżeniem; podgląd używa powiązanego PNG.
Przycisk pobierania nadal zapisuje oryginalne ICO. Nie zastępują ikony PRO.
Pozostałe PNG w `multimedia` są robocze i wymagają klasyfikacji.

Kontrola przed pierwszą publikacją: odczyt obrazów i klatek ICO, przegląd
wizualny wszystkich PNG, sygnatury, wymiary, SHA-256, pola EXIF i sygnatury
typowych sekretów. Nie znaleziono danych prywatnych ani sekretów. Dwa PNG
zawierają metadane programu edycyjnego, czasu edycji, rozdzielczości i miniatury;
nie zawierają pól autora ani GPS. Oryginały i metadane zachowano bez zmian.
Ta kontrola nie zastępuje przeglądu nowych plików przed ich publikacją.

## Katalog i dodawanie materiałów

1. Sprawdź prawa do publikacji, zawartość obrazu/pliku, metadane i brak sekretów.
   Nigdy nie umieszczaj tu prywatnych dokumentów ani kopii danych użytkowników.
2. Dodaj materiał do `multimedia/` (możliwe podkatalogi). Dla nowych plików
   stosuj opisowe polskie nazwy, np. `plakat-ogarniacz.png`; unikaj samych UUID.
   Istniejące nazwy, polskie znaki i rozszerzenia pozostają zachowane.
3. Uruchom z katalogu repozytorium:
   `node scripts/katalog-multimediow.mjs`.
4. Sprawdź nowy wpis i uzupełnij `nazwa`, `opis`, `kategoria`, `status`,
   `przeznaczenie`, `wykorzystanie` oraz `wymagaKlasyfikacji`. Automat zachowuje
   opisy i identyfikatory istniejących ścieżek. Nowe wpisy są robocze.
5. Uruchom `node scripts/katalog-multimediow.mjs --sprawdz`, a następnie
   `npx vitest run src/modules/multimedia`. Zweryfikuj zmiany przez `git diff`.
6. Dodaj do commita wyłącznie sprawdzone pliki, katalog i potrzebną dokumentację;
   opublikuj na `main`. W aplikacji wybierz **Odśwież bibliotekę**.

Generator nie zmienia plików graficznych. Czyta PNG/ICO, wylicza rozmiary
i SHA-256, wykrywa duplikaty (pierwszeństwo mają `assets/branding`) i sprawdza
strukturę nagłówków. Pełny odczyt nowych obrazów oraz kontrola prywatności
pozostają obowiązkiem opiekuna. Inne formaty otrzymują typ
`application/octet-stream` i ostrzeżenie do czasu klasyfikacji i weryfikacji.

Format v1: `format`, `wersja`, `materialy`. Każdy wpis zawiera unikalne `id`,
opisy, kategorię i status, ścieżkę względem repozytorium, MIME, `rozmiarBajtow`,
`rozdzielczosc` (lub `null`), SHA-256 i wynik walidacji. Opcjonalne
`sciezkaMiniatury` / `sciezkaPodgladu` odnoszą się do istniejących obrazów.
Ścieżki materiałów są ograniczone do `multimedia/` i `assets/branding/`,
a podglądy mogą też używać obrazów z `public/`. Nie zapisuj URL-i we wpisach.
Aplikacja generuje adresy z kodowaniem każdego segmentu, także polskich znaków.

## Odczyt, podgląd i pobieranie

Adres katalogu: `https://raw.githubusercontent.com/kapi1944/Ogarniacz/main/multimedia/katalog.json`.
Adresy oryginałów powstają z tej samej bazy i ścieżki wpisu; odnośnik do źródła
prowadzi do GitHub. W GitHub można użyć również przycisku **Raw / Download**.

W aplikacji dostępne są wyszukiwanie, kategorie, statusy, podgląd, szczegóły,
kopiowanie adresu i pobranie oryginału z jego nazwą oraz MIME. Duże oryginały
ładują się dopiero po wybraniu miniatury/podglądu lub pobrania. Małe istniejące
miniatury oficjalnych ikon mogą ładować się leniwie. Brak podglądu danego formatu
jest oznaczony ikoną pliku. Media nie są dodawane do globalnego cache PWA.

Zapamiętywany lokalnie jest tylko ostatni poprawny katalog JSON. Bez sieci
można przeglądać tę listę, ale obrazy i pobranie wymagają dostępu do GitHub.
Błąd odświeżania nie usuwa zapamiętanej listy. Brak dostępu do pamięci
przeglądarki nie blokuje działania online. Nie ma tokenów, kont GitHub ani API zapisu.
Wejście do modułu wysyła do GitHub żądanie katalogu, a wybranie obrazu/pliku
żądanie zasobu. Dostawca widzi standardowe dane połączenia (np. IP);
nie wysyłamy danych Ogarniacza, cookies ani referrera. Aby nie korzystać
z tego źródła, nie otwieraj modułu. Wyszukiwanie i filtry działają lokalnie.

Web/Windows/PWA/Raspberry: natywne pobieranie przeglądarki. Komunikat potwierdza
rozpoczęcie pobierania; docelowy zapis kontroluje przeglądarka. Android:
istniejąca wtyczka eksportu otwiera systemowy wybór miejsca SAF i potwierdza
zapis dopiero po ponownym odczycie identycznych bajtów. Anulowanie jest odrębne
od błędu. Zapis SAF wymaga wersji aplikacji zawierającej rozszerzony most
binarny; późniejsze zmiany samych materiałów nie wymagają nowego APK.
Nie wykonano testu SAF na fizycznym urządzeniu.

Pobieranie wewnątrz aplikacji jest ograniczone do 32 MiB na plik; większe
materiały można pobrać przez „Źródło na GitHub”. Przed zapisem aplikacja
porównuje rozmiar i SHA-256 oryginału z katalogiem. Niezgodność blokuje zapis
i wymaga odświeżenia listy. Sam katalog ma limit 2 MiB i 1000 wpisów.
Odświeżenie katalogu dodaje parametr czasu, a adresy obrazów i pobrań parametr
SHA-256, aby poprzednie odpowiedzi CDN nie przesłaniały nowych materiałów.

## Weryfikacja implementacji (2026-10-21)

- Publiczny GitHub Raw: katalog i 8 oryginałów HTTP 200, zgodne rozmiary i SHA-256.
- 28 celowanych testów biblioteki, eksportu plików i nawigacji; dodatkowo 55
  testów backupu, karty zdrowotnej i personalizacji.
- Typecheck, lint (istniejące ostrzeżenia poza zmianą), build i PWA smoke.
- Rzeczywisty Chrome, izolowany profil: Klasyczny/Premium/Flat przy 390 × 844,
  1024 × 600 i 1440 × 900; brak poziomego przepełnienia; miniatury, podgląd,
  filtry, schowek, klawiatura, powrót do Pulpitu i brak błędów JavaScript.
- Pobranie PNG i ICO w Chrome: oryginalne nazwy oraz zgodne bajty i SHA-256.
  Awaria sieci nie usuwa listy; ponowienie odczytu działa.
- Natywne testy eksportu w Windows: 11/13 zaliczonych, w tym nowe przypadki
  binarne. Dwa testy udostępniania przez FileProvider zawodzą na konfiguracji
  ścieżek Windows również po uruchomieniu oryginalnych źródeł z commita bazowego.
  Zmiana nie modyfikuje FileProvider ani udostępniania backupów.
- Android SAF: **NIETESTOWANE NA URZĄDZENIU**. Nie wykonano próby fizycznej
  Raspberry Pi ani instalacji PWA. Emulacja dotyku nie zastępuje urządzenia.

CI należy oceniać dla konkretnego SHA wdrażanej zmiany. Push kodu nie wykonuje
release, deploy ani aktualizacji już zainstalowanej aplikacji.
