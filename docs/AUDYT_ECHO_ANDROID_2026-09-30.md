# Celowany audyt Echo na Androidzie — 2026-09-30

Zakres: lokalny `main`, commit `dca5d9a250a1514951db947f2418195470a87019` (1.0.14). Drzewo przed audytem czyste; `main` i lokalny `origin/main` zgodne (0/0). Bez internetu/fetch nie potwierdzono aktualnego stanu zdalnego GitHuba. Zmieniono wyłącznie ten raport. Bez przebudowy kodu, pełnego CI, buildów i testów urządzeniowych.

**Znaczenie ocen:** DZIAŁA = potwierdzona implementacja/logika, ewentualnie celowany test; nie oznacza potwierdzenia na telefonie. CZĘŚCIOWO = istnieje ścieżka, lecz ma ograniczenie lub brak elementu. BRAK = brak implementacji w sprawdzonym źródle. NIEZWERYFIKOWANE = wymaga urządzenia, działającej infrastruktury lub prywatnej konfiguracji.

## Zestawienie

| Obszar | Stan | Dowód i ograniczenia |
| --- | --- | --- |
| Mikrofon → STT → Echo → wykonanie → odpowiedź | CZĘŚCIOWO | `EchoGlosPlugin.java`, `GlosEchoService.ts`, `KontrolerSesjiGlosowejEcho.ts`, `AgentEcho.ts`. Implementacja kompletna od wejścia ręcznego; fizyczny mikrofon/STT/TTS NIEZWERYFIKOWANE. |
| Porcupine | CZĘŚCIOWO | Gradle: `ai.picovoice:porcupine-android:4.0.2`; `MainActivity` rejestruje `WakeWordEchoPlugin`; czułość 0.65. Detekcja zatrzymuje silnik przed przekazaniem do STT. |
| Model wake word | BRAK | W `android/app/src/main/assets/echo` jest tylko README; wymagany `echo/hej_echo_android.ppn` nie istnieje. Nie znaleziono `.ppn` ani `.pv` przez `rg --files`. |
| Klucz/aktywacja SDK, skuteczność „Hej Echo” | NIEZWERYFIKOWANE | Klucz pobierany z `PICOVOICE_ACCESS_KEY` lub `android/local.properties`, wpisywany w BuildConfig. Nie odczytywano sekretów ani APK. README opisuje angielski „Hey Echo”; aktualnego wsparcia języków producenta nie sprawdzano. |
| Wywołanie Echo | DZIAŁA | `/echo`: tekst, przycisk mikrofonu, ponowienie/przerwanie i odczyt. Provider sesji obejmuje wszystkie trasy (`src/App.tsx`), więc skonfigurowany wake word nie wymaga otwartego widoku Echo. |
| Nasłuch w tle / po zamknięciu | BRAK | Kontrolery zatrzymują wake word i anulują rozmowę po `appStateChange` na nieaktywny. Brak własnego foreground service mikrofonu w źródłach/manifestcie. |
| Zadania | CZĘŚCIOWO | `NarzedziaEcho.ts`: wyszukiwanie, tworzenie, edycja, wykonanie, usuwanie. `complete_task` omija domenowe ukończenie/cykliczność; szczegóły niżej. |
| Przypomnienia | CZĘŚCIOWO | Narzędzia: `list_reminders`, `create_reminder` (absolutne), `reschedule_reminder`. Dostarczanie: `SilnikPrzypomnien` → natywne LocalNotifications; akcje „Wykonane”/„Za 15 min”. Narzędzia Echo nie zapewniają pełnego CRUD ani tworzenia cyklicznych przypomnień. Dostarczenie na telefonie NIEZWERYFIKOWANE. |
| Kontekst pracy | DZIAŁA | `KontekstPlanowaniaEcho.ts`: harmonogram + najnowszy wyjątek dnia + bloki + wizyty → przed/po pracy, połowa pracy, wolne okna dla dziś/jutro; używa Planera. Inne daty wymagają narzędzi; nie należy utożsamiać tej migawki z całym grafikiem. |
| Szybki/swobodny niezależnie od tempa | DZIAŁA | `KonfiguracjaRozmowyEcho` rozdziela stan trybu i tempa; tryb trafia do instrukcji modelu i ustawień, nie resetuje kontekstu. Tempo zmienia limity STT, nie szybkość TTS. Brak `setSpeechRate` w natywnym głosie. |
| Potwierdzenia i polityka | DZIAŁA | Walidacja Zod, dostęp do modułu, sprawdzenie stanu/duplikatów, polityka ryzyka, dziennik, plan wielokrokowy. Potwierdzenie głosowe „tak” lub przycisk modalu; niskie ryzyko może zapisywać bez pytania. Nie każde polecenie wymaga zgody. |
| Manifest / uprawnienia / lifecycle | CZĘŚCIOWO | `RECORD_AUDIO`, runtime permission w obu pluginach, zwalnianie STT/TTS/Porcupine przy destroy, anulowanie przez warstwę TS. Brak własnych natywnych hooków pause/stop. Dostępność usług Androida i końcowy scalony manifest NIEZWERYFIKOWANE. |
| Deep linki / skróty | DZIAŁA | Manifest `ogarniacz:` + `singleTask`, `appUrlOpen`/`getLaunchUrl`, parser z listą dozwolonych tras. `ogarniacz://echo` otwiera widok; cztery skróty dodają zadanie/notatkę/wydarzenie/przypomnienie. Brak skrótu Echo i parametru uruchamiającego mikrofon. |
| Natywny widżet | CZĘŚCIOWO | `WidgetSnapshotService` jest inicjalizowany w `main.tsx`, zapisuje `widget/today.json` przez `WidgetBridgeService`. BRAK AppWidgetProvider, deklaracji odbiornika widżetu i jego interfejsu. Flaga dostępności mostu oznacza Android, nie gotowy widżet. |
| Web / sync / Raspberry Pi | CZĘŚCIOWO | Wspólne UI, agent, domena i Dexie; różne adaptery audio/lifecycle/powiadomień. Backend ma `/api/echo/model`, sesję, CSRF i CORS; dostępność modelu i synchronizacja między urządzeniami NIEZWERYFIKOWANE. |

## Mapa zależności

```text
MainActivity → Capacitor/WebView → src/App.tsx → DostawcaSesjiEcho
  ustawienia glosEcho + hejEcho → KontrolerWakeWordEcho
    LifecycleService (tylko aktywna aplikacja)
    → WakeWordEchoService → WakeWordEchoPlugin → Porcupine + klucz + .ppn
    → zwolnienie mikrofonu → KontrolerSesjiGlosowejEcho
  przycisk mikrofonu ────────────────────────────┘
    → GlosEchoService → EchoGlosPlugin → SpeechRecognizer pl-PL
    → tekst końcowy / awaryjnie ostatni częściowy
    → EchoService → AgentEcho ↔ KontekstRozmowyEcho / preferencje
      → KontekstPlanowaniaEcho → repozytoria + harmonogram + Planer
      → bez adresu sync: LokalnySemantycznyProviderEcho
      → z adresem sync: LokalnyModelProviderEcho
        → HTTPS /api/echo/model + sesja/CSRF → server/serwer.ts
        → server/model-echo.ts → skonfigurowany prywatny model
      → NarzedziaEcho → walidacja/dostęp/polityka/potwierdzenie
        → serwisy domenowe / repozytoria → Dexie → kolejka sync → backend
      → wynik / dziennik → UI + TextToSpeech pl-PL → kolejna wypowiedź
      → bezczynność → wznowienie wake word

Przypomnienia w Dexie → SilnikPrzypomnien → NotificationService
  → HarmonogramPrzypomnienAndroid → LocalNotifications → akcje/nawigacja
Dane w Dexie → WidgetSnapshotService → widget/today.json (brak odbiorcy natywnego)
Intent ogarniacz: → NawigacjaPlatformy → trasy.ts → widok/szybkie dodawanie
```

Android i web współdzielą kod, ale mają osobne lokalne bazy. Zapisy Echo idą zwykłą ścieżką synchronizacji repozytoriów (`Repozytorium.ts`, `KolejkaSynchronizacji.ts`). `pamiecEcho` i `dziennikEcho` są jawnie wyłączone z sync; historia rozmowy żyje w sesji React/agenta. Nie ma podstaw do uznania jej za trwałą lub wspólną między urządzeniami. Backend interpretuje zadanie modelu; wykonawca narzędzi pozostaje w kliencie. `/api/echo/message` istnieje, ale domyślnie ma niedostępną obsługę i nie jest ścieżką używaną przez obecnego agenta.

## Kod do ponownego wykorzystania

- Audio/lifecycle: `android/app/src/main/java/pl/ogarniacz/app/{EchoGlosPlugin,WakeWordEchoPlugin}.java`, `src/platform/{GlosEchoService,WakeWordEchoService,LifecycleService}.ts` oraz oba kontrolery w `src/services/echo`. Są już arbitraż mikrofonu, częściowa transkrypcja, anulowanie, kontynuacja rozmowy i barge-in.
- Interpretacja/wykonanie: `EchoService`, `AgentEcho`, oba providery, `NarzedziaEcho`, `PolitykaDzialanEcho`, `PlanWykonaniaEcho`, `KontekstRozmowyEcho`, `PamiecPreferencjiEcho`; nie tworzyć drugiego wykonawcy dla Androida.
- Zadania/czas: `ZadaniaService.ukonczZadanie`, `RepozytoriumElementowZadan`, `PrzypomnieniaService`, `KontekstPlanowaniaEcho`, `PlanerService`, `logikaOsiCzasu`.
- Wejścia systemowe: `trasy.ts`, `NawigacjaPlatformy.tsx`, `ObslugaCelowPlatformy`, istniejący `shortcuts.xml`; podstawy widżetu: `WidgetSnapshotService` i `WidgetBridgeService`.
- Infrastruktura: obecne repozytoria/kolejka sync, `RuntimeConfigService`, `KonfiguracjaSynchronizacji`, `KontaService`, backend `serwer.ts`/`model-echo.ts`. Nazwa „LokalnyModelProvider” oznacza prywatny model za backendem, nie model działający na telefonie.

## Konkretne blokady i rozbieżności

1. **Wake word nie wystartuje z obecnych zasobów:** brak `hej_echo_android.ppn`; plugin zwraca `brakKonfiguracji` bez modelu lub klucza. Klucz i model w już zainstalowanym prywatnym APK pozostają nieweryfikowane. Nie utożsamiać obecności SDK z działającym „Hej Echo”.
2. **Wykonanie zadania omija reguły domeny:** `NarzedziaEcho.ts`, `complete_task` zapisuje sam `status: wykonane`; `update_task` również pozwala tak ustawić status. `ZadaniaService.ukonczZadanie` ustawia `wykonanoAt` i zwraca następne wystąpienie, czego te narzędzia nie robią. To blokada spójnej obsługi zadań cyklicznych przez Echo.
3. **Brak odporności interpretacji na niedostępny backend:** sam poprawny adres synchronizacji wybiera provider modelu; błąd HTTP/modelu daje komunikat niedostępności, bez przejścia do providera semantycznego. Pełny agent zależy od sesji, CSRF, sieci i konfiguracji modelu Raspberry Pi, także przy lokalnych danych.
4. **Offline STT nie jest zagwarantowane:** używany jest systemowy `createSpeechRecognizer`, bez wymuszenia on-device. Dostępność polskiego STT/TTS, sieć używana przez usługę, przerwania i akcent trzeba zweryfikować na docelowym urządzeniu. Źródłowy manifest nie zawiera `queries` dla RecognitionService/TTS; widoczność usług należy sprawdzić w scalonym manifestcie przed rozstrzygnięciem, czy to blokuje wykrywanie.
5. **Odczyt głosowy ma dwa zachowania:** `WidokEcho` uwzględnia `automatycznyOdczytEcho` dla wiadomości tekstowych; kontroler rozmowy głosowej zawsze wywołuje `glos.mow`. Polecenie „odpowiadaj tylko tekstem” nie stanowi w tej pętli wyłącznika TTS. Tempo jest ustawieniem sesyjnym, domyślnie spokojnym; tryb rozmowy jest zapisywany w ustawieniach.
6. **Rozszerzenia systemowe nie są gotowe:** deep link Echo tylko nawigacyjny; brak skrótu wywołującego głos, natywnego widżetu i nasłuchu w tle. To braki względem takich przyszłych scenariuszy, nie regresje obecnego trybu aktywnej aplikacji.
7. **Przypomnienie zapisane ≠ alarm dostarczony:** potrzebne włączone powiadomienia, zgoda i aktywne kanały; dokładność alarmu zależy od exact alarms (jest fallback niedokładny). `POST_NOTIFICATIONS` pochodzi z manifestu zainstalowanego pluginu LocalNotifications, mimo braku w manifestcie aplikacji. Nie potwierdzono działania po ubiciu/reboocie/ograniczeniu baterii.

## Weryfikacja i kolejność dalszych prac

Celowany `npm test --` dla: `KontrolerWakeWordEcho`, `KontrolerSesjiGlosowejEcho`, `AgentEcho`, `KontekstPlanowaniaEcho`, `NaturalneIntencjeZadanEcho`, `RozmowaNaturalnaEcho`, `trasy`, `WidgetSnapshotService`: **8 plików, 99 testów — przeszły**. Pierwsza próba została zatrzymana przez sandbox (`spawn EPERM`); ponowienie poza tym ograniczeniem zakończyło się powodzeniem. Testy z atrapami potwierdzają logikę, nie SDK Porcupine, mikrofon ani działający serwer. Nie testowano nowych scenariuszy i nie dodawano testów odtwarzających implementację.

Rekomendowana kolejność (bez realizacji w tym audycie): (1) wyrównać wykonanie zadań z domeną i rozstrzygnąć zachowanie automatycznego odczytu; (2) potwierdzić ręczny przepływ STT → lokalny zapis → TTS i dostarczanie przypomnień na docelowym Androidzie; (3) uzupełnić prywatną konfigurację/model wake word i zweryfikować przekazanie mikrofonu oraz powrót z tła; (4) potwierdzić sesję/model Raspberry Pi, awarie sieci i sync web ↔ Android; (5) dopiero po stabilizacji wykorzystać istniejące trasy do skrótu Echo i migawkę do natywnego widżetu. Nasłuch w tle wymaga osobnej decyzji o zakresie i cyklu życia.
