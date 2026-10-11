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

## Szyfrowanie kopii — Health 2.0, etap 5.1

`BackupService.szyfrujBackup` szyfruje cały istniejący backup (manifest, checksum, sekcje i transportowe Bloby). Ustawienia tworzą wyłącznie zaszyfrowane kopie; pobieranie kopii `before-restore` również wymaga hasła. Dotychczasowy `utworzBackup` pozostaje konstruktorem danych, używanym także przez zabezpieczenie przed restore. Nie zapisuje automatycznie jawnego pliku.

Algorytmy: natywne Web Crypto, AES-256-GCM z tagiem 128 bitów oraz PBKDF2-HMAC-SHA-256 z 600 000 iteracji. Każde szyfrowanie losuje sól 16 bajtów i IV 12 bajtów przez `crypto.getRandomValues`. Klucze są nieeksportowalne. Brak obsługi kryptografii kończy operację czytelnym błędem, bez jawnego eksportu. Liczba iteracji odpowiada wskazaniu [OWASP dla PBKDF2-HMAC-SHA-256](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#pbkdf2); parametry GCM korzystają z [Web Crypto](https://www.w3.org/TR/WebCryptoAPI/).

Koperta JSON:

```json
{
  "naglowek": {
    "format": "ogarniacz-backup-szyfrowany",
    "wersja": 1,
    "szyfr": "AES-256-GCM",
    "kdf": { "algorytm": "PBKDF2", "hash": "SHA-256", "iteracje": 600000, "sol": "<Base64: 16 bajtów>" },
    "iv": "<Base64: 12 bajtów>"
  },
  "szyfrogram": "<Base64: szyfrogram z dołączonym tagiem GCM>"
}
```

Nagłówek jest uwierzytelniany jako AAD: UTF-8 kanonicznego JSON według istniejącego `kanonizuj` (klucze obiektów posortowane, bez odstępów). Koperta v1 dopuszcza wyłącznie powyższe algorytmy i parametry; inne wartości są odrzucane przed KDF, również aby ograniczyć koszt przetwarzania niezaufanego pliku. Poza szyfrogramem nie ma manifestu ani informacji o rekordach. Rozmiar pliku pozostaje widoczny.

Import: rozpoznanie koperty → hasło → uwierzytelnione odszyfrowanie → dotychczasowa walidacja checksum, struktury i zgodności v1–v3 → podgląd manifestu → istniejące potwierdzenie i transakcyjny restore. Błędy przed restore nie zapisują niczego do bazy. Nie zmieniono schematu Dexie ani struktury rekordów.

Hasło żyje tylko w polu formularza i pamięci podczas operacji; pola są czyszczone przed przetwarzaniem lub po anulowaniu. Hasła i klucze nie trafiają do ustawień, storage, bazy ani logów. Bufory hasła i jawnych bajtów są zerowane po użyciu, ale JavaScript nie zapewnia wymuszonego wymazania stringów ani `CryptoKey` z pamięci.

Ograniczenia: brak odzyskiwania zapomnianego hasła; bezpieczeństwo zależy też od jego siły i urządzenia. UI zaleca długie, unikalne hasło. Cały JSON i Base64 są przetwarzane w pamięci, bez strumieniowania; test dużej kopii obejmuje 5 MiB treści. Wewnętrzna baza i historyczne jawne pliki nie są szyfrowane tą funkcją. Testy Web Crypto w Node/jsdom nie zastępują próby w PWA lub na Androidzie.
