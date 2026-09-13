# Bezpieczeństwo i dane użytkownika

## Nigdy nie rób
- nie commituj sekretów, kluczy API, tokenów, keystore,
- nie generuj nowego klucza podpisującego APK,
- nie obniżaj `versionCode`,
- nie usuwaj ani nie nadpisuj danych użytkownika podczas aktualizacji,
- nie wykonuj destrukcyjnych operacji „żeby naprawić” problem,
- nie wysyłaj danych użytkownika na zewnątrz bez świadomego włączenia funkcji,
- nie loguj sekretów ani pełnych danych osobowych,
- nie publikuj release z niewyjaśnioną regresją.

## Zawsze rób
- migracje przy zmianach schematu,
- backup przed operacjami ryzykownymi,
- minimalizację przesyłanych danych,
- rozdzielenie sekretów od kodu.

## Nienegocjowalne
- Brak sekretów w repo i froncie.
- Brak regresji danych użytkownika.
- Brak obniżania `versionCode`.
- Brak publikacji release z niewyjaśnioną regresją.
- Brak destrukcyjnych operacji bez backupu.
- Brak ukrytych kosztów i ukrytego wysyłania danych.
