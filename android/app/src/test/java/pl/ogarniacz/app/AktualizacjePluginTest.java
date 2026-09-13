package pl.ogarniacz.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileOutputStream;
import org.junit.Test;

public class AktualizacjePluginTest {

    @Test
    public void malyApkWymagaRozsadnegoZapasuNaInstalacje() {
        long megabajt = 1024L * 1024L;

        assertEquals(38L * megabajt, AktualizacjePlugin.obliczWymaganeMiejscePrzedPobraniem(6L * megabajt));
        assertTrue(100L * megabajt >= AktualizacjePlugin.obliczWymaganeMiejscePrzedPobraniem(6L * megabajt));
        assertFalse(20L * megabajt >= AktualizacjePlugin.obliczWymaganeMiejscePrzedPobraniem(6L * megabajt));
    }

    @Test
    public void duzyApkRezerwujeDodatkowoSwojRozmiar() {
        long megabajt = 1024L * 1024L;

        assertEquals(160L * megabajt, AktualizacjePlugin.obliczWymaganeMiejscePrzedPobraniem(80L * megabajt));
        assertEquals(80L * megabajt, AktualizacjePlugin.obliczZapasInstalacji(80L * megabajt));
    }

    @Test
    public void blednySha256UsuwaPlikAktualizacji() throws Exception {
        File plik = File.createTempFile("ogarniacz-aktualizacja-", ".apk");
        try (FileOutputStream wyjscie = new FileOutputStream(plik)) {
            wyjscie.write(new byte[] {1, 2, 3});
        }

        boolean zgodny = AktualizacjePlugin.zweryfikujSkrotLubUsunPlik(
            plik,
            "a".repeat(64),
            "b".repeat(64)
        );

        assertFalse(zgodny);
        assertFalse(plik.exists());
    }

    @Test
    public void prawidlowySha256ZachowujePlikAktualizacji() throws Exception {
        File plik = File.createTempFile("ogarniacz-aktualizacja-", ".apk");
        try {
            assertTrue(AktualizacjePlugin.zweryfikujSkrotLubUsunPlik(plik, "a".repeat(64), "a".repeat(64)));
            assertTrue(plik.exists());
        } finally {
            plik.delete();
        }
    }
}
