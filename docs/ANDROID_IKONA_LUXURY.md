# Ikona Android Luxury — 2026-10-27

Źródło: `multimedia/Ogarniacz_Luxury_Android.png`, RGBA 1254 × 1254,
zachowane bez zmian. SHA-256:
`06a41fbf982d20c5a63f7289508505245de89bffeb79140da4ed5569a07da3ab`.
Nie wygenerowano ani nie przerysowano logo. Web/PWA/desktop nadal używają PRO.

## Przyczyna i konfiguracja

Poprzedni generator umieszczał cały gotowy kafelek w 48 dp na warstwie
108 dp. Tło `#00000000` nie wypełniało pozostałej powierzchni maski;
launcher mógł pokazywać własne podłoże. Kod potwierdza pomniejszenie
i przezroczystość, ale bez telefonu nie potwierdzono sposobu rysowania
czarnego pola przez konkretną wersję One UI.

Oba istniejące XML `mipmap-anydpi-v26/ic_launcher{,_round}.xml` nadal
korzystają z `@color/ic_launcher_background` i `@mipmap/ic_launcher_foreground`.
Tło jest teraz nieprzezroczyste, ciemnozielone `#00251C`. Warstwa przednia
ma 108 dp, kompozycja zajmuje środkowe 72 dp, a zapas animacji wynosi
18 dp z każdej strony. System nadaje widoczny obrys całej kompozycji;
nie narzucamy masce Samsunga własnego kształtu.

Usunięto zewnętrzny margines eksportu PNG: kwadratowy wycinek
`(42, 41, 1212, 1211)` zachowuje proporcje grafiki. Nie rozciągamy osobno
osi, nie usuwamy faktury i nie zmieniamy emblematów. Ozdobny kafelek
wypełnia nominalną maskę zamiast mieścić się w bezpiecznym kole 66 dp;
bezpieczny obszar dotyczy znaku, nie całego tła z ozdobną ramką.

Ramka jest częścią oryginalnego rastra: system może przyciąć jej fragmenty,
zwłaszcza przy masce koła. Nie da się zachować jednej rastrowej ramki
dokładnie wzdłuż wszystkich różnych masek bez zmiany grafiki. Dokładnego
położenia ramki na One UI nie potwierdzono na urządzeniu. Lokalny podgląd
zaokrąglonego kwadratu nie jest pomiarem maski ikony „Moje pliki”.

## Odtwarzanie i pliki

`python scripts/generuj-ikony-android.py` (Pillow) generuje wyłącznie Androida.
`scripts/generuj-ikony.py` deleguje etap Androida do tego samego generatora.

- `ic_launcher.png`: 48/72/96/144/192 px, oryginał bez dodatkowego marginesu.
- `ic_launcher_round.png`: te same wymiary, rzeczywista maska koła na
  nieprzezroczystej kompozycji, bez pomniejszonego wewnętrznego kwadratu.
- `ic_launcher_foreground.png`: 108/162/216/324/432 px.
- Powyższe trzy pliki w każdym katalogu `android/app/src/main/res/mipmap-`
  `mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi` — łącznie 15 PNG.
- `android/app/src/main/res/values/ic_launcher_background.xml`.
- Oryginalny PNG, oba generatory, ten dokument i opis w `assets/branding/README.md`.

Manifest, XML Adaptive Icons, applicationId, nazwa, wersja, podpisy
i konfiguracja aktualizacji pozostają bez zmian. Źródłowy PNG nie jest
automatycznie dodawany do katalogu multimediów aplikacji.

## Weryfikacja

- Odczyt wszystkich 15 PNG: RGBA, poprawne rozmiary; kompozycja Adaptive Icon
  w każdej gęstości ma pełną nieprzezroczystość.
- Parsowanie XML: oba Adaptive Icons, kolor tła i referencje manifestu poprawne.
- Lokalny podgląd koła, orientacyjnej maski squircle i zaokrąglonego kwadratu:
  duży znak bez ucięcia błyskawic, promieni ani mózgożarówki; brak zewnętrznego
  czarnego kafelka. Koło przycina ozdobną ramkę.
- `:app:assembleDebug --offline --console=plain`: **BUILD SUCCESSFUL**,
  w tym kompilacja i pakowanie zasobów. Bez synchronizacji/deploy aplikacji.
- Ponowne generowanie daje identyczne SHA-256 wszystkich 15 bitmap;
  piksele wszystkich 15 zasobów odczytanych ze zbudowanego APK są zgodne
  z wygenerowanymi PNG. `git diff --check` bez błędów.
- Brak fizycznego Samsunga: launcher, szuflada i ostatnie aplikacje wymagają
  próby na urządzeniu. Podglądy geometryczne nie zastępują tego testu.

Nowa ikona wymaga nowego APK z tymi zasobami. Nie opublikowano APK
i nie instalowano ani nie aktualizowano aplikacji na urządzeniu.
