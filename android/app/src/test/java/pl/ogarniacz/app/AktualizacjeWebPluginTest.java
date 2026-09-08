package pl.ogarniacz.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.junit.Test;

public class AktualizacjeWebPluginTest {
    @Test
    public void danePodpisuObejmujaMinimalnyKodApk() {
        AktualizacjeWebPlugin.DaneManifestu dane = new AktualizacjeWebPlugin.DaneManifestu(
            "dbea095", "a".repeat(40), "https://example.test/web-ota.zip", "b".repeat(64), "podpis",
            1000006, "2026-09-09T10:00:00Z"
        );
        String oczekiwane = "ogarniacz-web-ota-v1\ndbea095\n" + "a".repeat(40)
            + "\nhttps://example.test/web-ota.zip\n" + "b".repeat(64) + "\n1000006\n2026-09-09T10:00:00Z";
        assertEquals(oczekiwane, AktualizacjeWebPlugin.daneDoPodpisu(dane));
    }

    @Test
    public void blokujeZipSlip() throws Exception {
        File katalog = Files.createTempDirectory("ogarniacz-web-slip-").toFile();
        try {
            File zip = new File(katalog, "bundle.zip");
            try (ZipOutputStream wyjscie = new ZipOutputStream(new FileOutputStream(zip))) {
                wyjscie.putNextEntry(new ZipEntry("../poza.txt"));
                wyjscie.write("atak".getBytes(StandardCharsets.UTF_8));
            }
            File cel = new File(katalog, "cel");
            try {
                AktualizacjeWebPlugin.rozpakujBezpiecznie(zip, cel);
                fail("ZIP Slip powinien zostać odrzucony");
            } catch (Exception blad) {
                assertTrue(blad.getMessage().contains("niedozwoloną ścieżkę"));
            }
            assertFalse(new File(katalog, "poza.txt").exists());
            assertFalse(cel.exists());
        } finally {
            usun(katalog);
        }
    }

    private static void usun(File plik) {
        if (plik == null || !plik.exists()) return;
        File[] dzieci = plik.listFiles();
        if (dzieci != null) for (File dziecko : dzieci) usun(dziecko);
        plik.delete();
    }
}
