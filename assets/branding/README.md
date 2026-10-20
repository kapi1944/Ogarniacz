# Oficjalna ikona Ogarniacza PRO

Nadrzędne źródło: `Ikona mózg–żarówka w zieleni i złocie_PRO.png`,
RGBA 1100 × 1100, zachowane bajt w bajt.
SHA-256: `bf2f2065444c427eeb0585a61d6e380b04cab1b15f587e4e63e1a28a9f7cefef`.

`ogarniacz-pro.ico` zawiera prawidłowe obrazy 16, 24, 32, 48, 64, 128 i 256 px.
Nie korzystamy z dostarczonego wadliwego ICO.

Odtworzenie zasobów: `python scripts/generuj-ikony.py` (Python z Pillow).
Skrypt używa LANCZOS i kanału alfa; nie przerysowuje znaku, nie dodaje tła,
obramowania ani zaokrągleń. Nie wymaga instalowania zależności aplikacji.

- Web/PWA: `public/favicon.svg` osadza PNG 512 px pochodzący z oryginału;
  pozostałe zasoby to ICO, favicon 16/32 px, Apple 180 px i PWA 192/512 px.
  Cel `any` zachowuje gotowy kafelek; nie deklarujemy go jako `maskable`.
  Adresy mają `branding=pro-1`, a Workbox rozpoznaje ten parametr przy
  odczycie zasobów z precache. Rewizje treści nadal wylicza Workbox;
  aktualizacja service workera pozostaje zatwierdzana przez użytkownika.
- Android: pięć gęstości mdpi–xxxhdpi. Ikony zwykłe zachowują pełny kafelek;
  okrągłe mają przezroczysty margines. Adaptive Icons używają istniejących
  XML i warstwy 108 dp, z oryginałem wyśrodkowanym w 48 dp oraz przezroczystym
  tłem. Cały nieprzezroczysty znak mieści się w bezpiecznym kole 66 dp.
  Istniejące skróty i ekran startowy korzystają z tych samych zasobów.
  Konfiguracja nie używa warstwy monochromatycznej, więc jej nie dodajemy.
- Windows: repozytorium nie zawiera aplikacji natywnej; instalowana PWA,
  jej skróty i pasek zadań korzystają z manifestu. ICO obsługuje przeglądarkę
  i może być wykorzystane do ręcznie utworzonego skrótu systemowego.
- Raspberry Pi: repozytorium nie zawiera osobnego launchera ani pliku
  `.desktop`; serwowany frontend korzysta ze wspólnych zasobów Web/PWA.

System operacyjny lub przeglądarka mogą samodzielnie dołożyć tło albo
zachować ikonę istniejącej instalacji w swoim cache. Zasoby aplikacji
nie dokładają drugiego kafelka. Wygląd launchera, paska zadań i istniejących
skrótów wymaga osobnej próby na urządzeniu po późniejszej publikacji.
Ta zmiana nie wykonuje release, deploy, instalacji ani publikacji APK.

Walidacja lokalna (2026-10-20): poprawne 20 PNG (rozmiary, RGBA, narożniki
i maski), oba ICO z siedmioma klatkami, SVG i XML Adaptive Icons; SHA-256
oryginału zgodne. Natywne Win32 `LoadImage` odczytuje wszystkie rozmiary ICO,
w tym 256 px z identycznymi nieprzezroczystymi pikselami RGB.
`npm run android:build` zakończył typecheck, build Vite, Capacitor sync
i `assembleDebug`. `npm run pwa:smoke` oraz trzy testy
`src/app/AktualizacjaPwa.test.tsx` przeszły. Chrome w izolowanym profilu
odczytał offline wszystkie siedem wersjonowanych ikon z service workera;
SHA-256 odpowiedzi zgadzały się z plikami. Lint zakończył się bez błędów,
z istniejącymi ostrzeżeniami poza zakresem ikon.
Nie wykonano próby na telefonie, zainstalowanej PWA ani Raspberry Pi.

Geometria maski: [Android Adaptive Icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).
Znaczenie `any` i `maskable`: [Web Application Manifest](https://www.w3.org/TR/appmanifest/#icon-masks).
