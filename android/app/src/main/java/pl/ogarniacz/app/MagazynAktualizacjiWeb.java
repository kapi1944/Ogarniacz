package pl.ogarniacz.app;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import java.io.File;
import org.json.JSONArray;
import org.json.JSONObject;

final class MagazynAktualizacjiWeb {
    private static final String PREFERENCJE = "OgarniaczWebOta";
    private static final String KLUCZ_STANU = "stan";
    private static final String PREFERENCJE_CAPACITOR = "CapWebViewSettings";
    private static final String SCIEZKA_CAPACITOR = "serverBasePath";
    private static final int LIMIT_ODRZUCONYCH = 20;

    private MagazynAktualizacjiWeb() {}

    static final class MetadaneBundle {
        final String wersja;
        final String commitSha;
        final String zainstalowano;
        final String sciezka;
        final int minimalnyKodApk;

        MetadaneBundle(String wersja, String commitSha, String zainstalowano, String sciezka, int minimalnyKodApk) {
            this.wersja = wersja;
            this.commitSha = commitSha;
            this.zainstalowano = zainstalowano;
            this.sciezka = sciezka;
            this.minimalnyKodApk = minimalnyKodApk;
        }

        JSONObject doJson() throws Exception {
            JSONObject json = new JSONObject();
            json.put("bundleVersion", wersja);
            json.put("commitSha", commitSha);
            json.put("installedAt", zainstalowano);
            json.put("path", sciezka);
            json.put("minNativeVersionCode", minimalnyKodApk);
            return json;
        }

        static MetadaneBundle zJson(JSONObject json) throws Exception {
            return new MetadaneBundle(json.getString("bundleVersion"), json.getString("commitSha"),
                json.getString("installedAt"), json.getString("path"), json.getInt("minNativeVersionCode"));
        }
    }

    static synchronized void przygotujStart(Context kontekst) {
        JSONObject stan = wczytaj(kontekst);
        try {
            if (stan.has("pending")) {
                dodajOdrzucony(stan, stan.getJSONObject("pending"));
                stan.remove("pending");
            }
            int kodApk = pobierzKodApk(kontekst);
            while (stan.has("active")) {
                JSONObject aktywny = stan.getJSONObject("active");
                MetadaneBundle metadane = MetadaneBundle.zJson(aktywny);
                if (new File(metadane.sciezka, "index.html").isFile() && kodApk >= metadane.minimalnyKodApk) break;
                dodajOdrzucony(stan, aktywny);
                if (stan.has("previous")) stan.put("active", stan.getJSONObject("previous"));
                else stan.remove("active");
                stan.remove("previous");
            }
            zapisz(kontekst, stan);
            zapiszSciezke(kontekst, stan.has("active") ? stan.getJSONObject("active").getString("path") : "");
        } catch (Exception blad) {
            wyczyscStan(kontekst);
        }
    }

    static synchronized void zastosujPoStarcie(Bridge bridge, Context kontekst) {
        JSONObject stan = wczytaj(kontekst);
        String sciezka = stan.optJSONObject("active") == null ? null : stan.optJSONObject("active").optString("path", null);
        if (sciezka == null) {
            if (!"public".equals(bridge.getServerBasePath())) bridge.setServerAssetPath("public");
        } else if (!sciezka.equals(bridge.getServerBasePath())) {
            bridge.setServerBasePath(sciezka);
        }
    }

    static synchronized JSObject pobierzStan(Context kontekst) {
        JSONObject stan = wczytaj(kontekst);
        JSObject wynik = new JSObject();
        JSONObject aktualny = stan.optJSONObject("pending");
        if (aktualny == null) aktualny = stan.optJSONObject("active");
        wynik.put("aktualny", aktualny == null ? wbudowany(kontekst) : publiczne(aktualny));
        JSONObject poprzedni = stan.optJSONObject("previous");
        if (poprzedni != null) wynik.put("poprzedni", publiczne(poprzedni));
        JSONArray zapisaneOdrzucone = stan.optJSONArray("rejected");
        JSONArray odrzucone = new JSONArray();
        if (zapisaneOdrzucone != null) {
            for (int indeks = 0; indeks < zapisaneOdrzucone.length(); indeks++) {
                JSONObject zapisany = zapisaneOdrzucone.optJSONObject(indeks);
                JSObject publiczny = new JSObject();
                publiczny.put("bundleVersion", zapisany.optString("bundleVersion"));
                publiczny.put("commitSha", zapisany.optString("commitSha"));
                odrzucone.put(publiczny);
            }
        }
        wynik.put("odrzucone", odrzucone);
        wynik.put("pending", stan.has("pending"));
        return wynik;
    }

    static synchronized boolean czyOdrzucony(Context kontekst, String wersja, String commitSha) {
        JSONArray lista = wczytaj(kontekst).optJSONArray("rejected");
        if (lista == null) return false;
        for (int indeks = 0; indeks < lista.length(); indeks++) {
            JSONObject wpis = lista.optJSONObject(indeks);
            if (tenSam(wpis, wersja, commitSha)) return true;
        }
        return false;
    }

    static synchronized void rozpocznijOczekiwanie(Context kontekst, MetadaneBundle metadane) throws Exception {
        JSONObject stan = wczytaj(kontekst);
        stan.put("pending", metadane.doJson());
        zapisz(kontekst, stan);
        zapiszSciezke(kontekst, metadane.sciezka);
    }

    static synchronized void potwierdzGotowosc(Context kontekst) throws Exception {
        JSONObject stan = wczytaj(kontekst);
        JSONObject oczekujacy = stan.optJSONObject("pending");
        if (oczekujacy == null) return;
        JSONObject aktywny = stan.optJSONObject("active");
        if (aktywny != null) stan.put("previous", aktywny);
        stan.put("active", oczekujacy);
        stan.remove("pending");
        usunOdrzucony(stan, oczekujacy.getString("bundleVersion"), oczekujacy.getString("commitSha"));
        zapisz(kontekst, stan);
        zapiszSciezke(kontekst, oczekujacy.getString("path"));
    }

    static synchronized String przywrocPoprzedni(Context kontekst) throws Exception {
        JSONObject stan = wczytaj(kontekst);
        JSONObject aktywny = stan.optJSONObject("active");
        JSONObject poprzedni = stan.optJSONObject("previous");
        if (aktywny == null || poprzedni == null) throw new Exception("Poprzednia szybka wersja nie jest dostępna.");
        dodajOdrzucony(stan, aktywny);
        stan.put("active", poprzedni);
        stan.remove("previous");
        stan.remove("pending");
        zapisz(kontekst, stan);
        String sciezka = poprzedni.getString("path");
        zapiszSciezke(kontekst, sciezka);
        return sciezka;
    }

    static synchronized void przywrocWbudowany(Context kontekst) throws Exception {
        JSONObject stan = wczytaj(kontekst);
        JSONObject oczekujacy = stan.optJSONObject("pending");
        JSONObject aktywny = stan.optJSONObject("active");
        if (oczekujacy == null && aktywny == null) throw new Exception("Wersja wbudowana jest już aktywna.");
        if (oczekujacy != null) dodajOdrzucony(stan, oczekujacy);
        if (aktywny != null) dodajOdrzucony(stan, aktywny);
        stan.remove("active");
        stan.remove("previous");
        stan.remove("pending");
        zapisz(kontekst, stan);
        zapiszSciezke(kontekst, "");
    }

    private static JSONObject wczytaj(Context kontekst) {
        String tekst = preferencje(kontekst).getString(KLUCZ_STANU, null);
        if (tekst == null || tekst.isBlank()) return new JSONObject();
        try {
            return new JSONObject(tekst);
        } catch (Exception blad) {
            wyczyscStan(kontekst);
            return new JSONObject();
        }
    }

    private static void zapisz(Context kontekst, JSONObject stan) {
        if (!preferencje(kontekst).edit().putString(KLUCZ_STANU, stan.toString()).commit()) {
            throw new IllegalStateException("Nie udało się zapisać stanu Web OTA.");
        }
    }

    private static SharedPreferences preferencje(Context kontekst) {
        return kontekst.getSharedPreferences(PREFERENCJE, Context.MODE_PRIVATE);
    }

    private static void zapiszSciezke(Context kontekst, String sciezka) {
        boolean zapisano = kontekst.getSharedPreferences(PREFERENCJE_CAPACITOR, Context.MODE_PRIVATE)
            .edit().putString(SCIEZKA_CAPACITOR, sciezka).commit();
        if (!zapisano) throw new IllegalStateException("Nie udało się zapisać aktywnej ścieżki WebView.");
    }

    private static void wyczyscStan(Context kontekst) {
        preferencje(kontekst).edit().remove(KLUCZ_STANU).commit();
        zapiszSciezke(kontekst, "");
    }

    private static void dodajOdrzucony(JSONObject stan, JSONObject metadane) throws Exception {
        String wersja = metadane.getString("bundleVersion");
        String commitSha = metadane.getString("commitSha");
        usunOdrzucony(stan, wersja, commitSha);
        JSONArray staraLista = stan.optJSONArray("rejected");
        JSONArray nowaLista = new JSONArray();
        nowaLista.put(metadane);
        if (staraLista != null) {
            for (int indeks = 0; indeks < staraLista.length() && nowaLista.length() < LIMIT_ODRZUCONYCH; indeks++) {
                nowaLista.put(staraLista.getJSONObject(indeks));
            }
        }
        stan.put("rejected", nowaLista);
    }

    private static void usunOdrzucony(JSONObject stan, String wersja, String commitSha) throws Exception {
        JSONArray lista = stan.optJSONArray("rejected");
        if (lista == null) return;
        JSONArray wynik = new JSONArray();
        for (int indeks = 0; indeks < lista.length(); indeks++) {
            JSONObject wpis = lista.getJSONObject(indeks);
            if (!tenSam(wpis, wersja, commitSha)) wynik.put(wpis);
        }
        stan.put("rejected", wynik);
    }

    private static boolean tenSam(JSONObject wpis, String wersja, String commitSha) {
        return wpis != null && wersja.equals(wpis.optString("bundleVersion"))
            && commitSha.equalsIgnoreCase(wpis.optString("commitSha"));
    }

    private static JSObject publiczne(JSONObject metadane) {
        JSObject wynik = new JSObject();
        wynik.put("bundleVersion", metadane.optString("bundleVersion"));
        wynik.put("commitSha", metadane.optString("commitSha"));
        wynik.put("installedAt", metadane.optString("installedAt"));
        wynik.put("source", "web-ota");
        return wynik;
    }

    private static JSObject wbudowany(Context kontekst) {
        JSObject wynik = new JSObject();
        wynik.put("bundleVersion", BuildConfig.WEB_BUNDLE_VERSION);
        wynik.put("commitSha", BuildConfig.WEB_BUNDLE_COMMIT_SHA);
        wynik.put("installedAt", dataInstalacjiApk(kontekst));
        wynik.put("source", "builtin");
        return wynik;
    }

    private static int pobierzKodApk(Context kontekst) {
        try {
            return (int) PackageInfoCompat.getLongVersionCode(kontekst.getPackageManager().getPackageInfo(kontekst.getPackageName(), 0));
        } catch (Exception blad) {
            return BuildConfig.VERSION_CODE;
        }
    }

    private static String dataInstalacjiApk(Context kontekst) {
        try {
            long czas = kontekst.getPackageManager().getPackageInfo(kontekst.getPackageName(), 0).lastUpdateTime;
            return java.time.Instant.ofEpochMilli(czas).toString();
        } catch (Exception blad) {
            return "";
        }
    }
}
