package pl.ogarniacz.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import com.getcapacitor.JSObject;
import java.net.URISyntaxException;
import java.util.Locale;

final class StanInstalacjiApk {
    static final String POBRANO = "POBRANO";
    static final String ZWERYFIKOWANO = "ZWERYFIKOWANO";
    static final String OCZEKUJE_NA_ZGODE_NIEZNANYCH_ZRODEL = "OCZEKUJE_NA_ZGODE_NIEZNANYCH_ZRODEL";
    static final String OCZEKUJE_NA_POTWIERDZENIE_INSTALACJI = "OCZEKUJE_NA_POTWIERDZENIE_INSTALACJI";
    static final String INSTALOWANIE = "INSTALOWANIE";
    static final String SUKCES = "SUKCES";
    static final String ANULOWANO = "ANULOWANO";
    static final String BRAK_MIEJSCA = "BRAK_MIEJSCA";
    static final String NIEZGODNY_PODPIS = "NIEZGODNY_PODPIS";
    static final String NIEPRAWIDLOWY_APK = "NIEPRAWIDLOWY_APK";
    static final String KONFLIKT_PAKIETU = "KONFLIKT_PAKIETU";
    static final String BLOKADA_SYSTEMOWA = "BLOKADA_SYSTEMOWA";
    static final String KONFLIKT_WERSJI = "KONFLIKT_WERSJI";
    static final String NIEDOZWOLONE_ZRODLO = "NIEDOZWOLONE_ZRODLO";
    static final String BRAK_SYSTEMOWEGO_INSTALATORA = "BRAK_SYSTEMOWEGO_INSTALATORA";
    static final String NIEZNANY_BLAD = "NIEZNANY_BLAD";
    private static final String PREFERENCJE = "stan_instalacji_apk";
    private static final long RETENCJA_ZWERYFIKOWANEGO_ARTEFAKTU_MS = 24L * 60L * 60L * 1000L;

    static String mapujStatus(int status, String komunikat) {
        if (status == PackageInstaller.STATUS_SUCCESS) return SUKCES;
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) return OCZEKUJE_NA_POTWIERDZENIE_INSTALACJI;
        if (status == PackageInstaller.STATUS_FAILURE_ABORTED) return ANULOWANO;
        if (status == PackageInstaller.STATUS_FAILURE_STORAGE) return BRAK_MIEJSCA;
        if (status == PackageInstaller.STATUS_FAILURE_INVALID) return NIEPRAWIDLOWY_APK;
        String malyKomunikat = komunikat == null ? "" : komunikat.toLowerCase(Locale.ROOT);
        if (status == PackageInstaller.STATUS_FAILURE_BLOCKED) {
            return czyNiedozwoloneZrodlo(malyKomunikat) ? NIEDOZWOLONE_ZRODLO : BLOKADA_SYSTEMOWA;
        }
        if (status == PackageInstaller.STATUS_FAILURE_INCOMPATIBLE) return BLOKADA_SYSTEMOWA;
        if (status == PackageInstaller.STATUS_FAILURE_CONFLICT) {
            if (malyKomunikat.contains("downgrade") || malyKomunikat.contains("version code") || malyKomunikat.contains("wersj") || malyKomunikat.contains("niższ")) return KONFLIKT_WERSJI;
            return malyKomunikat.contains("signature") || malyKomunikat.contains("certificate") || malyKomunikat.contains("podpis") ? NIEZGODNY_PODPIS : KONFLIKT_PAKIETU;
        }
        return NIEZNANY_BLAD;
    }

    private static boolean czyNiedozwoloneZrodlo(String komunikat) {
        return komunikat.contains("unknown source") || komunikat.contains("unknown sources")
            || komunikat.contains("not allowed") || komunikat.contains("not permitted")
            || komunikat.contains("nieznan") || komunikat.contains("źródł");
    }

    static boolean czyMoznaPonowicInstalacje(String status) {
        return ZWERYFIKOWANO.equals(status) || OCZEKUJE_NA_ZGODE_NIEZNANYCH_ZRODEL.equals(status)
            || ANULOWANO.equals(status) || BRAK_MIEJSCA.equals(status) || NIEZGODNY_PODPIS.equals(status)
            || NIEPRAWIDLOWY_APK.equals(status) || KONFLIKT_PAKIETU.equals(status) || KONFLIKT_WERSJI.equals(status)
            || NIEDOZWOLONE_ZRODLO.equals(status) || BRAK_SYSTEMOWEGO_INSTALATORA.equals(status)
            || BLOKADA_SYSTEMOWA.equals(status) || NIEZNANY_BLAD.equals(status);
    }

    static void zapiszPobrano(Context kontekst, String nazwaPliku, String sha256, String wersja, long kodWersji) {
        zapisz(kontekst, wersja, kodWersji, -1, POBRANO, null, null, nazwaPliku, sha256, null);
    }

    static void zapiszZweryfikowano(Context kontekst, String nazwaPliku, String sha256, String wersja, long kodWersji) {
        zapisz(kontekst, wersja, kodWersji, -1, ZWERYFIKOWANO, null, null, nazwaPliku, sha256, null);
    }

    static void zapiszOczekiwanieNaZgode(Context kontekst) {
        zapiszZachowujacArtefakt(kontekst, -1, OCZEKUJE_NA_ZGODE_NIEZNANYCH_ZRODEL, null, "Android wymaga zgody na instalowanie nieznanych aplikacji.", null);
    }

    static void zapiszInstalowanie(Context kontekst, int sesja) {
        zapiszZachowujacArtefakt(kontekst, sesja, INSTALOWANIE, null, null, null);
    }

    static void zapiszWynikSystemu(Context kontekst, String wersja, long kodWersji, int sesja, int statusAndroida, String komunikat, Intent potwierdzenie) {
        boolean brakPotwierdzenia = statusAndroida == PackageInstaller.STATUS_PENDING_USER_ACTION && potwierdzenie == null;
        String status = brakPotwierdzenia ? NIEZNANY_BLAD : mapujStatus(statusAndroida, komunikat);
        String zapisanePotwierdzenie = statusAndroida == PackageInstaller.STATUS_PENDING_USER_ACTION && potwierdzenie != null
            ? potwierdzenie.toUri(Intent.URI_INTENT_SCHEME) : null;
        if (brakPotwierdzenia) komunikat = "Android wymaga potwierdzenia, ale nie przekazał ekranu systemowego. Ponów instalację.";
        zapisz(kontekst,
            wersja != null ? wersja : wersja(kontekst), kodWersji > 0 ? kodWersji : kodDocelowy(kontekst),
            sesja >= 0 ? sesja : sesja(kontekst), status, statusAndroida, komunikat,
            nazwaPliku(kontekst), sha256(kontekst), zapisanePotwierdzenie);
    }

    static void zapiszSukces(Context kontekst, String wersja, long kodWersji) {
        zapiszZachowujacArtefakt(kontekst, -1, SUKCES, PackageInstaller.STATUS_SUCCESS, null, null, wersja, kodWersji);
    }

    static void zapiszBrakSystemowegoInstalatora(Context kontekst, String komunikat) {
        zapiszZachowujacArtefakt(kontekst, -1, BRAK_SYSTEMOWEGO_INSTALATORA, PackageInstaller.STATUS_FAILURE, komunikat, null);
    }

    static void zapiszBladUruchomienia(Context kontekst, String komunikat) {
        zapiszZachowujacArtefakt(kontekst, -1, NIEZNANY_BLAD, PackageInstaller.STATUS_FAILURE, komunikat, null);
    }

    static void zapiszBrakMiejsca(Context kontekst, String komunikat) {
        zapiszZachowujacArtefakt(kontekst, -1, BRAK_MIEJSCA, PackageInstaller.STATUS_FAILURE_STORAGE, komunikat, null);
    }

    static void zapiszUszkodzonyApk(Context kontekst) {
        zapisz(kontekst, wersja(kontekst), kodDocelowy(kontekst), -1, NIEPRAWIDLOWY_APK, PackageInstaller.STATUS_FAILURE_INVALID, "Zweryfikowany plik APK jest niedostępny lub uszkodzony.", null, null, null);
    }

    static Intent pobierzPotwierdzenie(Context kontekst) throws URISyntaxException {
        String zapisane = prefs(kontekst).getString("potwierdzenie", null);
        return zapisane == null ? null : Intent.parseUri(zapisane, Intent.URI_INTENT_SCHEME);
    }

    static boolean czyZweryfikowanyApk(Context kontekst, String nazwaPliku, String wersja, long kodWersji) {
        SharedPreferences p = prefs(kontekst);
        return nazwaPliku.equals(p.getString("nazwaPliku", null)) && wersja.equals(p.getString("wersja", null))
            && kodWersji == p.getLong("kodWersji", 0) && p.getString("sha256", null) != null;
    }

    static JSObject odczytaj(Context kontekst) {
        SharedPreferences p = prefs(kontekst); JSObject wynik = new JSObject();
        wynik.put("wersjaDocelowa", p.getString("wersja", null)); wynik.put("versionCodeDocelowy", p.getLong("kodWersji", 0));
        wynik.put("sessionId", p.getInt("sesja", -1)); wynik.put("czasRozpoczecia", p.getLong("rozpoczeto", 0));
        String status = p.getString("status", null); wynik.put("status", status); int statusAndroida = p.getInt("statusAndroida", Integer.MIN_VALUE);
        if (statusAndroida != Integer.MIN_VALUE) wynik.put("statusAndroida", statusAndroida);
        wynik.put("komunikatAndroida", p.getString("komunikat", null));
        wynik.put("nazwaPliku", p.getString("nazwaPliku", null)); wynik.put("sha256", p.getString("sha256", null));
        wynik.put("maZweryfikowanyApk", czyMaZweryfikowanyApk(status, p.getString("nazwaPliku", null), p.getString("sha256", null)));
        wynik.put("komunikatUzytkownika", komunikatDlaUzytkownika(status));
        wynik.put("maPotwierdzenieInstalacji", p.getString("potwierdzenie", null) != null);
        wynik.put("moznaPonowicInstalacje", czyMoznaPonowicInstalacje(status));
        return wynik;
    }

    static boolean czyMaZweryfikowanyApk(String status, String nazwaPliku, String sha256) {
        return !POBRANO.equals(status) && !SUKCES.equals(status) && sha256 != null && nazwaPliku != null;
    }

    static long kodDocelowy(Context kontekst) { return prefs(kontekst).getLong("kodWersji", 0); }
    static String status(Context kontekst) { return prefs(kontekst).getString("status", null); }
    static String nazwaPliku(Context kontekst) { return prefs(kontekst).getString("nazwaPliku", null); }
    static String sha256(Context kontekst) { return prefs(kontekst).getString("sha256", null); }
    static String wersja(Context kontekst) { return prefs(kontekst).getString("wersja", null); }
    static int sesja(Context kontekst) { return prefs(kontekst).getInt("sesja", -1); }

    static boolean czyChronićArtefakt(Context kontekst, long teraz) {
        SharedPreferences p = prefs(kontekst);
        long rozpoczęto = p.getLong("rozpoczeto", 0);
        return p.getString("nazwaPliku", null) != null && p.getString("sha256", null) != null
            && rozpoczęto > 0 && teraz - rozpoczęto < RETENCJA_ZWERYFIKOWANEGO_ARTEFAKTU_MS;
    }
    static String komunikatDlaUzytkownika(String status) {
        if (POBRANO.equals(status)) return "APK pobrano. Trwa weryfikacja SHA-256.";
        if (ZWERYFIKOWANO.equals(status)) return "APK pobrano i zweryfikowano. Możesz uruchomić instalację.";
        if (OCZEKUJE_NA_ZGODE_NIEZNANYCH_ZRODEL.equals(status) || NIEDOZWOLONE_ZRODLO.equals(status)) return "Android wymaga zgody na instalowanie aplikacji z tego źródła.";
        if (OCZEKUJE_NA_POTWIERDZENIE_INSTALACJI.equals(status)) return "Android oczekuje systemowego potwierdzenia instalacji.";
        if (INSTALOWANIE.equals(status)) return "Instalowanie aktualizacji…";
        if (SUKCES.equals(status)) return "Aktualizacja zakończona.";
        if (ANULOWANO.equals(status)) return "Instalacja została anulowana.";
        if (BRAK_MIEJSCA.equals(status)) return "Android nie ma wystarczającego miejsca na instalację.";
        if (NIEZGODNY_PODPIS.equals(status)) return "APK jest podpisane innym kluczem niż zainstalowana aplikacja.";
        if (NIEPRAWIDLOWY_APK.equals(status)) return "Pakiet aktualizacji jest nieprawidłowy.";
        if (KONFLIKT_WERSJI.equals(status)) return "Android nie pozwala zainstalować tej wersji, ponieważ nie jest nowsza od zainstalowanej.";
        if (KONFLIKT_PAKIETU.equals(status)) return "Wystąpił konflikt pakietu aktualizacji.";
        if (BRAK_SYSTEMOWEGO_INSTALATORA.equals(status)) return "Systemowy instalator Androida nie jest dostępny.";
        if (BLOKADA_SYSTEMOWA.equals(status)) return "Android lub administrator urządzenia zablokował instalację.";
        return "Android nie mógł zainstalować aktualizacji.";
    }
    private static void zapiszZachowujacArtefakt(Context kontekst, int sesja, String status, Integer statusAndroida, String komunikat, String potwierdzenie) {
        zapiszZachowujacArtefakt(kontekst, sesja, status, statusAndroida, komunikat, potwierdzenie, wersja(kontekst), kodDocelowy(kontekst));
    }

    private static void zapiszZachowujacArtefakt(Context kontekst, int sesja, String status, Integer statusAndroida, String komunikat, String potwierdzenie, String wersja, long kodWersji) {
        zapisz(kontekst, wersja, kodWersji, sesja, status, statusAndroida, komunikat, nazwaPliku(kontekst), sha256(kontekst), potwierdzenie);
    }

    private static void zapisz(Context kontekst, String wersja, long kodWersji, int sesja, String status, Integer statusAndroida, String komunikat, String nazwaPliku, String sha256, String potwierdzenie) {
        prefs(kontekst).edit().putString("wersja", wersja).putLong("kodWersji", kodWersji).putInt("sesja", sesja)
            .putLong("rozpoczeto", System.currentTimeMillis()).putString("status", status)
            .putInt("statusAndroida", statusAndroida == null ? Integer.MIN_VALUE : statusAndroida)
            .putString("komunikat", komunikat).putString("nazwaPliku", nazwaPliku).putString("sha256", sha256)
            .putString("potwierdzenie", potwierdzenie).apply();
    }

    private static SharedPreferences prefs(Context kontekst) { return kontekst.getSharedPreferences(PREFERENCJE, Context.MODE_PRIVATE); }
}
