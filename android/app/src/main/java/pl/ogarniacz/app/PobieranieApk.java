package pl.ogarniacz.app;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.security.MessageDigest;
import java.util.Locale;
import javax.net.ssl.SSLException;

final class PobieranieApk {
    static final long MAKSYMALNY_ROZMIAR = 250L * 1024L * 1024L;
    private static final int LIMIT_PRZEKIEROWAN = 5;
    private static final int LIMIT_PROB = 3;

    interface OtwieraniePolaczenia { HttpURLConnection otworz(URL adres) throws IOException; }
    interface KontrolaMiejsca { void sprawdz(long rozmiar) throws Exception; }
    interface Postep { void powiadom(int procent); }
    interface Przerwa { void poczekaj(long milisekundy) throws InterruptedException; }

    static final class Blad extends Exception {
        final String kod, etap, rodzaj;
        final int http, proba;
        Blad(String kod, String komunikat, String etap, String rodzaj, int http, int proba) {
            // Bez przyczyny/URL: wyjątki sieciowe mogą zawierać podpisany adres CDN.
            super(komunikat);
            this.kod = kod; this.etap = etap; this.rodzaj = rodzaj; this.http = http; this.proba = proba;
        }
    }

    static String pobierz(String adres, File plik, Long rozmiarManifestu, KontrolaMiejsca miejsce, Postep postep) throws Exception {
        return pobierz(adres, plik, rozmiarManifestu, miejsce, postep,
            (adresZadania) -> (HttpURLConnection) adresZadania.openConnection(), Thread::sleep);
    }

    static String pobierz(String adres, File plik, Long rozmiarManifestu, KontrolaMiejsca miejsce, Postep postep,
                         OtwieraniePolaczenia otwieranie, Przerwa przerwa) throws Exception {
        boolean sukces = false;
        try {
            for (int proba = 1; proba <= LIMIT_PROB; proba++) {
                usunCzesc(plik, proba);
                postep.powiadom(0);
                try {
                    String skrot = pobierzProbe(adres, plik, rozmiarManifestu, miejsce, postep, otwieranie, proba);
                    sukces = true;
                    return skrot;
                } catch (Blad blad) {
                    if (!"BLAD_SIECI".equals(blad.kod) || "TLS".equals(blad.rodzaj) || proba == LIMIT_PROB) throw blad;
                    usunCzesc(plik, proba);
                    // Zaczynamy od pierwotnego URL i bajtu zero, bez doklejania do starego APK.
                    przerwa.poczekaj(500L * proba);
                }
            }
            throw new IllegalStateException("Wyczerpano próby pobrania APK.");
        } finally {
            if (!sukces) usunCzesc(plik, LIMIT_PROB);
        }
    }

    private static String pobierzProbe(String poczatkowy, File plik, Long rozmiarManifestu, KontrolaMiejsca miejsce,
                                      Postep postep, OtwieraniePolaczenia otwieranie, int proba) throws Exception {
        URL adres;
        try { adres = new URL(poczatkowy); }
        catch (IOException blad) { throw blad("BLAD_POBIERANIA", "Nieprawidłowy adres APK.", "adres", "ADRES", 0, proba); }
        for (int numer = 0; numer <= LIMIT_PRZEKIEROWAN; numer++) {
            if (!"https".equalsIgnoreCase(adres.getProtocol()) || adres.getHost().isEmpty() || adres.getUserInfo() != null) {
                throw blad("BLAD_POBIERANIA", "Adres APK i przekierowania muszą używać HTTPS bez danych logowania.", "przekierowanie", "HTTPS", 0, proba);
            }
            HttpURLConnection polaczenie = null;
            String etap = "polaczenie";
            try {
                polaczenie = otwieranie.otworz(adres);
                polaczenie.setInstanceFollowRedirects(false);
                polaczenie.setConnectTimeout(15000);
                polaczenie.setReadTimeout(30000);
                polaczenie.setUseCaches(false);
                polaczenie.setRequestProperty("Cache-Control", "no-cache");
                // Publiczny URL GitHub Release najpierw negocjuje przekierowanie, nie MIME APK.
                polaczenie.setRequestProperty("Accept", "*/*");
                polaczenie.setRequestProperty("Accept-Encoding", "identity");
                polaczenie.setRequestProperty("User-Agent", "Ogarniacz-Android-Updater");
                int kod = polaczenie.getResponseCode();
                if (kod == 301 || kod == 302 || kod == 303 || kod == 307 || kod == 308) {
                    String cel = polaczenie.getHeaderField("Location");
                    if (cel == null || cel.trim().isEmpty()) throw blad("BLAD_HTTP", "Przekierowanie APK nie zawiera adresu docelowego.", "przekierowanie", "BRAK_LOCATION", kod, proba);
                    if (numer == LIMIT_PRZEKIEROWAN) throw blad("BLAD_HTTP", "Przekroczono limit przekierowań APK.", "przekierowanie", "LIMIT", kod, proba);
                    try { adres = new URL(adres, cel); }
                    catch (IOException blad) { throw blad("BLAD_HTTP", "Nieprawidłowe przekierowanie APK.", "przekierowanie", "ADRES", kod, proba); }
                    continue;
                }
                if (kod != 200) throw blad("BLAD_HTTP", "Serwer APK zwrócił HTTP " + kod + ".", "odpowiedz", "HTTP", kod, proba);
                long rozmiar = polaczenie.getContentLengthLong();
                if (rozmiar > MAKSYMALNY_ROZMIAR) throw blad("BLAD_ROZMIARU", "APK przekracza limit 250 MB.", "odpowiedz", "LIMIT", kod, proba);
                if (rozmiarManifestu != null && rozmiar >= 0 && rozmiar != rozmiarManifestu) {
                    throw blad("BLAD_ROZMIARU", "Rozmiar APK z serwera nie zgadza się z manifestem.", "odpowiedz", "ROZMIAR", kod, proba);
                }
                if (rozmiar > 0) miejsce.sprawdz(rozmiar);
                etap = "odczyt";
                try (InputStream wejscie = polaczenie.getInputStream()) {
                    return zapisz(wejscie, plik, rozmiarManifestu != null ? rozmiarManifestu : rozmiar, miejsce, postep, proba);
                }
            } catch (IOException blad) {
                String rodzaj = blad instanceof SocketTimeoutException ? "TIMEOUT" : blad instanceof UnknownHostException ? "DNS" : blad instanceof SSLException ? "TLS" : "POLACZENIE";
                throw blad("BLAD_SIECI", "Przerwano pobieranie APK (" + rodzaj + ", próba " + proba + "/" + LIMIT_PROB + "). Sprawdź połączenie i ponów pobieranie.", etap, rodzaj, 0, proba);
            } finally {
                if (polaczenie != null) polaczenie.disconnect();
            }
        }
        throw new IllegalStateException("Przekroczono limit przekierowań APK.");
    }

    private static String zapisz(InputStream wejscie, File plik, long rozmiar, KontrolaMiejsca miejsce, Postep postep, int proba) throws Exception {
        MessageDigest skrot = MessageDigest.getInstance("SHA-256");
        FileOutputStream wyjscie;
        try { wyjscie = new FileOutputStream(plik); }
        catch (IOException blad) { throw bladZapisu(proba); }
        try {
            long pobrano = 0;
            int ostatniProcent = -1, liczba;
            byte[] bufor = new byte[64 * 1024];
            while ((liczba = wejscie.read(bufor)) != -1) {
                pobrano += liczba;
                if (pobrano > MAKSYMALNY_ROZMIAR || (rozmiar >= 0 && pobrano > rozmiar)) {
                    throw blad("BLAD_ROZMIARU", "Pobrany APK przekracza oczekiwany rozmiar.", "odczyt", "ROZMIAR", 200, proba);
                }
                if (rozmiar <= 0 && pobrano % (1024L * 1024L) < liczba) miejsce.sprawdz(pobrano);
                try { wyjscie.write(bufor, 0, liczba); }
                catch (IOException blad) { throw bladZapisu(proba); }
                skrot.update(bufor, 0, liczba);
                if (rozmiar > 0) {
                    int procent = (int) Math.min(99, pobrano * 100 / rozmiar);
                    if (procent != ostatniProcent && procent % 5 == 0) { ostatniProcent = procent; postep.powiadom(procent); }
                }
            }
            if (rozmiar >= 0 && pobrano != rozmiar) throw new IOException("Niepełny transfer APK.");
            try { wyjscie.getFD().sync(); }
            catch (IOException blad) { throw bladZapisu(proba); }
            miejsce.sprawdz(pobrano);
            StringBuilder wynik = new StringBuilder();
            for (byte bajt : skrot.digest()) wynik.append(String.format(Locale.ROOT, "%02x", bajt));
            return wynik.toString();
        } finally {
            try { wyjscie.close(); }
            catch (IOException blad) { throw bladZapisu(proba); }
        }
    }

    private static void usunCzesc(File plik, int proba) throws Blad {
        if (plik.exists() && !plik.delete()) throw bladZapisu(proba);
    }

    private static Blad bladZapisu(int proba) {
        return blad("BLAD_ZAPISU", "Nie udało się zapisać lub usunąć części APK w prywatnej pamięci aplikacji.", "zapis", "PLIK", 0, proba);
    }

    private static Blad blad(String kod, String komunikat, String etap, String rodzaj, int http, int proba) {
        return new Blad(kod, komunikat, etap, rodzaj, http, proba);
    }
}
