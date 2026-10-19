package pl.ogarniacz.app;

import android.app.Activity;
import android.content.Intent;
import android.content.Context;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "EksportPliku")
public class EksportPlikuPlugin extends Plugin {
    private volatile boolean trwaZapis;

    @PluginMethod
    public void zapisz(PluginCall wywolanie) {
        String nazwa = wywolanie.getString("nazwa");
        if (trwaZapis || nazwa == null || nazwa.isEmpty() || nazwa.contains("/") || nazwa.contains("\\")
                || wywolanie.getString("tekst") == null) {
            wywolanie.reject("Nieprawidłowy plik lub zapis już trwa.");
            return;
        }
        Intent zamiar = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        zamiar.addCategory(Intent.CATEGORY_OPENABLE);
        zamiar.setType(wywolanie.getString("typ", "application/json"));
        zamiar.putExtra(Intent.EXTRA_TITLE, nazwa);
        zamiar.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            trwaZapis = true;
            startActivityForResult(wywolanie, zamiar, "poWyborzeMiejsca");
        } catch (Exception przyczyna) {
            trwaZapis = false;
            wywolanie.reject("Nie można otworzyć systemowego zapisu pliku.");
        }
    }

    @ActivityCallback
    private void poWyborzeMiejsca(PluginCall wywolanie, ActivityResult wynik) {
        if (wywolanie == null) { trwaZapis = false; return; }
        if (wynik.getResultCode() == Activity.RESULT_CANCELED) {
            trwaZapis = false;
            wywolanie.resolve(new JSObject().put("status", "anulowano"));
            return;
        }
        Uri adres = wynik.getData() == null ? null : wynik.getData().getData();
        if (wynik.getResultCode() != Activity.RESULT_OK || adres == null || !"content".equals(adres.getScheme())) {
            trwaZapis = false;
            wywolanie.reject("System nie zwrócił adresu dokumentu.");
            return;
        }
        // Dostawca dokumentów może wykonywać operacje sieciowe; nie blokujemy wątku UI.
        getBridge().execute(() -> {
            try {
                String tekst = wywolanie.getString("tekst");
                if (tekst == null) throw new IllegalStateException("Brak danych po powrocie z okna zapisu.");
                zapiszDokument(getContext(), adres, tekst);
                wywolanie.resolve(new JSObject().put("status", "zapisano").put("uri", adres.toString()));
            } catch (Exception przyczyna) {
                // Nie usuwamy pliku dostawcy: może zawierać częściowy zapis, który użytkownik sprawdzi.
                wywolanie.reject("Nie udało się zapisać i odczytać całego dokumentu. Sprawdź plik w wybranym miejscu.");
            } finally {
                trwaZapis = false;
            }
        });
    }

    static void zapiszDokument(Context kontekst, Uri adres, String tekst) throws Exception {
        byte[] bajty = tekst.getBytes(StandardCharsets.UTF_8);
        try (OutputStream strumien = kontekst.getContentResolver().openOutputStream(adres, "wt")) {
            if (strumien == null) throw new IllegalStateException("Brak dostępu do zapisu.");
            strumien.write(bajty);
            strumien.flush();
        }
        try (InputStream odczyt = kontekst.getContentResolver().openInputStream(adres)) {
            WeryfikacjaPliku.sprawdz(odczyt, bajty);
        }
    }

    @PluginMethod
    public void sprawdzZalacznik(PluginCall wywolanie) {
        try {
            Uri adres = Uri.parse(wywolanie.getString("uri", ""));
            if (!"file".equals(adres.getScheme()) || adres.getPath() == null) throw new IllegalArgumentException();
            File plik = new File(adres.getPath()).getCanonicalFile();
            String katalog = new File(getContext().getCacheDir(), "eksport").getCanonicalPath() + File.separator;
            if (!plik.getPath().startsWith(katalog) || !plik.getName().endsWith(".json") || !plik.isFile() || plik.length() == 0) {
                throw new IllegalArgumentException();
            }
            Uri adresTresci = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", plik);
            String typ = getContext().getContentResolver().getType(adresTresci);
            if (!"application/json".equals(typ)) throw new IllegalArgumentException();
            try (InputStream odczyt = getContext().getContentResolver().openInputStream(adresTresci);
                    InputStream oryginal = new FileInputStream(plik)) {
                WeryfikacjaPliku.porownaj(odczyt, oryginal);
            }
            wywolanie.resolve(new JSObject().put("uri", adresTresci.toString()).put("typ", typ));
        } catch (Exception przyczyna) {
            wywolanie.reject("Załącznik JSON jest niedostępny lub nie można go odczytać przez FileProvider.");
        }
    }
}
