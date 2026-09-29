# Roadmapa po Ogarniaczu v1

## Bieżąca walidacja wydań i wdrożenia

- test aktualizacji z wydanego APK 1.0.13 do następnej wersji na fizycznym Androidzie oraz osobny test poprawionego instalatora w kolejnym przejściu między wersjami;
- potwierdzenie na Raspberry Pi instalacji jednostek aktualizatora, działania panelu, healthchecku i rollbacku; lokalne testy nie zastępują próby na urządzeniu;
- po potwierdzeniu wszystkich aktywnych klientów na HTTPS Tailscale: ręczne przełączenie live `HOST` na loopback i wyłączenie starych timerów aktualizacji;
- ręczne sprawdzenie najważniejszych przepływów, w tym synchronizacji, leków i backupu, przed kolejnym wydaniem.

## Synchronizacja i konta — stan wdrożony

- backend Node.js + SQLite na Raspberry Pi;
- prywatny dostęp HTTPS przez Tailscale Serve;
- konta, logowanie, sesje HttpOnly i CSRF;
- synchronizacja Androida wyłącznie przez sesję; legacy Bearer został usunięty;
- jednorazowy bootstrap Właściciela;
- zaproszenia Edytora oraz odzyskiwanie dostępu;
- synchronizacja local-first z trwałym outboxem;
- idempotencja, tombstones oraz jawne konflikty HTTP 409 z wyborem pełnej wersji lub ręcznym scalaniem prostych pól;
- serwerowe egzekwowanie grantów Właściciela i Edytora;
- synchronizacja m.in. kont finansowych i miejsc.

Do dalszego rozwoju pozostają obserwowalność synchronizacji oraz ewentualne dalsze utwardzenie polityki bezpieczeństwa.

## Warstwy platformowe

- Android i PWA są aktywnymi platformami;
- natywne przypomnienia Android i dokładne alarmy są wdrożone;
- aktualizacja podpisanego APK z weryfikacją SHA-256 oraz podpisane Web OTA są wdrożone; PWA odświeża frontend przez service worker, a Raspberry ma osobny aktualizator z panelem i rollbackiem;
- opcjonalne opakowanie Tauri dla funkcji systemowych;
- dalsze testy zachowania w tle na różnych urządzeniach Android.

## Echo

- finalna polityka pamięci i proaktywności;
- lepsza interpretacja języka naturalnego;
- finalna technologia STT/TTS;
- docelowe słowo wybudzające po dostarczeniu wymaganych prywatnych danych Picovoice;
- opcjonalny zewnętrzny provider AI po jawnej decyzji użytkownika.

## Późniejsze kierunki

- testy przeglądarkowe najczęstszych przepływów CRUD;
- audyt dostępności z czytnikiem ekranu;
- dalsze strojenie „Dzisiaj” na podstawie realnego użycia;
- bardziej rozbudowana edycja relacji encji;
- walidacja połączenia z Home Assistant, a dopiero potem osobny zakres wysokopoziomowych poleceń i polityki ryzyka;
- integracje z kalendarzem, pocztą i mapami;
- planer podróży jako osobny późniejszy moduł.
