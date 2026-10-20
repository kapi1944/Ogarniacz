package pl.ogarniacz.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.security.MessageDigest;
import org.junit.Test;

public class PobieranieApkTest {
    @org.junit.Rule public org.junit.rules.TemporaryFolder pliki = new org.junit.rules.TemporaryFolder();

    @Test public void pobieraStrumieniowoPoLancuchuPrzekierowanHttps() throws Exception {
        byte[] dane = new byte[170_000]; new java.util.Random(17).nextBytes(dane);
        PolaczenieTestowe pierwszy = new PolaczenieTestowe(302, "/wydanie/app.apk", new byte[0], -1);
        PolaczenieTestowe drugi = new PolaczenieTestowe(302, "https://release-assets.githubusercontent.com/app.apk?podpis=TAJNY", new byte[0], -1);
        PolaczenieTestowe plik = new PolaczenieTestowe(200, null, dane, dane.length);
        java.util.List<PolaczenieTestowe> polaczenia = java.util.List.of(pierwszy, drugi, plik);
        java.util.List<String> adresy = new java.util.ArrayList<>();
        java.util.List<Integer> postep = new java.util.ArrayList<>();
        File cel = pliki.newFile("app.part");
        String skrot = PobieranieApk.pobierz("https://github.com/wydanie", cel, (long) dane.length, (rozmiar) -> {}, postep::add,
            (adres) -> { adresy.add(adres.toString()); return polaczenia.get(adresy.size() - 1); }, (czas) -> {});
        assertEquals(obliczSha256(dane), skrot);
        assertArrayEquals(dane, Files.readAllBytes(cel.toPath()));
        assertEquals("https://github.com/wydanie/app.apk", adresy.get(1));
        assertTrue(postep.contains(0));
        for (PolaczenieTestowe polaczenie : polaczenia) {
            assertTrue(polaczenie.rozlaczone);
            assertEquals("*/*", polaczenie.getRequestProperty("Accept"));
            assertEquals("identity", polaczenie.getRequestProperty("Accept-Encoding"));
            assertEquals(15000, polaczenie.getConnectTimeout());
            assertEquals(30000, polaczenie.getReadTimeout());
            assertFalse(polaczenie.getInstanceFollowRedirects());
        }
        assertTrue(plik.zamknietyOdczyt);
    }

    @Test public void zerwanyTransferPonawiaOdPierwotnegoAdresuBezDoklejaniaBajtow() throws Exception {
        byte[] dane = new byte[] {1, 2, 3, 4, 5};
        PolaczenieTestowe zerwane = new PolaczenieTestowe(200, null, dane, dane.length);
        zerwane.przerwijPo = 2;
        PolaczenieTestowe pelne = new PolaczenieTestowe(200, null, dane, dane.length);
        File cel = pliki.newFile("app.part"); zapisz(cel, new byte[] {99, 99});
        java.util.List<String> adresy = new java.util.ArrayList<>();
        java.util.List<Long> przerwy = new java.util.ArrayList<>();
        String skrot = PobieranieApk.pobierz("https://github.com/app.apk", cel, (long) dane.length, (rozmiar) -> {}, (procent) -> {},
            (adres) -> { adresy.add(adres.toString()); return adresy.size() == 1 ? zerwane : pelne; }, przerwy::add);
        assertEquals(obliczSha256(dane), skrot);
        assertArrayEquals(dane, Files.readAllBytes(cel.toPath()));
        assertEquals(java.util.List.of("https://github.com/app.apk", "https://github.com/app.apk"), adresy);
        assertEquals(java.util.List.of(500L), przerwy);
        assertTrue(zerwane.rozlaczone && zerwane.zamknietyOdczyt && pelne.rozlaczone);
    }

    @Test public void krotkiTransferBezRozmiaruManifestuPonawiaIZwracaBladSieci() throws Exception {
        File cel = pliki.newFile("app.part");
        int[] proby = {0};
        PobieranieApk.Blad blad = assertThrows(PobieranieApk.Blad.class, () -> PobieranieApk.pobierz(
            "https://github.com/app.apk", cel, null, (rozmiar) -> {}, (procent) -> {},
            (adres) -> { proby[0]++; return new PolaczenieTestowe(200, null, new byte[] {1, 2}, 5); }, (czas) -> {}));
        assertEquals("BLAD_SIECI", blad.kod); assertEquals(2, blad.proba); assertEquals(2, proby[0]);
        assertFalse(cel.exists());
    }

    @Test public void timeoutDnsITlsMajaBezpiecznaDiagnostykeIZwalniajaPolaczenie() throws Exception {
        for (IOException przyczyna : new IOException[] {new java.net.SocketTimeoutException("TAJNY"), new java.net.UnknownHostException("TAJNY"), new javax.net.ssl.SSLHandshakeException("TAJNY")}) {
            File cel = new File(pliki.getRoot(), "blad.part");
            PolaczenieTestowe polaczenie = new PolaczenieTestowe(200, null, new byte[0], -1);
            polaczenie.bladOdpowiedzi = przyczyna;
            int[] proby = {0};
            PobieranieApk.Blad blad = assertThrows(PobieranieApk.Blad.class, () -> PobieranieApk.pobierz(
                "https://github.com/app.apk?token=TAJNY", cel, null, (rozmiar) -> {}, (procent) -> {},
                (adres) -> { proby[0]++; return polaczenie; }, (czas) -> {}));
            assertEquals("BLAD_SIECI", blad.kod);
            assertEquals(przyczyna instanceof javax.net.ssl.SSLException ? 1 : 2, proby[0]);
            assertFalse(blad.getMessage().contains("TAJNY")); assertEquals(null, blad.getCause());
            assertTrue(polaczenie.rozlaczone); assertFalse(cel.exists());
        }
    }

    @Test public void bledyHttpNieSaMylnieZglaszaneJakoSiecAniPonawiane() throws Exception {
        for (int kod : new int[] {400, 401, 403, 404, 406, 410, 429, 501, 206, 304}) {
            File cel = new File(pliki.getRoot(), "http.part");
            PolaczenieTestowe polaczenie = new PolaczenieTestowe(kod, null, new byte[0], -1);
            PobieranieApk.Blad blad = assertThrows(PobieranieApk.Blad.class, () -> PobieranieApk.pobierz(
                "https://github.com/app.apk", cel, null, (rozmiar) -> {}, (procent) -> {}, (adres) -> polaczenie,
                (czas) -> { throw new AssertionError("HTTP nie ponawiamy automatycznie."); }));
            assertEquals("BLAD_HTTP", blad.kod); assertEquals(kod, blad.http);
            assertTrue(polaczenie.rozlaczone); assertFalse(cel.exists());
        }
    }

    @Test public void przejsciowyHttpMaTylkoJednoPonowienie() throws Exception {
        for (int kod : new int[] {408, 500, 502, 503, 504}) {
            File cel = new File(pliki.getRoot(), "przejsciowy.part");
            int[] proby = {0}, przerwy = {0};
            PobieranieApk.Blad blad = assertThrows(PobieranieApk.Blad.class, () -> PobieranieApk.pobierz(
                "https://github.com/app.apk", cel, null, (rozmiar) -> {}, (procent) -> {},
                (adres) -> { proby[0]++; return new PolaczenieTestowe(kod, null, new byte[0], -1); },
                (czas) -> { assertEquals(500L, czas); przerwy[0]++; }));
            assertEquals("BLAD_HTTP", blad.kod); assertEquals(kod, blad.http); assertEquals(2, blad.proba);
            assertEquals(2, proby[0]); assertEquals(1, przerwy[0]); assertFalse(cel.exists());
        }
    }

    @Test public void przejsciowyHttpMozeZakonczycSieSukcesemPoJednymPonowieniu() throws Exception {
        File cel = pliki.newFile("po-http.part"); int[] proby = {0};
        byte[] dane = new byte[] {1, 2, 3};
        assertEquals(obliczSha256(dane), PobieranieApk.pobierz("https://github.com/app.apk", cel, 3L,
            (rozmiar) -> {}, (procent) -> {}, (adres) -> ++proby[0] == 1
                ? new PolaczenieTestowe(503, null, new byte[0], -1) : new PolaczenieTestowe(200, null, dane, 3), (czas) -> {}));
        assertEquals(2, proby[0]); assertArrayEquals(dane, Files.readAllBytes(cel.toPath()));
    }

    @Test public void zagniezdzonyBladCertyfikatuNieJestPonawiany() throws Exception {
        File cel = pliki.newFile("certyfikat.part");
        PolaczenieTestowe polaczenie = new PolaczenieTestowe(200, null, new byte[0], -1);
        polaczenie.bladOdpowiedzi = new IOException("TAJNY", new java.security.cert.CertificateException("TAJNY"));
        PobieranieApk.Blad blad = assertThrows(PobieranieApk.Blad.class, () -> PobieranieApk.pobierz(
            "https://github.com/app.apk", cel, null, (rozmiar) -> {}, (procent) -> {}, (adres) -> polaczenie,
            (czas) -> { throw new AssertionError("Błędu certyfikatu nie ponawiamy."); }));
        assertEquals("TLS", blad.rodzaj); assertEquals(1, blad.proba);
        assertTrue(polaczenie.rozlaczone); assertFalse(cel.exists()); assertFalse(blad.getMessage().contains("TAJNY"));
    }

    @Test public void brakMiejscaPodczasTransmisjiNiePonawiaPobierania() throws Exception {
        File cel = pliki.newFile("miejsce.part");
        PolaczenieTestowe polaczenie = new PolaczenieTestowe(200, null, new byte[] {1, 2, 3}, -1);
        Exception brakMiejsca = new Exception("Za mało wolnego miejsca na aktualizację.");
        assertEquals(brakMiejsca, assertThrows(Exception.class, () -> PobieranieApk.pobierz(
            "https://github.com/app.apk", cel, null, (rozmiar) -> { throw brakMiejsca; }, (procent) -> {}, (adres) -> polaczenie,
            (czas) -> { throw new AssertionError("Braku miejsca nie ponawiamy."); })));
        assertTrue(polaczenie.rozlaczone && polaczenie.zamknietyOdczyt); assertFalse(cel.exists());
    }

    @Test public void przekierowaniaNiePozwalajaNaHttpBrakLocationAniPetle() throws Exception {
        for (String lokalizacja : new String[] {"http://cdn.test/app.apk", null, "/petla"}) {
            File cel = new File(pliki.getRoot(), "przekierowanie.part");
            java.util.List<PolaczenieTestowe> polaczenia = new java.util.ArrayList<>();
            PobieranieApk.Blad blad = assertThrows(PobieranieApk.Blad.class, () -> PobieranieApk.pobierz(
                "https://github.com/app.apk", cel, null, (rozmiar) -> {}, (procent) -> {},
                (adres) -> { PolaczenieTestowe wynik = new PolaczenieTestowe(302, lokalizacja, new byte[0], -1); polaczenia.add(wynik); return wynik; }, (czas) -> {}));
            assertEquals("przekierowanie", blad.etap);
            assertTrue(polaczenia.size() <= 6);
            for (PolaczenieTestowe polaczenie : polaczenia) assertTrue(polaczenie.rozlaczone);
            assertFalse(cel.exists());
        }
    }

    @Test public void brakContentLengthPozwalaPobracPelnyApkIZweryfikowacSha() throws Exception {
        byte[] dane = new byte[] {7, 8, 9}; File cel = pliki.newFile("bez-dlugosci.part");
        assertEquals(obliczSha256(dane), PobieranieApk.pobierz("https://github.com/app.apk", cel, null, (rozmiar) -> {}, (procent) -> {},
            (adres) -> new PolaczenieTestowe(200, null, dane, -1), (czas) -> {}));
        assertArrayEquals(dane, Files.readAllBytes(cel.toPath()));
    }

    @Test public void niezgodnyRozmiarILimitBlokujaZapisIPonawianie() throws Exception {
        for (long rozmiar : new long[] {7, PobieranieApk.MAKSYMALNY_ROZMIAR + 1}) {
            File cel = new File(pliki.getRoot(), "rozmiar.part");
            PobieranieApk.Blad blad = assertThrows(PobieranieApk.Blad.class, () -> PobieranieApk.pobierz(
                "https://github.com/app.apk", cel, 3L, (liczba) -> {}, (procent) -> {},
                (adres) -> new PolaczenieTestowe(200, null, new byte[] {1, 2, 3}, rozmiar),
                (czas) -> { throw new AssertionError("Niezgodnego rozmiaru nie ponawiamy."); }));
            assertEquals("BLAD_ROZMIARU", blad.kod); assertFalse(cel.exists());
        }
    }

    @Test public void bladZapisuNieJestBledemSieciINiePonawiaTransferu() throws Exception {
        File cel = new File(new File(pliki.getRoot(), "nieistniejacy"), "zapis.part");
        PolaczenieTestowe polaczenie = new PolaczenieTestowe(200, null, new byte[] {1}, 1);
        PobieranieApk.Blad blad = assertThrows(PobieranieApk.Blad.class, () -> PobieranieApk.pobierz(
            "https://github.com/app.apk", cel, 1L, (rozmiar) -> {}, (procent) -> {}, (adres) -> polaczenie,
            (czas) -> { throw new AssertionError("Błędu zapisu nie ponawiamy."); }));
        assertEquals("BLAD_ZAPISU", blad.kod); assertTrue(polaczenie.rozlaczone && polaczenie.zamknietyOdczyt);
    }

    @Test public void przerwanieOczekiwaniaNaRetryUsuwaCzescPliku() throws Exception {
        File cel = pliki.newFile("przerwane.part");
        PolaczenieTestowe polaczenie = new PolaczenieTestowe(200, null, new byte[] {1}, 3);
        assertThrows(InterruptedException.class, () -> PobieranieApk.pobierz(
            "https://github.com/app.apk", cel, 3L, (rozmiar) -> {}, (procent) -> {}, (adres) -> polaczenie,
            (czas) -> { throw new InterruptedException(); }));
        assertFalse(cel.exists()); assertTrue(polaczenie.rozlaczone);
    }

    @Test public void recznePonowieniePoWyczerpaniuProbZachowujePoprzedniZweryfikowanyApk() throws Exception {
        File cel = pliki.newFile("nowy.part"), poprzedni = pliki.newFile("poprzedni.apk");
        zapisz(poprzedni, new byte[] {9});
        assertThrows(PobieranieApk.Blad.class, () -> PobieranieApk.pobierz(
            "https://github.com/app.apk", cel, 3L, (rozmiar) -> {}, (procent) -> {},
            (adres) -> new PolaczenieTestowe(200, null, new byte[] {1}, 3), (czas) -> {}));
        assertFalse(cel.exists());
        byte[] dane = new byte[] {1, 2, 3};
        assertEquals(obliczSha256(dane), PobieranieApk.pobierz("https://github.com/app.apk", cel, 3L,
            (rozmiar) -> {}, (procent) -> {}, (adres) -> new PolaczenieTestowe(200, null, dane, 3), (czas) -> {}));
        assertArrayEquals(dane, Files.readAllBytes(cel.toPath()));
        assertArrayEquals(new byte[] {9}, Files.readAllBytes(poprzedni.toPath()));
    }

    private static final class PolaczenieTestowe extends java.net.HttpURLConnection {
        final int kod;
        final String lokalizacja;
        final byte[] dane;
        final long rozmiar;
        boolean rozlaczone, zamknietyOdczyt;
        int przerwijPo = -1;
        IOException bladOdpowiedzi;
        PolaczenieTestowe(int kod, String lokalizacja, byte[] dane, long rozmiar) throws java.net.MalformedURLException {
            super(new java.net.URL("https://github.com/app.apk"));
            this.kod = kod; this.lokalizacja = lokalizacja; this.dane = dane; this.rozmiar = rozmiar;
        }
        @Override public int getResponseCode() throws IOException { if (bladOdpowiedzi != null) throw bladOdpowiedzi; return kod; }
        @Override public String getHeaderField(String nazwa) { return "Location".equals(nazwa) ? lokalizacja : null; }
        @Override public long getContentLengthLong() { return rozmiar; }
        @Override public java.io.InputStream getInputStream() {
            return new java.io.InputStream() {
                int pozycja;
                @Override public int read() throws IOException {
                    if (przerwijPo >= 0 && pozycja >= przerwijPo) throw new IOException("Zerwane https://cdn.test/?podpis=TAJNY");
                    return pozycja < dane.length ? dane[pozycja++] & 255 : -1;
                }
                @Override public void close() { zamknietyOdczyt = true; }
            };
        }
        @Override public void disconnect() { rozlaczone = true; }
        @Override public boolean usingProxy() { return false; }
        @Override public void connect() {}
    }

    private static void zapisz(File plik, byte[] bajty) throws Exception { try (FileOutputStream wyjscie = new FileOutputStream(plik)) { wyjscie.write(bajty); } }
    private static String obliczSha256(byte[] bajty) throws Exception { byte[] skrot = MessageDigest.getInstance("SHA-256").digest(bajty); StringBuilder wynik = new StringBuilder(); for (byte bajt : skrot) wynik.append(String.format("%02x", bajt)); return wynik.toString(); }
}
