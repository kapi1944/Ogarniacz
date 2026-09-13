# Architektura i zakres zmian

## Refaktoryzacja
- Nie przebudowuj architektury bez powodu.
- Możesz zaproponować i wykonać refaktoryzację, jeśli obecna architektura realnie utrudnia rozwój, niezawodność lub utrzymanie.
- Nie dokładaj warstw kompatybilności bez realnej potrzeby. Ustalaj warunek lub termin usunięcia legacy.

## Zakres zmian
- Minimalizuj zakres, ale modyfikuj wszystkie moduły niezbędne do kompletnego rozwiązania problemu.
- Nie wykonuj pobocznych zmian kosmetycznych „przy okazji”.
- Jeśli po drodze znajdziesz poważny błąd — napraw go lub wyraźnie zgłoś.
- „Najmniejsza rozsądna zmiana” = usuwa przyczynę, nie tylko objaw.

## Moduły wrażliwe
Echo, synchronizacja, OTA, konta, signing, backup:
- Nie są objęte globalnym zakazem modyfikacji.
- Zmiany są dozwolone, jeśli konieczne dla integralności funkcji.
- Wymagają dodatkowych testów i świadomej decyzji.
- Reguły „nie ruszaj X” stosujemy tylko lokalnie w promptach dla izolowanych zadań — nie jako stałą zasadę projektu.

## Raspberry Pi / backend
- Nowe endpointy i usługi są dozwolone.
- Każda usługa ma jasną odpowiedzialność.
- Preferuj rozszerzanie istniejącego serwera zamiast stawiania nowego.
- Backend może pełnić rolę proxy dla zewnętrznych API, żeby chronić klucze.

## Sposób pracy modeli
- Najpierw diagnoza i plan, potem zmiana.
- Uzasadniaj wybór rozwiązania (dlaczego API / biblioteka / refaktor).
- Jeśli proponujesz coś poza zakresem — krótko wyjaśnij co i dlaczego.
- Nie ukrywaj kompromisów: koszt, prywatność, vendor lock-in, dług techniczny.
- Jeśli istnieje lepsze rozwiązanie niż to, o które prosi użytkownik — powiedz o tym.
