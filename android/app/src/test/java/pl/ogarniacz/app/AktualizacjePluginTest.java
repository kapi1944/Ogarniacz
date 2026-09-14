package pl.ogarniacz.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.security.MessageDigest;
import org.junit.Test;

public class AktualizacjePluginTest {
    private static final long GIB = 1024L * 1024L * 1024L;

    @Test public void malaIloscMiejscaBlokujePobieranie() {
        assertFalse(AktualizacjePlugin.czyJestWystarczajacoMiejsca(495L * 1024L * 1024L, 30L * 1024L * 1024L));
    }

    @Test public void konserwatywnyZapasPozwalaKontynuowac() {
        assertEquals(2L * GIB, AktualizacjePlugin.obliczWymaganeMiejsce(30L * 1024L * 1024L));
        assertTrue(AktualizacjePlugin.czyJestWystarczajacoMiejsca(2L * GIB, 30L * 1024L * 1024L));
        assertEquals(3L * GIB, AktualizacjePlugin.obliczBrakujaceMiejsce(1L * GIB, 4L * GIB));
    }

    @Test public void blednySha256UsuwaPlikAktualizacji() throws Exception {
        File plik = File.createTempFile("ogarniacz-aktualizacja-", ".apk");
        try (FileOutputStream wyjscie = new FileOutputStream(plik)) { wyjscie.write(new byte[] {1, 2, 3}); }
        assertFalse(AktualizacjePlugin.zweryfikujSkrotLubUsunPlik(plik, "a".repeat(64), "b".repeat(64)));
        assertFalse(plik.exists());
    }

    @Test public void awariaPrzeniesieniaUzywaBezpiecznegoFallbacku() throws Exception {
        File katalog = Files.createTempDirectory("ogarniacz-finalizacja-").toFile();
        File tymczasowy = new File(katalog, "plik.part"), docelowy = new File(katalog, "plik.apk");
        zapisz(tymczasowy, new byte[] {1, 2, 3});
        AktualizacjePlugin.sfinalizujZweryfikowanyApk(tymczasowy, docelowy, sha256(new byte[] {1, 2, 3}), (zrodlo, cel) -> { throw new Exception("brak atomic move"); });
        assertTrue(docelowy.isFile()); assertFalse(tymczasowy.exists());
        docelowy.delete(); katalog.delete();
    }

    @Test public void blednaFinalizacjaNieZostawiaGotowegoPliku() throws Exception {
        File katalog = Files.createTempDirectory("ogarniacz-finalizacja-").toFile();
        File tymczasowy = new File(katalog, "plik.part"), docelowy = new File(katalog, "plik.apk");
        zapisz(tymczasowy, new byte[] {1, 2, 3});
        try {
            AktualizacjePlugin.sfinalizujZweryfikowanyApk(tymczasowy, docelowy, "a".repeat(64), (zrodlo, cel) -> Files.move(zrodlo.toPath(), cel.toPath()));
        } catch (AktualizacjePlugin.BladFinalizacjiException oczekiwany) { }
        assertFalse(docelowy.exists());
        tymczasowy.delete(); katalog.delete();
    }

    @Test public void sprzatanieUsuwaStaryPartIZachowujePotrzebnyApk() throws Exception {
        File katalog = Files.createTempDirectory("ogarniacz-sprzatanie-").toFile();
        File staryPart = new File(katalog, "Ogarniacz-1.0.9-release.apk.part");
        File staryApk = new File(katalog, "Ogarniacz-1.0.9-release.apk");
        File potrzebny = new File(katalog, "Ogarniacz-1.0.10-release.apk");
        zapisz(staryPart, new byte[] {1}); zapisz(staryApk, new byte[] {2}); zapisz(potrzebny, new byte[] {3});
        staryPart.setLastModified(System.currentTimeMillis() - 25L * 60L * 60L * 1000L);
        AktualizacjePlugin.posprzatajKatalogAktualizacji(katalog, potrzebny.getName(), System.currentTimeMillis(), false);
        assertFalse(staryPart.exists()); assertFalse(staryApk.exists()); assertTrue(potrzebny.exists());
        potrzebny.delete(); katalog.delete();
    }

    private static void zapisz(File plik, byte[] bajty) throws Exception { try (FileOutputStream wyjscie = new FileOutputStream(plik)) { wyjscie.write(bajty); } }
    private static String sha256(byte[] bajty) throws Exception { byte[] skrot = MessageDigest.getInstance("SHA-256").digest(bajty); StringBuilder wynik = new StringBuilder(); for (byte bajt : skrot) wynik.append(String.format("%02x", bajt)); return wynik.toString(); }
}
