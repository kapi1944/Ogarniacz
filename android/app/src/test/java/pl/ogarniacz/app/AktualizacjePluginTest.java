package pl.ogarniacz.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertThrows;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.security.MessageDigest;
import android.content.pm.PackageInstaller;
import org.junit.Test;

public class AktualizacjePluginTest {
    private static final long GIB = 1024L * 1024L * 1024L;
    private static final long MIB = 1024L * 1024L;

    @Test public void sukcesPoprzedniejInstalacjiNieBlokujePobraniaKolejnejWersji() {
        String nazwa = "Ogarniacz-1.0.14-release.apk", sha = "a".repeat(64);
        assertFalse(StanInstalacjiApk.czyMaZweryfikowanyApk(StanInstalacjiApk.SUKCES, nazwa, sha));
        assertFalse(StanInstalacjiApk.czyMaZweryfikowanyApk(StanInstalacjiApk.POBRANO, nazwa, sha));
        assertTrue(StanInstalacjiApk.czyMaZweryfikowanyApk(StanInstalacjiApk.ZWERYFIKOWANO, nazwa, sha));
        assertTrue(StanInstalacjiApk.czyMaZweryfikowanyApk(StanInstalacjiApk.ANULOWANO, nazwa, sha));
        assertTrue(StanInstalacjiApk.czyMaZweryfikowanyApk(StanInstalacjiApk.NIEZNANY_BLAD, nazwa, sha));
        assertFalse(StanInstalacjiApk.czyMaZweryfikowanyApk(StanInstalacjiApk.NIEPRAWIDLOWY_APK, null, null));
    }

    @Test public void restartPrzedCommitPorzucaNiedokonczonaSesjeIZachowujeApkDoRetry() throws Exception {
        File plik = File.createTempFile("ogarniacz-przerwana-sesja-", ".apk");
        byte[] dane = new byte[] {1, 2, 3};
        zapisz(plik, dane);
        java.util.List<String> dzialania = new java.util.ArrayList<>();
        String[] status = { StanInstalacjiApk.INSTALOWANIE };
        try {
            AktualizacjePlugin.uzgodnijPrzerwanaSesje(status[0], true, false,
                () -> dzialania.add("porzucenie"),
                () -> { dzialania.add("przerwanie"); status[0] = StanInstalacjiApk.NIEZNANY_BLAD; });
            assertEquals(java.util.List.of("porzucenie", "przerwanie"), dzialania);
            assertTrue(StanInstalacjiApk.czyMoznaPonowicInstalacje(status[0]));
            assertArrayEquals(dane, Files.readAllBytes(plik.toPath()));
        } finally { plik.delete(); }
    }

    @Test public void brakSesjiPoRestarcieOdblokowujeRetryBezPorzucaniaNieistniejacejSesji() {
        for (String poprzedni : new String[] { StanInstalacjiApk.INSTALOWANIE, StanInstalacjiApk.OCZEKUJE_NA_POTWIERDZENIE_INSTALACJI }) {
            String[] status = { poprzedni };
            AktualizacjePlugin.uzgodnijPrzerwanaSesje(status[0], false, false,
                () -> { throw new AssertionError("Nie wolno porzucać nieistniejącej sesji."); },
                () -> status[0] = StanInstalacjiApk.NIEZNANY_BLAD);
            assertTrue(StanInstalacjiApk.czyMoznaPonowicInstalacje(status[0]));
        }
    }

    @Test public void restartNiePrzerywaZatwierdzonejInstalacjiAniInnychStanow() {
        Runnable niedozwolone = () -> { throw new AssertionError("Nie wolno zmieniać tego stanu."); };
        AktualizacjePlugin.uzgodnijPrzerwanaSesje(StanInstalacjiApk.INSTALOWANIE, true, true, niedozwolone, niedozwolone);
        AktualizacjePlugin.uzgodnijPrzerwanaSesje(StanInstalacjiApk.OCZEKUJE_NA_POTWIERDZENIE_INSTALACJI, true, true, niedozwolone, niedozwolone);
        for (String status : new String[] { StanInstalacjiApk.SUKCES, StanInstalacjiApk.ZWERYFIKOWANO, StanInstalacjiApk.ANULOWANO }) {
            AktualizacjePlugin.uzgodnijPrzerwanaSesje(status, false, false, niedozwolone, niedozwolone);
        }
    }

    @Test public void bladPorzuceniaSesjiNieUdajeGotowosciDoNowejInstalacji() {
        assertThrows(IllegalStateException.class, () -> AktualizacjePlugin.uzgodnijPrzerwanaSesje(
            StanInstalacjiApk.INSTALOWANIE, true, false,
            () -> { throw new IllegalStateException("System nie pozwolił porzucić sesji."); },
            () -> { throw new AssertionError("Nie wolno zgłosić przerwania bez porzucenia sesji."); }));
    }

    @Test public void zapisSesjiZamykaStrumienPrzedZatwierdzeniemIZachowujeApkDoRetry() throws Exception {
        File plik = File.createTempFile("ogarniacz-sesja-", ".apk");
        byte[] dane = new byte[150_000];
        new java.util.Random(13).nextBytes(dane);
        zapisz(plik, dane);
        StrumienSesji strumien = new StrumienSesji();
        try {
            AktualizacjePlugin.zapiszApkWSesji(plik, strumien, (wyjscie) -> {
                assertFalse(strumien.zamkniety);
                assertArrayEquals(dane, strumien.toByteArray());
                strumien.zsynchronizowany = true;
            });
            assertTrue(strumien.zamkniety);
            assertTrue(strumien.zsynchronizowany);
            assertArrayEquals(dane, Files.readAllBytes(plik.toPath()));
        } finally { plik.delete(); }
    }

    @Test public void bladZapisuSesjiZamykaStrumienIZachowujeApkDoRetry() throws Exception {
        File plik = File.createTempFile("ogarniacz-sesja-", ".apk");
        zapisz(plik, new byte[] {1, 2, 3});
        StrumienSesji strumien = new StrumienSesji();
        try {
            assertThrows(IOException.class, () -> AktualizacjePlugin.zapiszApkWSesji(plik, strumien, (wyjscie) -> {
                throw new IOException("Brak miejsca podczas fsync");
            }));
            assertTrue(strumien.zamkniety);
            assertTrue(plik.isFile());
        } finally { plik.delete(); }
    }

    private static final class StrumienSesji extends ByteArrayOutputStream {
        boolean zamkniety;
        boolean zsynchronizowany;
        @Override public void close() throws IOException { zamkniety = true; super.close(); }
    }

    @Test public void malaIloscMiejscaBlokujePobieranie() {
        assertFalse(AktualizacjePlugin.czyJestWystarczajacoMiejsca(100L * MIB, 30L * MIB));
    }

    @Test public void mapujeStatusyPackageInstalleraNaStabilneRezultaty() {
        assertEquals(StanInstalacjiApk.OCZEKUJE_NA_POTWIERDZENIE_INSTALACJI, StanInstalacjiApk.mapujStatus(PackageInstaller.STATUS_PENDING_USER_ACTION, null));
        assertEquals(StanInstalacjiApk.SUKCES, StanInstalacjiApk.mapujStatus(PackageInstaller.STATUS_SUCCESS, null));
        assertEquals(StanInstalacjiApk.BRAK_MIEJSCA, StanInstalacjiApk.mapujStatus(PackageInstaller.STATUS_FAILURE_STORAGE, null));
        assertEquals(StanInstalacjiApk.NIEZGODNY_PODPIS, StanInstalacjiApk.mapujStatus(PackageInstaller.STATUS_FAILURE_CONFLICT, "signature mismatch"));
        assertEquals(StanInstalacjiApk.NIEPRAWIDLOWY_APK, StanInstalacjiApk.mapujStatus(PackageInstaller.STATUS_FAILURE_INVALID, null));
        assertEquals(StanInstalacjiApk.KONFLIKT_WERSJI, StanInstalacjiApk.mapujStatus(PackageInstaller.STATUS_FAILURE_CONFLICT, "INSTALL_FAILED_VERSION_DOWNGRADE"));
        assertEquals(StanInstalacjiApk.NIEDOZWOLONE_ZRODLO, StanInstalacjiApk.mapujStatus(PackageInstaller.STATUS_FAILURE_BLOCKED, "unknown source"));
        assertEquals(StanInstalacjiApk.BLOKADA_SYSTEMOWA, StanInstalacjiApk.mapujStatus(PackageInstaller.STATUS_FAILURE_BLOCKED, "blocked by device policy"));
        assertEquals(StanInstalacjiApk.ANULOWANO, StanInstalacjiApk.mapujStatus(PackageInstaller.STATUS_FAILURE_ABORTED, null));
    }
    @Test public void trwałyApkPozostajeDostępnyDoPonowieniaTylkoPoWeryfikacji() {
        assertFalse(StanInstalacjiApk.czyMoznaPonowicInstalacje(StanInstalacjiApk.POBRANO));
        assertTrue(StanInstalacjiApk.czyMoznaPonowicInstalacje(StanInstalacjiApk.ZWERYFIKOWANO));
        assertTrue(StanInstalacjiApk.czyMoznaPonowicInstalacje(StanInstalacjiApk.OCZEKUJE_NA_ZGODE_NIEZNANYCH_ZRODEL));
        assertTrue(StanInstalacjiApk.czyMoznaPonowicInstalacje(StanInstalacjiApk.ANULOWANO));
        assertTrue(StanInstalacjiApk.czyMoznaPonowicInstalacje(StanInstalacjiApk.BRAK_MIEJSCA));
        assertTrue(StanInstalacjiApk.czyMoznaPonowicInstalacje(StanInstalacjiApk.NIEZGODNY_PODPIS));
        assertFalse(StanInstalacjiApk.czyMoznaPonowicInstalacje(StanInstalacjiApk.OCZEKUJE_NA_POTWIERDZENIE_INSTALACJI));
        assertFalse(StanInstalacjiApk.czyMoznaPonowicInstalacje(StanInstalacjiApk.INSTALOWANIE));
        assertTrue(StanInstalacjiApk.czyMoznaPonowicInstalacje(StanInstalacjiApk.KONFLIKT_WERSJI));
        assertTrue(StanInstalacjiApk.czyMoznaPonowicInstalacje(StanInstalacjiApk.NIEDOZWOLONE_ZRODLO));
        assertTrue(StanInstalacjiApk.czyMoznaPonowicInstalacje(StanInstalacjiApk.BRAK_SYSTEMOWEGO_INSTALATORA));
    }

    @Test public void konserwatywnyZapasPozwalaKontynuowac() {
        assertEquals(154L * MIB, AktualizacjePlugin.obliczWymaganeMiejsce(30L * MIB));
        assertEquals(94L * MIB, AktualizacjePlugin.obliczWymaganeMiejsceInstalacji(30L * MIB));
        assertEquals(112L * MIB, AktualizacjePlugin.obliczWymaganeMiejscePrzyBrakuRozmiaru());
        assertTrue(AktualizacjePlugin.czyJestWystarczajacoMiejsca(154L * MIB, 30L * MIB));
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

    @Test public void sprzatanieUsuwaWygasleArtefaktyIZachowujeZweryfikowanyApk() throws Exception {
        File katalog = Files.createTempDirectory("ogarniacz-sprzatanie-").toFile();
        File staryPart = new File(katalog, "Ogarniacz-1.0.9-release.apk.part");
        File staryApk = new File(katalog, "Ogarniacz-1.0.9-release.apk");
        File trwaleChroniony = new File(katalog, "Ogarniacz-1.0.10-release.apk");
        File potrzebny = new File(katalog, "Ogarniacz-1.0.11-release.apk");
        zapisz(staryPart, new byte[] {1}); zapisz(staryApk, new byte[] {2}); zapisz(trwaleChroniony, new byte[] {3}); zapisz(potrzebny, new byte[] {4});
        staryPart.setLastModified(System.currentTimeMillis() - 25L * 60L * 60L * 1000L);
        staryApk.setLastModified(System.currentTimeMillis() - 25L * 60L * 60L * 1000L);
        AktualizacjePlugin.posprzatajKatalogAktualizacji(katalog, potrzebny.getName(), trwaleChroniony.getName(), System.currentTimeMillis(), false);
        assertFalse(staryPart.exists()); assertFalse(staryApk.exists()); assertTrue(trwaleChroniony.exists()); assertTrue(potrzebny.exists());
        trwaleChroniony.delete(); potrzebny.delete(); katalog.delete();
    }

    private static void zapisz(File plik, byte[] bajty) throws Exception { try (FileOutputStream wyjscie = new FileOutputStream(plik)) { wyjscie.write(bajty); } }
    private static String sha256(byte[] bajty) throws Exception { byte[] skrot = MessageDigest.getInstance("SHA-256").digest(bajty); StringBuilder wynik = new StringBuilder(); for (byte bajt : skrot) wynik.append(String.format("%02x", bajt)); return wynik.toString(); }
}
