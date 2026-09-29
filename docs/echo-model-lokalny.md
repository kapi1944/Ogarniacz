# Echo: lokalny model i istniejący agent

Echo zachowuje `AgentEcho`, `KontekstRozmowyEcho`, rejestr, politykę ryzyka, walidację Zod i repozytoria Ogarniacza. Nie dodano zależności ani płatnej usługi.

## Uruchomienie

Bez skonfigurowanego backendu działa dotychczasowy ograniczony provider offline. Swobodna interpretacja języka przez model wymaga uruchomionego lokalnie na Raspberry Pi Ollama i pobranego modelu obsługującego polski oraz odpowiedzi JSON. Sam adapter nie instaluje modelu. Wybierz model dostępny lokalnie i odpowiedni do pamięci urządzenia.

W prywatnym pliku środowiskowym backendu, np. `/etc/ogarniacz/ogarniacz.env`, ustaw:

```dotenv
ECHO_MODEL_URL=http://127.0.0.1:11434/api/chat
ECHO_MODEL=nazwa-zainstalowanego-modelu
ECHO_MODEL_TIMEOUT_MS=15000
```

`ECHO_MODEL_URL` przyjmuje wyłącznie adres loopback. Ollama nie jest wystawiana przez Tailscale ani publiczny port. Web i Android wysyłają zadanie modelu do prywatnego backendu Ogarniacza przez `POST /api/echo/model`; endpoint wymaga sesji, CSRF i dozwolonego originu. Backend dodaje nazwę modelu i wykonuje żądanie HTTP do Ollama. Adres oraz nazwa modelu nie trafiają do bundla przeglądarki ani APK.

Adapter używa strukturalnych odpowiedzi Ollama i waliduje je ponownie w istniejącym schemacie Zod. Brak sesji, połączenia lub niepoprawna odpowiedź kończy krok kontrolowanym komunikatem, bez automatycznego ponawiania zapisu przez innego providera. `POST /api/echo/message` zachowuje dotychczasowy kontrakt wiadomości całego Echo; `/api/echo/model` jest wyłącznie wewnętrzną granicą transportu modelu używaną przez istniejący `ProviderModeluEcho`.

## Przepływ

Wypowiedź i bieżący wątek → intencja z wartościami i źródłami → odczyt narzędzi → aktualne dane → decyzja lub pytanie → walidacja i polityka → sprawdzenie stanu → zapis w istniejącym repozytorium → odpowiedź oparta na wyniku.

Intencja zawiera pewność, encje, wartości jawne, kontekstowe, odczytane i proponowane, brakujące pola, konflikty i informację o korekcie. Daty, godziny, zakresy i osoby są nazwanymi wartościami. Kontekst zachowuje sześć ostatnich intencji oraz dotychczasowe ograniczenia historii. Wyniki bieżącej tury są oddzielone od historii, aby dawna odpowiedź nie zastępowała nowego odczytu.

Model nie zapisuje bez bieżącego odczytu, znanych identyfikatorów i dostatecznie kompletnej intencji. Wybór kandydata zatrzymuje zapis: maksymalnie trzy propozycje albo potwierdzenie wyraźnego faworyta. Rejestr pozostaje rozszerzalny przez `zarejestruj`; nowe narzędzia mogą jawnie deklarować `rodzaj` oraz `sprawdzStan`.

Sprawdzenie duplikatów zadań i przypomnień działa także offline, w wykonawcy. Przypomnienie o nazwie pasującej do opłaconego rachunku za miesiąc terminu wymaga potwierdzenia. Kontrola respektuje dostęp do finansów. `subscription_state` zwraca oddzielnie subskrypcje i rachunki: brak rachunku nie dowodzi opłacenia ani zaległości. `list_calendar` odczytuje bloki Planera; zadania i wizyty mają własne istniejące narzędzia.

## Weryfikacja i Etap 2

Testy automatyczne używają kontrolowanych odpowiedzi modelu: weryfikują kontrakt, walidację, sesję, origin, limity, anulowanie, kontekst, blokady, wybór i realne repozytoria testowe. Nie dowodzą jakości językowej konkretnego modelu ani łączności z rzeczywistym Ollama na Raspberry Pi.

Etap 2: uruchomienie i ocena konkretnego darmowego modelu na docelowym sprzęcie oraz dopracowanie doprecyzowania w wielu turach: zmiana tematu, anulowanie, wybór spośród kolejnych wyników, korekty godzin i niepełnych dat. Provider offline pozostaje ograniczony; nie deklarujemy, że rozumie dowolną potoczną wypowiedź. Gwarancje wykonawcy nie są gwarancją bezbłędnej interpretacji ani swobodnej odpowiedzi każdego modelu.
