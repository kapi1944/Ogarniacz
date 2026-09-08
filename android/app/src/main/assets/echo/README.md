# Modele „Hej Echo”

Ten katalog celowo nie zawiera plików binarnych ani klucza dostępu.

Do prywatnego builda Android dodaj `hej_echo_android.ppn` — własny model frazy wygenerowany dla Androida w Picovoice Console. Ponieważ Porcupine nie udostępnia obecnie polskiego modelu językowego, model utwórz w języku angielskim dla zapisu `Hey Echo`; wymowa odpowiada komendzie „Hej Echo”, ale przed wydaniem trzeba sprawdzić skuteczność dla głosu użytkownika i polskiego akcentu.

Klucz Picovoice przekaż przez zmienną środowiskową `PICOVOICE_ACCESS_KEY` albo prywatny, ignorowany przez Git plik `android/local.properties`:

```properties
picovoice.accessKey=TUTAJ_PRYWATNY_KLUCZ
```

Porcupine przetwarza dźwięk lokalnie i nie tworzy transkrypcji. Klucz służy do aktywacji SDK i nie powinien trafiać do repozytorium. Bez klucza lub modelu aplikacja pokazuje stan „Brak konfiguracji” i nie uruchamia mikrofonu.
