# Opcjonalny Home Assistant

Integracja rozszerza istniejący backend i sekcję Dom w `/panel`. Nie instaluje
Home Assistanta, Dockera ani MQTT, nie otwiera portów i nie tworzy automatyzacji.
Echo pozostaje bez zmian. Brak konfiguracji nie blokuje startu Ogarniacza.

Konfigurację ustaw wyłącznie w środowisku procesu backendu, np. istniejącym
`/etc/ogarniacz/ogarniacz.env`, czytelnym tylko dla użytkownika usługi (tryb 600).
Nie wpisuj tokenu do repo, ustawień klienta ani zmiennych `VITE_*`.

- `HOME_ASSISTANT_URL`: origin instalacji, np. `http://homeassistant.local:8123`,
  bez końcowego ukośnika, ścieżki i danych logowania. Dla połączeń poza zaufaną
  siecią lokalną używaj HTTPS; HTTP nie szyfruje tokenu.
- `HOME_ASSISTANT_TOKEN`: token dostępu utworzony w Home Assistant; używaj
  dedykowanego konta z możliwie ograniczonymi uprawnieniami.
- `HOME_ASSISTANT_OWNER_ID`: ID istniejącego właściciela Ogarniacza. Instalacja
  jest przypisana wyłącznie do tego konta; inni właściciele i Edytorzy nie mają
  dostępu. Brak ID pozostawia integrację nieaktywną.
- `HOME_ASSISTANT_ENTITIES`: lista identyfikatorów po przecinku, maksymalnie 30,
  np. `light.salon,sensor.temperatura`. Domyślnie pusta.
- `HOME_ASSISTANT_CONTROL_ENTITIES`: domyślnie pusta (tylko odczyt). Opcjonalny
  podzbiór powyższej listy, wyłącznie domeny `light` i `switch`. Wpisuj tylko
  sprawdzone urządzenia; przełącznik może zasilać urządzenie niebezpieczne.
- `HOME_ASSISTANT_TIMEOUT_MS`: 1000–30000 ms, domyślnie 5000, na żądanie HA.

Po zmianie środowiska wymagany jest restart istniejącej usługi. Ta zmiana kodu
nie konfiguruje ani nie restartuje rzeczywistej instalacji.

W panelu właściciel online naciska „Sprawdź połączenie i odśwież urządzenia”.
`GET /api/dom` korzysta z istniejącej sesji, sprawdza `/api/` i pobiera oddzielnie
`/api/states/<id>` wyłącznie dla wybranych encji. Nie pobiera całego domu.
Odpowiedź zawiera ograniczoną projekcję nazwy, stanu, dostępności i jednostki;
nie zawiera adresu ani tokenu. Nie trafia do synchronizacji, IndexedDB ani cache.
Stany są aktualne na moment ręcznego odczytu; `unknown`, `unavailable` i brak
encji blokują przyciski sterowania.

`POST /api/dom/<id>/wlacz` i `/wylacz` wymagają tej samej sesji właściciela,
CSRF i obu list serwerowych. Usługa HA jest stała: `light.turn_on/turn_off` lub
`switch.turn_on/turn_off`, z jednym `entity_id`. Nie ma dowolnych usług, parametrów,
skryptów, scen ani poleceń grupowych. UI dodatkowo wymaga potwierdzenia każdej
akcji; samo API traktuje poprawny autoryzowany POST jako polecenie. Po błędzie
nie ponawia automatycznie akcji — timeout nie dowodzi, że urządzenie nie zadziałało.

Do wskazanej instalacji HA wysyłamy token w nagłówku Authorization, identyfikatory
wybranych encji oraz potwierdzone polecenia, aby odczytać stan lub sterować.
Nie wysyłamy danych zdrowotnych, zadań ani kont Ogarniacza. HA może zapisywać
stany i działania według własnej konfiguracji historii/logów; integracja nie
zmienia jego retencji. Przekierowania HTTP są blokowane. Błędy HA nie są
przekazywane klientowi w surowej postaci.

Aby wyłączyć sterowanie, opróżnij `HOME_ASSISTANT_CONTROL_ENTITIES`. Aby wyłączyć
całość, usuń obie wartości URL/token i zrestartuj backend; token można dodatkowo
unieważnić w HA. Nie konfigurujemy dostępu na podstawie roli administratora
systemowego ani grantów innych modułów.

Testy adaptera, API i panelu używają danych syntetycznych. Nie potwierdzają
połączenia z rzeczywistym HA ani działania fizycznych urządzeń.
