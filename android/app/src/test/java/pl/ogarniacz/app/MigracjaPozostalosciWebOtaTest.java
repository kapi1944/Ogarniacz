package pl.ogarniacz.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
public class MigracjaPozostalosciWebOtaTest {
    private void sprawdzMigracje(String rodzaj) throws Exception {
        Context kontekst = RuntimeEnvironment.getApplication();
        SharedPreferences web = kontekst.getSharedPreferences("OgarniaczWebOta", Context.MODE_PRIVATE);
        SharedPreferences capacitor = kontekst.getSharedPreferences("CapWebViewSettings", Context.MODE_PRIVATE);
        web.edit().clear().putString("stan", rodzaj == null ? null : "{\"" + rodzaj + "\":{\"path\":\"/poza/ota\"}}")
            .putString("inne", "ustawienie").commit();
        capacitor.edit().clear().putString("serverBasePath", "/stary/bundle").putString("sesja", "zachowana").commit();
        Path katalog = kontekst.getFilesDir().toPath();
        Path bundle = Files.createDirectories(katalog.resolve("web-ota/bundle/stary"));
        Files.write(bundle.resolve("index.html"), "stary frontend".getBytes(StandardCharsets.UTF_8));
        Path baza = Files.createDirectories(kontekst.getDataDir().toPath().resolve("app_webview/Default/IndexedDB"));
        Path dane = baza.resolve("dexie");
        Files.write(dane, "rekordy".getBytes(StandardCharsets.UTF_8));
        Path dokument = katalog.resolve("dokument.txt");
        Files.write(dokument, "dokument".getBytes(StandardCharsets.UTF_8));

        MigracjaPozostalosciWebOta.wykonaj(kontekst);

        assertFalse(web.contains("stan"));
        assertFalse(capacitor.contains("serverBasePath"));
        assertTrue(web.getBoolean("wycofanoKanal", false));
        assertFalse(Files.exists(katalog.resolve("web-ota")));
        assertEquals("ustawienie", web.getString("inne", null));
        assertEquals("zachowana", capacitor.getString("sesja", null));
        assertEquals("rekordy", new String(Files.readAllBytes(dane), StandardCharsets.UTF_8));
        assertEquals("dokument", new String(Files.readAllBytes(dokument), StandardCharsets.UTF_8));

        // Po zakończeniu wystarcza odczyt znacznika; nie otwieramy drugich preferencji ani katalogu.
        MigracjaPozostalosciWebOta.wykonaj(web, null, null);
    }

    @Test public void aktywnyBundleWracaDoWbudowanego() throws Exception { sprawdzMigracje("active"); }
    @Test public void oczekujacyBundleWracaDoWbudowanego() throws Exception { sprawdzMigracje("pending"); }
    @Test public void poprzedniBundleWracaDoWbudowanego() throws Exception { sprawdzMigracje("previous"); }
    @Test public void odrzuconyBundleJestUsuwany() throws Exception { sprawdzMigracje("rejected"); }
    @Test public void samaSciezkaCapacitorJestUsuwana() throws Exception { sprawdzMigracje(null); }

    @Test public void nieudaneCzyszczenieJestPonawianeBezBlokowaniaApk() throws Exception {
        Context kontekst = RuntimeEnvironment.getApplication();
        SharedPreferences web = kontekst.getSharedPreferences("OgarniaczWebOta", Context.MODE_PRIVATE);
        SharedPreferences capacitor = kontekst.getSharedPreferences("CapWebViewSettings", Context.MODE_PRIVATE);
        web.edit().clear().putString("stan", "stary").commit();
        capacitor.edit().putString("serverBasePath", "/stary/bundle").commit();
        File niedostepny = new File(kontekst.getFilesDir(), "niedostepny") {
            @Override public boolean exists() { return true; }
            @Override public boolean delete() { return false; }
        };
        Path katalog = Files.createTempDirectory("ogarniacz-ota-");
        try {
            Path ota = Files.createDirectory(katalog.resolve("web-ota"));
            Files.write(ota.resolve("index.html"), new byte[] { 1 });
            MigracjaPozostalosciWebOta.wykonaj(web, capacitor, niedostepny);
            assertFalse(web.getBoolean("wycofanoKanal", false));
            assertFalse(capacitor.contains("serverBasePath"));
            MigracjaPozostalosciWebOta.wykonaj(web, capacitor, ota.toFile());
            assertTrue(web.getBoolean("wycofanoKanal", false));
        } finally {
            try (var pliki = Files.walk(katalog)) {
                for (Path plik : pliki.sorted(java.util.Comparator.reverseOrder()).collect(java.util.stream.Collectors.toList())) Files.deleteIfExists(plik);
            }
        }
    }
}
