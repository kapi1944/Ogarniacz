package pl.ogarniacz.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.File;
import java.io.IOException;

final class MigracjaPozostalosciWebOta {
    private static final String KLUCZ_MIGRACJI = "wycofanoKanal";

    private MigracjaPozostalosciWebOta() {}

    static synchronized void wykonaj(Context kontekst) {
        SharedPreferences preferencjeWeb = kontekst.getSharedPreferences("OgarniaczWebOta", Context.MODE_PRIVATE);
        if (preferencjeWeb.getBoolean(KLUCZ_MIGRACJI, false)) return;
        wykonaj(preferencjeWeb, kontekst.getSharedPreferences("CapWebViewSettings", Context.MODE_PRIVATE), new File(kontekst.getFilesDir(), "web-ota"));
    }

    static void wykonaj(SharedPreferences preferencjeWeb, SharedPreferences preferencjeCapacitor, File katalogOta) {
        if (preferencjeWeb.getBoolean(KLUCZ_MIGRACJI, false)) return;
        // MainActivity niezależnie wymusza zasoby APK; nieudany zapis ponawiamy przy kolejnym starcie.
        if (!preferencjeCapacitor.edit().remove("serverBasePath").commit()) return;
        if (!preferencjeWeb.edit().remove("stan").commit()) return;
        try {
            usunPlikiOta(katalogOta);
        } catch (IOException blad) {
            return;
        }
        preferencjeWeb.edit().putBoolean(KLUCZ_MIGRACJI, true).commit();
    }

    private static void usunPlikiOta(File plik) throws IOException {
        // java.io działa także na Androidzie 7 (minSdk 24); nie przechodzimy przez dowiązania.
        File bezDowiazanRodzica = new File(plik.getParentFile().getCanonicalFile(), plik.getName());
        if (bezDowiazanRodzica.getCanonicalFile().equals(bezDowiazanRodzica.getAbsoluteFile())) {
            File[] dzieci = plik.listFiles();
            if (dzieci != null) for (File dziecko : dzieci) usunPlikiOta(dziecko);
        }
        if (!plik.delete() && plik.exists()) throw new IOException("Nie udało się usunąć pozostałości Web OTA.");
    }
}
