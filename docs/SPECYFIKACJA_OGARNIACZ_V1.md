# Skonsolidowana specyfikacja Ogarniacza v1

## Wizja

Ogarniacz jest prywatnym centrum dowodzenia codziennym życiem. Ma pamiętać, porządkować, ograniczać ręczne decyzje, zamieniać chaos w następne działania i integrować zadania, czas, zdrowie, informacje oraz przypomnienia.

Każda funkcja powinna zmniejszać liczbę rzeczy, o których użytkownik musi pamiętać, planować ręcznie albo pilnować samodzielnie.

## Platforma i prywatność

- aplikacja webowa i PWA, desktop-first, responsywna;
- local-first, bez konta, backendu i internetu;
- IndexedDB jako baza danych użytkownika;
- brak publicznych profili, feedów i rankingów;
- brak sekretów i kluczy API;
- architektura gotowa na przyszłe Android, Tauri i synchronizację bez przepisywania UI.

## Nawigacja i UI

- zwijany lewy sidebar pogrupowany tematycznie;
- prawdziwy routing URL z back/forward i odtwarzaniem podstrony po odświeżeniu;
- globalne „+” i wyszukiwanie z każdego widoku;
- szybki dostęp do Echo i Centrum przypomnień;
- gęsty, narzędziowy interfejs bez marketingowych hero i pustych kart;
- jasny/ciemny/systemowy motyw, hover/focus/active, widoczne granice, ikony i polski język;
- status nigdy nie jest przekazywany wyłącznie kolorem.

## Dzisiaj

Najważniejszy ekran odpowiada w kilka sekund: co zrobić teraz i co wymaga reakcji. Pokazuje:

- aktualny/następny blok oraz najważniejsze zadanie;
- oś dnia: bloki, wizyty i leki;
- zaległe i dzisiejsze zadania;
- dawki bez reakcji;
- aktywne przypomnienia, płatności i terminy ważności;
- nawyki i lokalną sugestię Echo;
- wejście do propozycji całego dnia/wieczoru.

## Moduły operacyjne

### Skrzynka

Surowy zapis tekstowy bez wymaganej klasyfikacji. Późniejsza konwersja do zadania, notatki, pomysłu, zakupu, wizyty lub „Na później” zachowuje historię źródła.

### Zadania i projekty

Zadanie ma opis, status, priorytet, opcjonalne terminy i estymację, projekt, kontekst, tagi, podzadania, relacje i recurrence. Obsługuje wykonanie, przywrócenie, odroczenie, filtry i sortowanie. Obowiązki domowe pozostają zadaniami.

Projekt ma cel, status, następne działanie, blokady i daty. Postęp jest liczony z powiązanych zadań.

### Planer i grafik

Grafik zawiera standardowy tydzień i wyjątki dat. Planer chroni pracę, wizyty i twarde bloki, uwzględnia priorytet, termin, opcjonalną estymację i nawyki. Proponuje cały dzień/wieczór, nie wypełnia więcej niż 75% dostępności obowiązkami, pozwala przesuwać/usuwać bloki i zaakceptować lub odrzucić plan.

### Zdrowie

Leki przechowują wyłącznie nazwę, instrukcję użytkownika, wiele godzin i aktywność. Dziennik dawki ma stany: oczekuje, zażyte, odroczone, pominięte. Jedno wystąpienie ma jedną bieżącą decyzję. System nie dobiera leków ani dawek.

Wizyty obsługują „do umówienia” i „umówiona”, termin graniczny, datę/czas, miejsce, placówkę, kontakt, notatkę, pytania, dokumenty i checklistę.

### Reminder engine

Wspólne przypomnienia absolutne, względne i cykliczne mają priorytet, stan, snooze i eskalację. Centrum przypomnień jest źródłem prawdy. Notification API jest dodatkiem zależnym od możliwości platformy.

### Nawyki

Codziennie, dni robocze, wybrane dni, X razy w tygodniu i interwał. Elastyczne okna, preferowany czas, minimalna wersja, historia oraz statystyki 7/30 dni. Pojedyncza przerwa nie zeruje danych.

### Organizacja

- Zakupy: wiele list, ilości, kategorie, status, sklep/lokalizacja/budżet.
- Rachunki: kwota, termin, status, recurrence i historia; płatność cykliczna tworzy następne wystąpienie.
- Sprawy na mieście: grupowanie istniejących zadań według kontekstu miejsca bez duplikacji.

### Wiedza i życie

- Cele powiązane z projektami i nawykami;
- Notatki z tagami i relacjami;
- Pomysły z konwersją do zadania/projektu/notatki;
- „Na później” z konwersją do zadania;
- Kontakty praktyczne, nie pełna książka adresowa;
- Dokumenty jako Blob w IndexedDB z metadanymi i ważnością;
- Terminy ważności z dokumentem, statusem, odnowieniem i przypomnieniem.

### Finanse

Prosty rejestr wydatków, kategorie, podsumowanie miesiąca, budżety okresu/kategorii i czytelne wykorzystanie limitu. Bez pełnej księgowości.

## Echo

Echo ma własny panel tekstowy, opcjonalne Web Speech API i fallback tekstowy. Lokalny provider odpowiada na pytania o dziś, pilność, zaległości i wolny czas; zapisuje zadania, notatki i pomysły oraz przekłada zadanie na jutro po potwierdzeniu.

Ryzyko działań jest centralnie klasyfikowane. Pamięć Echo jest widoczna, edytowalna i usuwalna przez Właściciela. Historia ważniejszych działań jest trwała.

## Użytkownicy

Istnieją wyłącznie role Właściciel i Edytor. Właściciel ma pełny dostęp. Edytor widzi/edytuje jawnie udostępnione moduły zgodnie z `PermissionGrant`. Lokalny podgląd służy testom i nie udaje zdalnego współdzielenia.

## Dane, backup i PWA

- wersjonowany schemat i migracje;
- repozytoria oddzielające UI od storage;
- UUID, ISO, `updatedAt` i tombstones;
- pełny eksport JSON z Blobami, walidowany import: scalanie/nadpisanie;
- manifest, ikony, service worker, statyczny offline shell i instalacja PWA.

## Poza v1

Finalny backend, synchronizacja, uwierzytelnienie, niezawodne alarmy platformowe, Smart Home, podróże, zewnętrzne integracje i finalny provider AI pozostają otwartymi, udokumentowanymi decyzjami.

## Definicja ukończenia

Ukończony v1 uruchamia się lokalnie, zapisuje dane trwale, ma routing, PWA, globalne „+”, wyszukiwanie, działające CRUD wszystkich wymienionych modułów, Echo, permission engine, backup/import, motywy, responsywność, testy logiki oraz przechodzące lint, typecheck, tests i build.
