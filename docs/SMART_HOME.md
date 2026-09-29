# Home Assistant ↔ Ogarniacz

Home Assistant pozostaje właścicielem urządzeń, encji, integracji producentów, Zigbee/Z-Wave/Matter/MQTT, automatyzacji niskiego poziomu i bieżącego stanu domu. Ogarniacz zachowuje odpowiedzialność za użytkownika, kontekst dnia, zadania, Echo oraz przyszłe wysokopoziomowe sugestie i polecenia. Ogarniacz nie przechowuje kopii stanów urządzeń i nie zastępuje Home Assistant.

Pierwszy backendowy wycinek udostępnia neutralny `DostawcaSmartHome` oraz adapter REST Home Assistant. Obsługiwane są wyłącznie: sprawdzenie dostępności, ograniczona projekcja listy encji, stan jednej encji oraz stałe akcje włączenia i wyłączenia. Obie akcje mają jawne ryzyko `umiarkowane`, zgodne ze słownikiem polityki Echo, ale na tym etapie nie są narzędziami Echo ani publicznym API Ogarniacza.

Połączenie konfiguruje się wyłącznie w środowisku backendu przez `HOME_ASSISTANT_URL`, `HOME_ASSISTANT_TOKEN` i opcjonalne `HOME_ASSISTANT_TIMEOUT_MS`. Token jest wysyłany tylko do Home Assistant w nagłówku `Authorization`; nie trafia do frontendu, odpowiedzi providera, IndexedDB, localStorage ani zwykłych logów. Brak obu wymaganych zmiennych pozostawia integrację wyłączoną i nie blokuje startu Ogarniacza. HTTP jest dozwolone tylko dla prywatnego hosta sieci lokalnej; poza nią wymagany jest HTTPS.

Nie są częścią tego etapu: UI domu, dashboard, kamery, sceny, automatyzacje, discovery poza listą zwracaną przez Home Assistant, MQTT, Matter, Zigbee, baza stanów oraz sterowanie przez Echo. Home Assistant nie jest instalowany ani modyfikowany przez Ogarniacza.
