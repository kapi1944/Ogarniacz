# Roadmapa po Ogarniaczu v1

## Stabilizacja przed 1.0.9

- ręczny smoke test najważniejszych przepływów na Androidzie;
- prawdziwy test aktualizacji APK 1.0.8 → 1.0.9;
- weryfikacja dawkowania leków po migracji istniejących danych;
- weryfikacja synchronizacji komputer ↔ Android;
- sprawdzenie backupu i restore przed wydaniem;
- zamrożenie nowych funkcji do czasu wydania 1.0.9.

## Synchronizacja i konta — stan wdrożony

- backend Node.js + SQLite na Raspberry Pi;
- prywatny dostęp HTTPS przez Tailscale Serve;
- konta, logowanie, sesje HttpOnly i CSRF;
- jednorazowy bootstrap Właściciela;
- zaproszenia Edytora oraz odzyskiwanie dostępu;
- synchronizacja local-first z trwałym outboxem;
- idempotencja, tombstones oraz jawne konflikty HTTP 409;
- serwerowe egzekwowanie grantów Właściciela i Edytora;
- synchronizacja m.in. kont finansowych i miejsc.

Do dalszego rozwoju pozostają UX rozwiązywania konfliktów, obserwowalność synchronizacji oraz ewentualne dalsze utwardzenie polityki bezpieczeństwa.

## Warstwy platformowe

- Android i PWA są aktywnymi platformami;
- natywne przypomnienia Android i dokładne alarmy są wdrożone;
- podpisane APK OTA i podpisane Web OTA są wdrożone;
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
- Smart Home po wyborze platformy i polityki ryzyka;
- integracje z kalendarzem, pocztą i mapami;
- planer podróży jako osobny późniejszy moduł.
