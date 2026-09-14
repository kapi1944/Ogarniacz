package pl.ogarniacz.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import com.getcapacitor.JSObject;
import java.util.Locale;

final class StanInstalacjiApk {
    static final String OCZEKUJE_NA_UZYTKOWNIKA = "OCZEKUJE_NA_UZYTKOWNIKA";
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
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) return OCZEKUJE_NA_UZYTKOWNIKA;
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

    static void zapisz(Context kontekst, String wersja, long kodWersji, int sesja, String status, Integer statusAndroida, String komunikat) {
        prefs(kontekst).edit().putString("wersja", wersja).putLong("kodWersji", kodWersji).putInt("sesja", sesja)
            .putLong("rozpoczeto", System.currentTimeMillis()).putString("status", status)
            .putInt("statusAndroida", statusAndroida == null ? Integer.MIN_VALUE : statusAndroida)
            .putString("komunikat", komunikat).apply();
    }

    static JSObject odczytaj(Context kontekst) {
        SharedPreferences p = prefs(kontekst); JSObject wynik = new JSObject();
        wynik.put("wersjaDocelowa", p.getString("wersja", null)); wynik.put("versionCodeDocelowy", p.getLong("kodWersji", 0));
        wynik.put("sessionId", p.getInt("sesja", -1)); wynik.put("czasRozpoczecia", p.getLong("rozpoczeto", 0));
        wynik.put("status", p.getString("status", null)); int status = p.getInt("statusAndroida", Integer.MIN_VALUE);
        if (status != Integer.MIN_VALUE) wynik.put("statusAndroida", status);
        wynik.put("komunikatAndroida", p.getString("komunikat", null)); return wynik;
    }

    static long kodDocelowy(Context kontekst) { return prefs(kontekst).getLong("kodWersji", 0); }
    static String status(Context kontekst) { return prefs(kontekst).getString("status", null); }
    private static SharedPreferences prefs(Context kontekst) { return kontekst.getSharedPreferences(PREFERENCJE, Context.MODE_PRIVATE); }
}
