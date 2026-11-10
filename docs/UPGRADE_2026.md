# Upgrade 2026 — wynik analizy i kolejność rozwoju

Data: 2026-11-10. Zakres sesji: instrukcje, dokumentacja, organizacja; bez zmiany kodu aplikacji, modeli, danych, synchronizacji i wydań.

Aktualizacja: etap 1B wykonano lokalnie po tym punkcie odniesienia. Poprzednie 12 zmian dokumentacyjnych zapisano osobno w commicie `3cd6328`; implementacja 1B pozostaje niezatwierdzona. Nie wykonano pushu ani integracji gałęzi.

## Punkt odniesienia i granice analizy

- Repozytorium `kapi1944/Ogarniacz` jest publiczne. Lokalny HEAD: `7163d1d`, gałąź `codex/kokpit-2`; katalog roboczy na początku był czysty.
- `git ls-remote` potwierdził brak zdalnej `codex/kokpit-2` i `main` na `30e946fcf1a1a8af720e55f20f59f167f2f5e64c`. Relacja HEAD/main: **15 commitów tylko lokalnej gałęzi, 3 tylko main**. Nie wykonano integracji ani modyfikacji referencji. Dokumentacja opisuje tę lokalną bazę, nie stan wdrożenia ani identyczność z main.
- Przejrzano wejścia instrukcji, sześć skilli, właściwe dokumenty zasad, mapę katalogów, przepływ Echo/głosu/modelu/pamięci, właścicieli lokalnych danych i sync, konfigurację platform oraz testów. Kontrola prywatności była ograniczona do nazw śledzonych plików, metadanych i wybranych wzorców sekretów.
- Bez dostępu do produkcyjnej bazy, prywatnych env, treści kopii użytkownika, SSH, urządzeń i logów rozmów. Nie przeprowadzono pełnego audytu bezpieczeństwa ani jakości wszystkich modułów.

## Problemy wymagające działania

| Obszar | Istniejące rozwiązanie | Problem potwierdzony | Zalecana poprawka / wynik sesji |
|---|---|---|---|
| Instrukcje | AGENTS, CLAUDE i Cursor odsyłały do tych samych zasad | Powielone mapy; Claude/Cursor nadal wskazywały Web OTA jako aktualny release | Krótki import/pointer, jedna mapa w AGENTS, zasady w INSTRUCTIONS |
| Architektura | Repozytoria, Dexie 21, konta, backend i sync HTTP | ARCHITECTURE opisywał przyszłą synchronizację, stary provider Echo i backup 1; nakazywał plan dla każdej zmiany | Aktualna mapa implementacji i odsyłacze; proporcjonalność zgodna z INSTRUCTIONS |
| Dokumentacja startowa | README z pierwszej wersji aplikacji | Nieaktualny opis localStorage, backupu i środowiska Node | Skorygowano sprawdzone fragmenty, dodano wejście do Echo |
| Skille | Sześć niewielkich skilli Codex; brak `.claude/skills/` | Brak konkretnego routingu dla istniejącego Echo i wyjątków sync | Rozszerzono module-builder i test-selector; bez nowych skilli i kopii biblioteki |
| Dokumentacja Echo | Szczegółowe dokumenty kolejnych etapów | Mieszają wdrożone funkcje z dawnymi planami | Nowy bieżący indeks ECHO; poprzednia architektura oznaczona jako materiał etapów |
| Kontrakty głosu | Wspólny adapter STT/TTS, wymienny provider LLM i interfejs wake word | Brak jawnych granic STT i TTS | **1B ukończone lokalnie:** typowane kontrakty bez wymiany adaptera |
| Stany Echo | Stany agenta i kontrolera głosu oraz aktywność tekstu | Brak wspólnej projekcji i obsługi konkurencji w UI | **1B ukończone lokalnie:** projekcja, priorytety i anulowanie opisane w ECHO |
| Prywatność historii | Usunięty eksport + reguły ignorowania | Historyczny plik nadal istnieje w obiekcie `901c3627` | Zachować procedurę z SECURITY; decyzja właściciela, bez odczytu treści i przepisywania historii |
| Baza backendu | `server/config.ts` domyślnie używa `./data/ogarniacz.sqlite` | Katalog runtime nie miał własnej reguły `.gitignore` | Dodano `/data/`, obejmujące bazę i WAL/SHM, bez wpływu na `src/data/` |
| Porządek repo | Lokalne kopie, pliki sesji, binaria i archiwa | Brak reguł dla części katalogów sesji; stare załączniki i instalator są już śledzone | Dodano precyzyjne ignore dla nowych plików; istniejące zachowane, klasyfikacja poniżej |

## Instrukcje i oszczędność pracy

`docs/INSTRUCTIONS.md` jest wspólnym źródłem zasad, `docs/ARCHITECTURE.md` mapą implementacji, `docs/ECHO.md` wejściem do Echo. `AGENTS.md` wybiera dokumenty i skille. `CLAUDE.md` importuje `@AGENTS.md`, a `.cursorrules` wskazuje te same źródła. Import jest wspieranym sposobem współdzielenia instrukcji w [Claude Code](https://code.claude.com/docs/en/memory#share-one-file-with-other-coding-tools). Codex używa [AGENTS.md](https://developers.openai.com/codex/guides/agents-md) i [skilli w `.agents/skills`](https://developers.openai.com/codex/skills).

Nie utworzono drugiej biblioteki Claude. Claude ma czytać pasujące źródła `SKILL.md` jako instrukcje zadania; nie deklarujemy automatycznej dostępności komend slash dla tych plików. Pięć wymaganych obszarów (moduły, formularze, UI, testy, GitHub) już ma własne skille. Echo i granice synchronizacji otrzymały warunkowy routing w istniejącym skillu budowania modułów, zamiast dwóch nowych procedur dublujących wykonawcę i repozytoria.

Oszczędność wynika z usunięcia powtarzanych instrukcji, krótszej ścieżki do właściciela kodu, oddzielenia historii od aktualnego stanu oraz testów dobieranych do diffu. Raport badawczy nie jest importowany na początku każdej sesji. Nie zmierzono liczby tokenów ani czasu porównywalnych sesji, więc nie deklarujemy procentów oszczędności.

## Klasyfikacja katalogu głównego

| Klasa | Przykłady rzeczywiście obecne | Postępowanie |
|---|---|---|
| Wymagane źródła i konfiguracja | `src/`, `server/`, `public/`, `android/`, `windows/`, `deploy/`, `scripts/`, `config/`, `assets/`, `multimedia/`, `package*.json`, `tsconfig*.json`, Vite, Capacitor, `.github/` | Zachować; nie przenosić ścieżek używanych przez build i dystrybucję bez analizy odwołań |
| Dokumentacja / materiały projektu | `docs/`, README, instrukcje agentów, `.agents/`, informacje o wydaniach, broszury PDF i mapa SVG | Zachować. Materiały wizualne/PDF czytać tylko przy zadaniu ich dotyczącym |
| Archiwalne | `ogarniacz_etap1_patch.zip`, rozpakowany `ogarniacz_etap1_patch/`, `.backup-20260913-*` | Bez usuwania; katalogi kopii objęto ignore. Ewentualne przeniesienie paczki wymaga sprawdzenia jej sposobu użycia |
| Generowane automatycznie | `node_modules/`, `dist/`, `dist-server/`, `artifacts/`, logi `ci-*.log`, `hs_err_pid*.log` | Już ignorowane przez reguły buildów/logów; nie włączać do kontekstu analiz |
| Kopie / dane prywatne | `ogarniacz-backup-*.json`, `ogarniacz-przed-migracja.json`, prywatne env | Zachowano istniejące reguły i dodano `/data/` dla domyślnego katalogu backendu (nieobecnego lokalnie podczas analizy). Bez przenoszenia i kasowania. `Backup Ogarniacza 3.txt` ma 57 bajtów i nie jest JSON-em; nazwa sama nie dowodzi, że to backup |
| Potencjalnie zbędne lub do przeglądu | `.tmp-konta-ui/`, `tmp/`, `.ogarniacz-publikacja-test-*`, `.codex-remote-attachments/`, `_instalatory/` | Dodano ignore katalogów roboczych i przyszłych załączników/instalatorów. Śledzone pliki pozostały śledzone; nie wykonano `git rm` |

Śledzone są trzy pliki demonstracji `.tmp-konta-ui/`, cztery JPG w `.codex-remote-attachments/`, archiwum patcha oraz `_instalatory/Ogarniacz-1.1.3-Setup.exe` (około 50 MB). `.gitignore` nie usuwa ich z indeksu ani historii. W tej sesji nie oceniano treści JPG/PDF ani nie usuwano materiałów użytkownika. To kandydaci do osobnego, świadomego uporządkowania; instalator nie jest dowodem aktualnego wydania.

## Prywatność: wynik i ograniczenia

**Potwierdzone:** publiczność repozytorium sprawdzono przez GitHub; `git cat-file -e` potwierdził istnienie historycznego eksportu bez odczytu danych. Dotychczasowy opis incydentu w [SECURITY.md](SECURITY.md#historyczny-eksport-w-publicznym-repozytorium-do-decyzji-właściciela) pozostaje właściwą procedurą. Nie oceniano zawartości ani nie potwierdzano, czy zawierała aktywne sekrety.

**Kontrola obecnego drzewa:** w śledzonych plikach tekstowych do 3 MB nie znaleziono wzorców kluczy prywatnych PEM/OpenSSH, tokenów GitHub, typowych kluczy `sk-` ani AWS Access Key ID. W nazwach śledzonych plików nie znaleziono bazy SQLite, keystore ani prywatnego env poza `.env.example`. To ograniczona kontrola wzorców, nie gwarancja braku danych prywatnych.

**Potencjalne zagrożenia:** załączniki i PDF mogą zawierać dane osobiste; nie poddano ich OCR ani oględzinom. `PICOVOICE_ACCESS_KEY` trafia do `BuildConfig` w Androidzie — prywatne źródło konfiguracji nie gwarantuje poufności wartości w APK. Systemowe STT może korzystać z zewnętrznej usługi mimo lokalności bazy i modelu Echo. Nie odczytywano klucza ani konfiguracji urządzenia.

Nie podejmowano rotacji, czyszczenia historii, force-pushu ani usuwania kopii. Te operacje wykraczają poza bieżące porządki dokumentacyjne.

## Graphify — ocena bez instalowania

Sprawdzony projekt: [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify), domyślna gałąź `v8`, pakiet **`graphifyy`**, CLI `graphify`, Python ≥3.10, Apache-2.0. Metadane API GitHub: commit `5eedffa87476` z 2026-11-09, wydanie `v0.9.105` z 2026-11-09; projekt nie jest zarchiwizowany. Źródła: [metadane pakietu](https://github.com/Graphify-Labs/graphify/blob/v8/pyproject.toml), [wydanie](https://github.com/Graphify-Labs/graphify/releases/tag/v0.9.105).

Kod analizuje lokalnie przez AST/tree-sitter. Dokumenty, PDF-y i obrazy mogą przechodzić przez model asystenta lub skonfigurowany backend; tryb kodowy nie wymaga LLM. Obsługuje Windows. Instalacja może rejestrować skille/hooki; zapytania mogą trafiać do lokalnego logu. Nie włączać go na całym katalogu Ogarniacza z prywatnymi kopiami. [README i prywatność](https://github.com/Graphify-Labs/graphify#privacy).

**Decyzja:** bez nowej zależności. `rg`, nawigacja TypeScript, testy i obecna mapa przepływu wystarczają dla lokalnych zmian. Graf AST może pomóc przy powtarzanych pytaniach o zależności między wieloma plikami; koszt to indeksacja, środowisko Python, aktualizacja indeksu i weryfikacja niepełnych/wywnioskowanych relacji. Nie zmierzono przewagi w tym repo. Graf kodu nie jest grafem danych użytkownika Echo.

Opcjonalny eksperyment dopiero po osobnym zleceniu: przygotować poza repo kopię wybranych, przejrzanych plików kontrolera głosu, interfejsu wake word i ich syntetycznych testów. Bez env, danych aplikacji, zdjęć, PDF i całego repo. Nie rejestrować integracji asystenta ani hooków. Dla wersji sprawdzonej podczas analizy:

```powershell
uv tool install graphifyy==0.9.105
$env:GRAPHIFY_BACKEND = 'none'
$env:GRAPHIFY_QUERY_LOG_DISABLE = '1'
graphify extract 'C:\Temp\ogarniacz-graphify-proba' --code-only --max-workers 1
```

To procedura do rozważenia, nie wykonane polecenia. Wymaga istniejących Python/uv; nie instalować ich tylko dla próby bez oceny kosztu. Składnia ekstrakcji i ograniczenia korpusu: [CLI](https://docs.graphify.com/open-source/configuration/cli). Porównać trzy pytania: kto uruchamia sesję, kto zwalnia mikrofon, gdzie reagujemy na tło. Zmierzyć czas budowy, RAM, czas odpowiedzi i poprawność wskazań względem kodu oraz `rg`. Nie oceniać brakujących krawędzi na kopii jako dowodu braku zależności w całej aplikacji. Zachować narzędzie tylko przy mierzalnej korzyści w powtarzanych zadaniach.

Wycofanie tej izolowanej próby: `uv tool uninstall graphifyy` (dla pipx: `pipx uninstall graphifyy`), przywrócić wcześniejsze wartości obu zmiennych i usunąć wyłącznie zweryfikowany katalog próby. Gdyby osobno zainstalowano integrację, najpierw zastosować `graphify uninstall` i sprawdzić diff skilli/hooków; nie używać `--purge` na katalogu z materiałami użytkownika. [Procedura integracji i usuwania](https://github.com/Graphify-Labs/graphify#make-your-assistant-always-use-the-graph).

## Herdr — ocena pracy wielu agentów

[Herdr](https://github.com/herdrdev/herdr) zarządza terminalami i sesjami agentów; nie zastępuje ich modeli. Apache-2.0, repo niezarchiwizowane; API GitHub wskazało commit `ee5bfb5041bb` z 2026-10-29 i [wydanie v0.9.5](https://github.com/herdrdev/herdr/releases/tag/v0.9.5) z 2026-10-14. Może utrzymywać sesje i obsługiwać worktrees/SSH. [Dokumentacja Windows](https://herdr.dev/tui/docs/windows-beta/) potwierdza natywne ConPTY i połączenia zdalne, ale także ograniczenia handoffu, wykrywania katalogu i podpisanych binariów; nie zakładać identyczności z Unix.

**Decyzja:** obecna sesja ma jeden zależny zakres dokumentów, więc nie ma korzyści z orkiestratora. Przy dwóch lub trzech niezależnych zadaniach wystarczą osobne gałęzie i `git worktree`, z jednym właścicielem integracji. Herdr warto rozważyć dopiero, gdy utrzymanie wielu terminali na kilku maszynach staje się powtarzalnym problemem. Każdy agent nadal zużywa własny kontekst i tokeny; dochodzi koszt koordynacji i przeglądu.

Przykład niezależności: badanie silnika na syntetycznych próbkach oraz praca nad izolowanym komponentem prezentacji. Nie rozdzielać jednocześnie zmian w `DostawcaSesjiEcho`, typach i kontrolerze między agentów. Worktree ogranicza kolizje plików roboczych, lecz nie eliminuje konfliktów przy scalaniu ani kolizji portów i urządzeń.

Raspberry Pi mogłoby być hostem terminali przez [SSH](https://herdr.dev/tui/docs/connecting-machines/) po sprawdzeniu binariów dla jego architektury, pamięci i obciążenia; nie testowano urządzenia. To nie zapewnia wydajnego inference LLM. Ewentualny dostęp wyłącznie istniejącym prywatnym kanałem, bez otwierania publicznego SSH, pracy jako root, kopiowania sekretów między agentami ani modyfikowania produkcyjnego checkoutu. Nie instalowano Herdr i nie zestawiano połączeń.

## Technologie głosu — kandydaci, nie wdrożenia

Aktywność sprawdzono 2026-11-10 przez metadane commitów i wydań GitHub, nie statystyki popularności. Obsługa języka oznacza deklarację/model dostępny upstream, nie pomiar jakości polskiego użytkownika. Wszystkie kandydatury wymagają odsłuchu i benchmarku na danych syntetycznych.

| Kandydat i źródło | Aktywność i licencja | Polski, lokalność, sprzęt i dopasowanie |
|---|---|---|
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | Commit 2026-11-06; wydanie 1.2.1 z 2025-10-31; MIT | Wielojęzyczne modele Whisper obsługują polski; nie wybierać `.en`. Python/CTranslate2, CPU int8 lub CUDA, lokalnie po pobraniu modelu. Kandydat do pomiaru na mocniejszym komputerze; dodatkowy runtime i transport, bez gwarancji opóźnień na Pi |
| [Whisper](https://github.com/openai/whisper) | Commit 2026-08-31; wydanie v20250625 z 2025-06-26; kod i wagi MIT | Wielojęzyczny STT z polskim, lokalny PyTorch/FFmpeg. Model i pamięć znacząco wpływają na opóźnienie. Punkt porównawczy, nie domyślny ciężki runtime Raspberry |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | Commit 2026-11-09; wydanie 1.9.5 z 2026-10-06; MIT | Wielojęzyczne wagi Whisper, kwantyzacja i jawne wsparcie Windows/Android/Raspberry Pi. Pierwszy kandydat do małego eksperymentu CPU/ARM; nadal wymaga kompilacji/modelu i pomiaru jakości małych wag |
| [Silero VAD](https://github.com/snakers4/silero-vad) | Commit 2026-10-22; wydanie 6.2.3 z 2026-09-23; MIT | Lokalna detekcja mowy 8/16 kHz, szeroki trening wielojęzyczny; nie transkrybuje polskiego. ONNX jako kandydat lekkiego toru; runtime i dostęp do PCM trzeba osobno przygotować, zwłaszcza na Androidzie |
| [openWakeWord](https://github.com/dscripka/openWakeWord) | Commit 2025-12-30; ostatnie wydanie 0.6.0 z 2024-02-11; kod Apache-2.0, gotowe modele CC BY-NC-SA 4.0 | Brak zadeklarowanej obsługi języków innych niż angielski. ONNX na Windows, także runtime TFLite na Linux; lokalny KWS, wymaga osobnego modelu/testu frazy „Hej Echo”. Starsze tempo wydań i licencje modeli przemawiają przeciw automatycznej wymianie Porcupine |
| [Kokoro](https://github.com/hexgrad/kokoro) i [model 82M](https://huggingface.co/hexgrad/Kokoro-82M) | Commit biblioteki 2025-08-06; brak GitHub release/latest; Apache-2.0 | Lokalny TTS 82M, Python/PyTorch; lista języków upstream nie zawiera polskiego. Nie rekomendujemy jako polskiego głosu Echo; mały rozmiar parametrów nie dowodzi wydajności na Pi |
| [Piper OHF](https://github.com/OHF-Voice/piper1-gpl) | Commit 2026-11-09; wydanie 1.8.0 z 2026-09-04; silnik GPL-3.0 | Lokalny TTS/ONNX z [polskimi głosami](https://huggingface.co/rhasspy/piper-voices/tree/main/pl/pl_PL), m.in. `gosia`. [Karta gosia](https://huggingface.co/rhasspy/piper-voices/raw/main/pl/pl_PL/gosia/medium/MODEL_CARD) wskazuje polski i zbiór CC0; nie zastępuje to sprawdzenia wszystkich warunków silnika, wag i zależności. Kandydat CPU do odsłuchu i pomiaru przed decyzją o dystrybucji |

Rekomendowana kolejność eksperymentów: obecny systemowy STT/TTS jako punkt odniesienia → mały wielojęzyczny whisper.cpp → opcjonalnie faster-whisper na komputerze → polski Piper → Silero i dopiero potem nowy wake word. VAD może ograniczyć analizę ciszy, lecz samo nie rozwiązuje echa akustycznego podczas TTS. Nie instalować całego zestawu naraz. Bieżący backend modelu dopuszcza loopback: mocniejsze urządzenie wymaga osobnego projektu bezpiecznego transportu, nie poluzowania walidacji URL w tej sesji.

## Plan etapów i warunki przejścia

Faza 0 i dokumentacyjna część fazy 1 są wykonane w tej sesji. Dalsze pozycje wymagają osobnego zadania implementacyjnego. Złożoność jest względna, bez niezmierzonych szacunków godzin. Nie planujemy ponownego tworzenia istniejących pamięci preferencji, podsumowania P1, agenta, kontrolerów ani sync.

### 1B — kontrakty głosu i obserwowalność stanów (ukończony lokalnie 2026-11-10)

- **Start / fundamenty:** dostępny ECHO, istniejące kontrolery i testy; sprawdzony status/relacja gałęzi. Bez wymogu dostępu do urządzenia na potrzeby samego kontraktu.
- **Zmiany:** dodano `RozpoznawanieMowyEcho` i `SyntezaMowyEcho` przy zachowaniu publicznej fabryki i adapterów. `AgregatorStanuEcho` łączy callback agenta, aktywność tekstową, wynik oczekiwania na potwierdzenie/doprecyzowanie i stan kontrolera według priorytetów. Web TTS kończy oczekującą obietnicę po zatrzymaniu lub zastąpieniu. Żądanie tekstowe jest anulowane po zmianie widoku i przejściu aplikacji w tło. Bez nowego VAD i streamingu.
- **Zależności:** bieżące `DostawcaSesjiEcho`, `GlosEchoService`, `KontrolerSesjiGlosowejEcho`, `AgentEcho`. Bez przebudowy modułów domenowych.
- **Testy lokalne 2026-11-10:** 202 testy w 19 plikach Echo/głosu przeszły; lint zakończył się kodem 0 z ostrzeżeniami, typecheck i build przeszły. Zestawy obejmują cykl STT→agent→TTS, tekst, potwierdzenie/doprecyzowanie, anulowanie, błędy, spóźnione odpowiedzi, tło, ponowne uruchomienie, barge-in i anulowanie syntezy webowej. Bez testu fizycznego Androida/WebView2.
- **Ryzyka:** wyścigi dwóch źródeł stanu, reset sesji po zmianie ustawień, zmiana zachowania fabryki. Nie oznaczać `gotowe` jako wypowiedzi TTS ani oczekiwania jako wykonania akcji.
- **Koniec:** spełniony dla kodu i testów lokalnych; adaptery i fabryka zachowane, stany nie pozostają aktywne po anulowaniu/błędzie, brak nowych zależności i migracji. Akceptacja sprzętowa pozostaje osobnym krokiem.
- **Złożoność:** średnia.

### 2A — pomiar obecnego głosu i wybór jednego kandydata

- **Start:** zakończone 1B; znane urządzenie, RAM, CPU/akcelerator, OS i uzgodniony budżet opóźnienia. Zgoda na konkretny izolowany eksperyment, jeśli wymaga instalacji lub modelu.
- **Fundamenty / zmiany:** zachować systemowe polskie STT/TTS; przygotować próbki syntetyczne (daty, liczby, nazwy, hałas, cisza), pomiar p50/p95, RAM/CPU, błędów i czasu do pierwszego dźwięku. Porównać najwyżej jeden silnik naraz, zaczynając od lekkiego STT.
- **Zależności:** kontrakty 1B, dostęp do testowego mikrofonu/sprzętu, licencje konkretnej wersji i modelu. Bez prywatnych nagrań i bez zmian w Pi produkcyjnym.
- **Testy / ryzyka:** polskie znaki, poprawki, liczby i halucynacje na ciszy; przeciążenie/temperatura Pi i czas innych żądań. Nie przenosić benchmarków x86/CUDA na ARM.
- **Koniec:** zapisane wyniki porównawcze, koszty utrzymania i decyzja go/no-go dla jednego silnika. Przy braku przewagi pozostaje dotychczasowy adapter.
- **Złożoność:** średnia; zależna od sprzętu.

### 2B — jeden wymienny silnik, VAD i przerwania

- **Start:** pozytywna decyzja 2A i jawny zakres integracji; 1B zakończone. Jeżeli 2A daje no-go, etap jest opcjonalny.
- **Fundamenty / zmiany:** dodać wyłącznie wybrany adapter pod obecnym kontraktem, wybór i powrót do poprzedniego silnika. VAD dopiero przy rzeczywistym torze audio, ze zwalnianiem mikrofonu i obsługą przerwania; LLM i wake word pozostają osobnymi komponentami.
- **Zależności:** format PCM, runtime modelu, uprawnienia mikrofonu, transport prywatny jeśli potrzebny. Bez zmiany modelu danych i outboxu.
- **Testy / ryzyka:** regresja 1B, cisza/hałas/echo głośnika, barge-in bez samowzbudzenia, timeout sieci, ponowne wejście i tło. Test fizycznego Androida i klienta Windows/web; token/zgoda dla ewentualnego backendu audio. Ryzyko baterii, licencji, dostępności modelu.
- **Koniec:** adapter spełnia pomiary 2A, stary pozostaje dostępny, anulowanie zawsze zwalnia zasoby. Brak deklaracji pełnego offline bez próby z odłączoną siecią.
- **Złożoność:** duża. Nowy wake word jako osobny podetap dopiero przy sprawdzonej polskiej frazie i dopuszczalnej licencji.

### 3 / wizualizacja A — aktywność Echo

- **Start:** stabilne stany 1B; etap 2 nie jest blokadą, jeśli pozostajemy przy obecnym głosie. Nie trzeba czekać na wszystkie silniki, aby pokazać rzeczywiste zdarzenia.
- **Fundamenty / zmiany:** istniejący pasek stanu i tokeny UI. Prosty orb/cząsteczki Canvas 2D lub CSS, z tekstową etykietą i pauzą animacji. Three.js rozważyć dopiero, gdy pomiar uzasadni potrzebę sceny 3D.
- **Zależności:** tylko projekcja aktywności z 1B, bez czytania bazy w rendererze. Wizualizacja aktywności nie jest grafem wiedzy ani obrazem działania neuronów LLM.
- **Testy / ryzyka:** zgodność wszystkich stanów, klawiatura, motywy, `prefers-reduced-motion`, tło i odmontowanie. Limit liczby cząsteczek, ograniczony DPR i docelowo do 30 FPS na mobile; zmierzyć CPU/RAM/płynność na telefonie. Bez losowej amplitudy przedstawianej jako głos.
- **Koniec:** animacja reaguje na zdarzenia, zatrzymuje się w tle, nie utrudnia obsługi i ma czytelny wariant bez ruchu. Błąd i potwierdzenie nie wyglądają jak sukces.
- **Złożoność:** średnia.

### 4A — projekcja rzeczywistych relacji i kontrola dostępu

- **Start:** 1B i uzgodniony mały wycinek, np. zadanie–projekt–przypomnienie; dla części wizualnej stabilny etap 3. Oddzielna zgoda na eksport, jeśli miałby powstać.
- **Fundamenty / zmiany:** encje z ID, `projektId`, źródła przypomnień, istniejący `search_knowledge`, repozytoria i kontekst. Budować widok odczytowy nad istniejącymi danymi, bez niezależnego magazynu grafu i bez relacji zgadywanych przez LLM.
- **Zależności:** uprawnienia do obu końców relacji, aktualny profil, soft-delete i aktualność danych. Kolejne domeny zdrowia/finansów dopiero po kontroli prywatności ich projekcji.
- **Testy / ryzyka:** brak uprawnienia, usunięty węzeł, zmiana właściciela, zerwanie linku, brak danych i limity liczby elementów. Ukryta encja nie może ujawnić się przez etykietę ani krawędź. Nie otwierać pełnego grafu automatycznie.
- **Koniec:** każda krawędź ma jawne źródło w rekordzie, projekcja nie zapisuje nowej bazy i nie zmienia sync. Prywatne dane są pomijane domyślnie. Diagnostyka wyłącznie po podglądzie zakresu, poza repo.
- **Złożoność:** duża.

### 4B / wizualizacja B — graf kontekstu i proces zadania

- **Start:** gotowa, przetestowana projekcja 4A i renderer etapu 3.
- **Fundamenty / zmiany:** mały graf dostępnych informacji; bieżące kroki `PlanWykonaniaEcho` jako osobna warstwa procesu. Dekoracja aktywności pozostaje osobno. Paginacja/limity, nawigacja do istniejącej encji, świadome rozwinięcie szczegółów.
- **Zależności:** dane z 4A i rzeczywiste wyniki narzędzi, bez fikcyjnych powiązań „neuronowych”.
- **Testy / ryzyka:** synchronizacja odczytu po zmianie danych, odwołane działanie, częściowe wykonanie planu, dostępność listy tekstowej, wydajność i prywatność screenshotów.
- **Koniec:** użytkownik rozróżnia informacje, wykonywany proces i dekorację; nie widzi danych innych profili ani wrażliwych etykiet bez świadomego otwarcia.
- **Złożoność:** duża.

### 5 / wizualizacja C — postać Echo

- **Start:** stabilne 3 i 4B, potwierdzony budżet mobilny oraz osobne zlecenie projektu postaci.
- **Fundamenty / zmiany:** stylizowana kobieca sylwetka o słowiańsko-polskiej estetyce z punktów i połączeń, subtelne światło, przejścia stanów i reakcja na rzeczywisty głos, jeśli pomiar audio już istnieje. Opcja wyłączenia i prosty orb jako lżejszy wariant.
- **Zależności:** istniejące zdarzenia; renderer nie interpretuje danych użytkownika i nie tworzy nowej logiki asystentki.
- **Testy / ryzyka:** mobile, WebView2, redukcja ruchu, brak WebGL, odmontowanie, przegrzewanie i zasłanianie treści.
- **Koniec:** postać jest opcjonalna, nie blokuje formularzy ani rozmowy, mieści się w zmierzonym budżecie i zachowuje pełną funkcjonalność bez animacji.
- **Złożoność:** duża; ostatni etap, bez rozpoczynania go w bieżącej sesji.

## Weryfikacja bieżącej zmiany

Wyłącznie dokumentacja, instrukcje skilli i `.gitignore`; nie zmieniono zależności ani runtime. Wykonane kontrole:

- `git diff --check`: bez błędów; przegląd zakresu potwierdza wyłącznie dokumenty/instrukcje i ignore.
- Sprawdzenie lokalnych linków Markdown i domknięcia bloków kodu: 59 odwołań, bez brakujących plików; poprawne kodowanie UTF-8.
- `quick_validate.py` dla dwóch zmienionych skilli: nie uruchomił walidacji z powodu braku modułu `yaml` (PyYAML). Bez instalacji zależności wykonano zastępczą kontrolę standardową biblioteką Pythona: delimitery, nazwa, opis, limity i brak placeholderów; metadane obu skilli są identyczne jak w HEAD. Odwołania sprawdzono powyżej.
- `git check-ignore --no-index`: nowe katalogi sesji, kopie i domyślny runtime SQLite są ignorowane; kontrola negatywna obejmuje źródła `src/data/`, konfigurację i dokumentację.
- Ograniczona kontrola wzorców sekretów: zero dopasowań w opisanym zakresie, bez ujawniania wartości.

Nie uruchamiano testów aplikacji ani buildów dla tego dokumentacyjnego diffu. Nie potwierdzano jakości głosu, modeli, sprzętu ani stanu produkcji. Zmiany pozostawiono lokalnie, bez commita, pushu i wdrożenia.

## Prompt do następnej sesji Claude Code

```text
Pracujesz w istniejącym repo Ogarniacz. Wykonaj wyłącznie etap 1B z docs/UPGRADE_2026.md: kontrakty głosu i obserwowalność stanów Echo.

Wczytaj CLAUDE.md/AGENTS.md, docs/INSTRUCTIONS.md, docs/ECHO.md oraz sekcję 1B planu. Użyj źródeł .agents/skills/ogarniacz-module-builder/SKILL.md i ogarniacz-test-selector/SKILL.md. Czytaj tylko dokumenty zasad i kod związane z tym przepływem. Nie powtarzaj audytu całego repo.

Sprawdź status i historię przed edycją: dokumentacja została przygotowana na codex/kokpit-2, bazowy HEAD 7163d1d; zdalnej gałęzi nie było, a main był rozbieżny. Nie zakładaj, że stan nadal jest taki sam, nie scalaj automatycznie i zachowaj zastane zmiany dokumentacyjne.

Wykorzystaj obecne GlosEchoService, KontrolerSesjiGlosowejEcho, AgentEcho i DostawcaSesjiEcho. Rozdziel małe kontrakty STT/TTS, zachowując publiczną fabrykę i obecne implementacje. Podepnij lokalną projekcję rzeczywistych stanów tekstu, agenta i głosu; odróżnij pytanie/potwierdzenie, błąd i anulowanie. Nie dodawaj drugiego kontrolera ani globalnej magistrali.

Bez nowych silników, modeli, VAD, wake word, streamingu, orba, 3D, grafu i pamięci. Bez nowych integracji, zależności, migracji, zmian sync, prywatnych danych i urządzeń. Zweryfikuj cykl operacji, spóźnione wyniki, błędy, anulowanie i tło właściwymi testami; wykonaj lint, typecheck i build. Zaktualizuj ECHO i status 1B po uzyskaniu wyników. Podaj zakres diffu i ograniczenia. Bez pushu, release i deployu.
```
