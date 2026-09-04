package pl.ogarniacz.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileOutputStream;
import org.junit.Test;

public class AktualizacjePluginTest {

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
