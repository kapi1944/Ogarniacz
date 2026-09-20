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
    static final String NIEZNANY_BLAD = "NIEZNANY_BLAD";
    private static final String PREFERENCJE = "stan_instalacji_apk";

    static String mapujStatus(int status, String komunikat) {
        if (status == PackageInstaller.STATUS_SUCCESS) return SUKCES;
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) return OCZEKUJE_NA_POTWIERDZENIE_INSTALACJI;
        if (status == PackageInstaller.STATUS_FAILURE_ABORTED) return ANULOWANO;
        if (status == PackageInstaller.STATUS_FAILURE_STORAGE) return BRAK_MIEJSCA;
        if (status == PackageInstaller.STATUS_FAILURE_INVALID) return NIEPRAWIDLOWY_APK;
        if (status == PackageInstaller.STATUS_FAILURE_BLOCKED || status == PackageInstaller.STATUS_FAILURE_INCOMPATIBLE) return BLOKADA_SYSTEMOWA;
        if (status == PackageInstaller.STATUS_FAILURE_CONFLICT) {
            String malyKomunikat = komunikat == null ? "" : komunikat.toLowerCase(Locale.ROOT);
            return malyKomunikat.contains("signature") || malyKomunikat.contains("certificate") || malyKomunikat.contains("podpis") ? NIEZGODNY_PODPIS : KONFLIKT_PAKIETU;
        }
        return NIEZNANY_BLAD;
    }

    static boolean czyMoznaPonowicInstalacje(String status) {
        return ZWERYFIKOWANO.equals(status) || OCZEKUJE_NA_ZGODE_NIEZNANYCH_ZRODEL.equals(status)
            || ANULOWANO.equals(status) || BRAK_MIEJSCA.equals(status) || NIEZGODNY_PODPIS.equals(status)
            || NIEPRAWIDLOWY_APK.equals(status) || KONFLIKT_PAKIETU.equals(status)
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
        wynik.put("maZweryfikowanyApk", !POBRANO.equals(status) && p.getString("sha256", null) != null && p.getString("nazwaPliku", null) != null);
        wynik.put("maPotwierdzenieInstalacji", p.getString("potwierdzenie", null) != null);
        wynik.put("moznaPonowicInstalacje", czyMoznaPonowicInstalacje(status));
        return wynik;
    }

    static long kodDocelowy(Context kontekst) { return prefs(kontekst).getLong("kodWersji", 0); }
    static String status(Context kontekst) { return prefs(kontekst).getString("status", null); }
    static String nazwaPliku(Context kontekst) { return prefs(kontekst).getString("nazwaPliku", null); }
    static String sha256(Context kontekst) { return prefs(kontekst).getString("sha256", null); }
    static String wersja(Context kontekst) { return prefs(kontekst).getString("wersja", null); }
    static int sesja(Context kontekst) { return prefs(kontekst).getInt("sesja", -1); }

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
