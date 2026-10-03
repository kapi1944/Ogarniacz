package pl.ogarniacz.app;

import android.content.SharedPreferences;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.*;

public class MagazynAktualizacjiWebTest {
    private SharedPreferences preferencje(Map<String, String> dane, boolean zapisUdany) {
        SharedPreferences.Editor edytor = (SharedPreferences.Editor) Proxy.newProxyInstance(
            getClass().getClassLoader(), new Class<?>[] { SharedPreferences.Editor.class },
            (obiekt, metoda, argumenty) -> {
                if (metoda.getName().equals("remove")) { dane.remove(argumenty[0]); return obiekt; }
                if (metoda.getName().equals("commit")) return zapisUdany;
                throw new AssertionError("Niedozwolona operacja: " + metoda.getName());
            });
        return (SharedPreferences) Proxy.newProxyInstance(getClass().getClassLoader(),
            new Class<?>[] { SharedPreferences.class }, (obiekt, metoda, argumenty) -> {
                if (metoda.getName().equals("edit")) return edytor;
                throw new AssertionError("Migracja nie powinna odczytywać ścieżek z metadanych");
            });
    }

    private void sprawdzMigracje(String rodzaj) throws Exception {
        Path katalog = Files.createTempDirectory("ogarniacz-migracja-");
        try {
            Path bundle = Files.createDirectories(katalog.resolve("web-ota/bundle/stary"));
            Files.write(bundle.resolve("index.html"), "stary frontend".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            Files.createDirectories(katalog.resolve("web-ota/pobieranie"));
            Files.write(katalog.resolve("web-ota/pobieranie/bundle.zip.part"), "zip".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            Path daneUzytkownika = katalog.resolve("dokument.txt");
            Files.write(daneUzytkownika, "dane użytkownika".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            Path baza = Files.createDirectories(katalog.resolve("app_webview/IndexedDB"));
            Files.write(baza.resolve("dexie"), "rekordy".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            Map<String, String> stan = new HashMap<>();
            stan.put("stan", "{\"" + rodzaj + "\":{\"path\":\"" + daneUzytkownika + "\"}}");
            stan.put("inne", "ustawienie");
            Map<String, String> capacitor = new HashMap<>();
            capacitor.put("serverBasePath", bundle.toString());
            capacitor.put("sesja", "zachowana");
            for (int proba = 0; proba < 2; proba++) {
                MagazynAktualizacjiWeb.wycofajKanal(preferencje(stan, true), preferencje(capacitor, true), katalog.toFile());
                assertFalse(stan.containsKey("stan"));
                assertFalse(capacitor.containsKey("serverBasePath"));
                assertFalse(Files.exists(katalog.resolve("web-ota")));
                assertEquals("ustawienie", stan.get("inne"));
                assertEquals("zachowana", capacitor.get("sesja"));
                assertEquals("dane użytkownika", new String(Files.readAllBytes(daneUzytkownika), java.nio.charset.StandardCharsets.UTF_8));
                assertEquals("rekordy", new String(Files.readAllBytes(baza.resolve("dexie")), java.nio.charset.StandardCharsets.UTF_8));
            }
        } finally {
            try (var pliki = Files.walk(katalog)) {
                for (Path plik : pliki.sorted(java.util.Comparator.reverseOrder()).collect(java.util.stream.Collectors.toList())) Files.deleteIfExists(plik);
            }
        }
    }

    @Test public void aktywnyBundleWracaDoWbudowanego() throws Exception { sprawdzMigracje("active"); }
    @Test public void oczekujacyBundleWracaDoWbudowanego() throws Exception { sprawdzMigracje("pending"); }
    @Test public void poprzedniBundleWracaDoWbudowanego() throws Exception { sprawdzMigracje("previous"); }
    @Test public void samaSciezkaCapacitorJestUsuwana() throws Exception {
        Path katalog = Files.createTempDirectory("ogarniacz-sciezka-");
        try {
            Map<String, String> capacitor = new HashMap<>();
            capacitor.put("serverBasePath", "/stary/bundle");
            MagazynAktualizacjiWeb.wycofajKanal(preferencje(new HashMap<>(), true),
                preferencje(capacitor, true), katalog.toFile());
            assertFalse(capacitor.containsKey("serverBasePath"));
        } finally { Files.delete(katalog); }
    }

    @Test public void bladZapisuBlokujeStart() {
        try {
            MagazynAktualizacjiWeb.wycofajKanal(preferencje(new HashMap<>(), true),
                preferencje(new HashMap<>(), false), new java.io.File("nieuzywany"));
            fail("Nie wolno uruchomić starego frontendu po błędzie resetu");
        } catch (IllegalStateException oczekiwany) { }
    }
}
