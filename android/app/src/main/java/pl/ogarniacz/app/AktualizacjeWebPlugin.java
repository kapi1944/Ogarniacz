package pl.ogarniacz.app;

import android.util.Base64;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@CapacitorPlugin(name = "AktualizacjeWeb")
public class AktualizacjeWebPlugin extends Plugin {
    private static final long MAKSYMALNY_ROZMIAR_ZIP = 50L * 1024L * 1024L;
    private static final long MAKSYMALNY_ROZMIAR_ROZPAKOWANY = 150L * 1024L * 1024L;
    private static final int MAKSYMALNA_LICZBA_PLIKOW = 2000;
    private static final int LIMIT_PRZEKIEROWAN = 5;

    @PluginMethod
    public void pobierzStan(PluginCall wywolanie) {
        wywolanie.resolve(MagazynAktualizacjiWeb.pobierzStan(getContext()));
    }

    @PluginMethod
    public void potwierdzGotowoscBundle(PluginCall wywolanie) {
        try {
            MagazynAktualizacjiWeb.potwierdzGotowosc(getContext());
            wywolanie.resolve();
        } catch (Exception blad) {
            wywolanie.reject(komunikat(blad, "Nie udało się potwierdzić gotowości bundle."));
        }
    }

    @PluginMethod
    public void przywrocPoprzednia(PluginCall wywolanie) {
        getBridge().executeOnMainThread(() -> {
            try {
                String sciezka = MagazynAktualizacjiWeb.przywrocPoprzedni(getContext());
                wywolanie.resolve();
                getBridge().setServerBasePath(sciezka);
            } catch (Exception blad) {
                wywolanie.reject(komunikat(blad, "Nie udało się przywrócić poprzedniej wersji."));
            }
        });
    }

    @PluginMethod
    public void przywrocWbudowana(PluginCall wywolanie) {
        getBridge().executeOnMainThread(() -> {
            try {
                MagazynAktualizacjiWeb.przywrocWbudowany(getContext());
                wywolanie.resolve();
                getBridge().setServerAssetPath("public");
            } catch (Exception blad) {
                wywolanie.reject(komunikat(blad, "Nie udało się przywrócić wersji wbudowanej."));
            }
        });
    }

    @PluginMethod
    public void pobierzIAktywuj(PluginCall wywolanie) {
        DaneManifestu dane;
        try {
            dane = DaneManifestu.zWywolania(wywolanie);
            sprawdzKompatybilnosc(dane.minimalnyKodApk);
            boolean ponownaProba = wywolanie.getBoolean("ponownaProba", false);
            if (MagazynAktualizacjiWeb.czyOdrzucony(getContext(), dane.wersja, dane.commitSha) && !ponownaProba) {
                throw new Exception("Ta wersja została wcześniej wycofana na tym urządzeniu.");
            }
            zweryfikujPodpis(dane);
        } catch (Exception blad) {
            wywolanie.reject(komunikat(blad, "Manifest Web OTA jest nieprawidłowy."));
            return;
        }
        execute(() -> pobierzRozpakujIAktywuj(wywolanie, dane));
    }

    private void sprawdzKompatybilnosc(int minimalnyKodApk) throws Exception {
        long kodApk = PackageInfoCompat.getLongVersionCode(
            getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0)
        );
        if (kodApk < minimalnyKodApk) throw new Exception("Ta aktualizacja wymaga nowszej wersji aplikacji Android");
    }

    private void zweryfikujPodpis(DaneManifestu dane) throws Exception {
        if (BuildConfig.WEB_OTA_PUBLIC_KEY.isBlank()) throw new Exception("Publiczny klucz Web OTA nie jest skonfigurowany w tym APK.");
        PublicKey klucz = KeyFactory.getInstance("RSA").generatePublic(
            new X509EncodedKeySpec(Base64.decode(BuildConfig.WEB_OTA_PUBLIC_KEY, Base64.DEFAULT))
        );
        Signature podpis = Signature.getInstance("SHA256withRSA");
        podpis.initVerify(klucz);
        podpis.update(daneDoPodpisu(dane).getBytes(StandardCharsets.UTF_8));
        if (!podpis.verify(Base64.decode(dane.podpis, Base64.DEFAULT))) {
            throw new Exception("Podpis kryptograficzny Web bundle jest nieprawidłowy.");
        }
    }

    static String daneDoPodpisu(DaneManifestu dane) {
        return String.join("\n", "ogarniacz-web-ota-v1", dane.wersja, dane.commitSha.toLowerCase(Locale.ROOT),
            dane.adres, dane.sha256.toLowerCase(Locale.ROOT), String.valueOf(dane.minimalnyKodApk), dane.opublikowano);
    }

    private void pobierzRozpakujIAktywuj(PluginCall wywolanie, DaneManifestu dane) {
        File plikTymczasowy = null;
        File katalogTymczasowy = null;
        try {
            File katalogGlowny = new File(getContext().getFilesDir(), "web-ota");
            File katalogPobierania = new File(katalogGlowny, "pobieranie");
            File katalogBundle = new File(katalogGlowny, "bundle");
            wymagajKatalogu(katalogPobierania);
            wymagajKatalogu(katalogBundle);
            String identyfikator = dane.wersja + "-" + dane.commitSha.substring(0, 12) + "-" + System.currentTimeMillis();
            plikTymczasowy = new File(katalogPobierania, identyfikator + ".zip.part");
            katalogTymczasowy = new File(katalogBundle, "." + identyfikator + ".part");
            File katalogDocelowy = new File(katalogBundle, identyfikator);

            powiadom("pobieranie", 0);
            String obliczonySkrot = pobierzZip(dane.adres, plikTymczasowy);
            powiadom("weryfikacja", 100);
            if (!obliczonySkrot.equalsIgnoreCase(dane.sha256)) {
                throw new Exception("SHA-256 pobranego Web bundle nie zgadza się z manifestem.");
            }
            powiadom("rozpakowywanie", 0);
            rozpakujBezpiecznie(plikTymczasowy, katalogTymczasowy);
            if (!new File(katalogTymczasowy, "index.html").isFile()) {
                throw new Exception("Web bundle nie zawiera index.html w katalogu głównym.");
            }
            if (!katalogTymczasowy.renameTo(katalogDocelowy)) {
                throw new Exception("Nie udało się atomowo zapisać rozpakowanego Web bundle.");
            }
            katalogTymczasowy = null;
            usunRekurencyjnie(plikTymczasowy);
            plikTymczasowy = null;

            MagazynAktualizacjiWeb.MetadaneBundle metadane = new MagazynAktualizacjiWeb.MetadaneBundle(
                dane.wersja, dane.commitSha, Instant.now().toString(), katalogDocelowy.getAbsolutePath(), dane.minimalnyKodApk
            );
            MagazynAktualizacjiWeb.rozpocznijOczekiwanie(getContext(), metadane);
            getBridge().executeOnMainThread(() -> {
                wywolanie.resolve();
                getBridge().setServerBasePath(katalogDocelowy.getAbsolutePath());
            });
        } catch (Exception blad) {
            usunBezBledu(plikTymczasowy);
            usunBezBledu(katalogTymczasowy);
            wywolanie.reject(komunikat(blad, "Nie udało się zainstalować Web bundle."));
        }
    }

    private String pobierzZip(String adresPoczatkowy, File plikDocelowy) throws Exception {
        URL adres = URI.create(adresPoczatkowy).toURL();
        for (int numer = 0; numer <= LIMIT_PRZEKIEROWAN; numer++) {
            HttpURLConnection polaczenie = (HttpURLConnection) adres.openConnection();
            polaczenie.setInstanceFollowRedirects(false);
            polaczenie.setConnectTimeout(15000);
            polaczenie.setReadTimeout(30000);
            polaczenie.setRequestProperty("Accept", "application/zip, application/octet-stream");
            polaczenie.setRequestProperty("User-Agent", "Ogarniacz-Web-OTA");
            int kod = polaczenie.getResponseCode();
            if (kod >= 300 && kod < 400) {
                String lokalizacja = polaczenie.getHeaderField("Location");
                polaczenie.disconnect();
                if (lokalizacja == null) throw new Exception("Serwer zwrócił przekierowanie bez adresu docelowego.");
                adres = new URL(adres, lokalizacja);
                if (!"https".equalsIgnoreCase(adres.getProtocol())) throw new Exception("Przekierowanie Web bundle nie używa HTTPS.");
                continue;
            }
            if (kod < 200 || kod >= 300) {
                polaczenie.disconnect();
                throw new Exception("Serwer Web bundle zwrócił HTTP " + kod + ".");
            }
            long rozmiar = polaczenie.getContentLengthLong();
            if (rozmiar > MAKSYMALNY_ROZMIAR_ZIP) {
                polaczenie.disconnect();
                throw new Exception("Web bundle przekracza limit 50 MB.");
            }
            MessageDigest skrot = MessageDigest.getInstance("SHA-256");
            long pobrano = 0;
            try (InputStream wejscie = polaczenie.getInputStream(); FileOutputStream wyjscie = new FileOutputStream(plikDocelowy)) {
                byte[] bufor = new byte[64 * 1024];
                int liczba;
                while ((liczba = wejscie.read(bufor)) != -1) {
                    pobrano += liczba;
                    if (pobrano > MAKSYMALNY_ROZMIAR_ZIP) throw new Exception("Web bundle przekracza limit 50 MB.");
                    wyjscie.write(bufor, 0, liczba);
                    skrot.update(bufor, 0, liczba);
                    if (rozmiar > 0) powiadom("pobieranie", (int) Math.min(99, pobrano * 100 / rozmiar));
                }
                wyjscie.getFD().sync();
            } finally {
                polaczenie.disconnect();
            }
            return zapisSzesnastkowy(skrot.digest());
        }
        throw new Exception("Serwer Web bundle przekroczył limit przekierowań.");
    }

    static void rozpakujBezpiecznie(File plikZip, File katalogDocelowy) throws Exception {
        if (katalogDocelowy.exists()) throw new Exception("Katalog tymczasowy Web bundle już istnieje.");
        if (!katalogDocelowy.mkdirs()) throw new Exception("Nie udało się przygotować katalogu Web bundle.");
        String prefiks = katalogDocelowy.getCanonicalPath() + File.separator;
        long rozpakowano = 0;
        int liczbaPlikow = 0;
        try (ZipInputStream zip = new ZipInputStream(new FileInputStream(plikZip))) {
            ZipEntry wpis;
            byte[] bufor = new byte[64 * 1024];
            while ((wpis = zip.getNextEntry()) != null) {
                liczbaPlikow++;
                if (liczbaPlikow > MAKSYMALNA_LICZBA_PLIKOW) throw new Exception("Web bundle zawiera zbyt wiele plików.");
                File cel = new File(katalogDocelowy, wpis.getName());
                String sciezkaKanoniczna = cel.getCanonicalPath();
                if (!sciezkaKanoniczna.startsWith(prefiks)) throw new Exception("Web bundle zawiera niedozwoloną ścieżkę ZIP.");
                if (wpis.isDirectory()) {
                    wymagajKatalogu(cel);
                    continue;
                }
                wymagajKatalogu(cel.getParentFile());
                try (FileOutputStream wyjscie = new FileOutputStream(cel)) {
                    int liczba;
                    while ((liczba = zip.read(bufor)) != -1) {
                        rozpakowano += liczba;
                        if (rozpakowano > MAKSYMALNY_ROZMIAR_ROZPAKOWANY) {
                            throw new Exception("Rozpakowany Web bundle przekracza limit 150 MB.");
                        }
                        wyjscie.write(bufor, 0, liczba);
                    }
                }
                zip.closeEntry();
            }
        } catch (Exception blad) {
            usunRekurencyjnie(katalogDocelowy);
            throw blad;
        }
    }

    private static void wymagajKatalogu(File katalog) throws Exception {
        if (katalog.isDirectory()) return;
        if (!katalog.mkdirs()) throw new Exception("Nie udało się utworzyć prywatnego katalogu Web OTA.");
    }

    private static void usunRekurencyjnie(File plik) throws Exception {
        if (plik == null || !plik.exists()) return;
        if (plik.isDirectory()) {
            File[] dzieci = plik.listFiles();
            if (dzieci != null) for (File dziecko : dzieci) usunRekurencyjnie(dziecko);
        }
        if (!plik.delete()) throw new Exception("Nie udało się usunąć pliku tymczasowego Web OTA.");
    }

    private static void usunBezBledu(File plik) {
        try {
            usunRekurencyjnie(plik);
        } catch (Exception ignored) {
            // Niedokończony plik pozostaje wyłącznie w prywatnym katalogu aplikacji.
        }
    }

    private void powiadom(String stan, int procent) {
        JSObject dane = new JSObject();
        dane.put("stan", stan);
        dane.put("procent", procent);
        notifyListeners("stanAktualizacjiWeb", dane);
    }

    private static String zapisSzesnastkowy(byte[] bajty) {
        StringBuilder wynik = new StringBuilder(bajty.length * 2);
        for (byte bajt : bajty) wynik.append(String.format(Locale.ROOT, "%02x", bajt));
        return wynik.toString();
    }

    private static String komunikat(Exception blad, String domyslny) {
        String tresc = blad.getMessage();
        return tresc == null || tresc.isBlank() ? domyslny : tresc;
    }

    static final class DaneManifestu {
        final String wersja;
        final String commitSha;
        final String adres;
        final String sha256;
        final String podpis;
        final int minimalnyKodApk;
        final String opublikowano;

        DaneManifestu(String wersja, String commitSha, String adres, String sha256, String podpis,
                      int minimalnyKodApk, String opublikowano) {
            this.wersja = wersja;
            this.commitSha = commitSha;
            this.adres = adres;
            this.sha256 = sha256;
            this.podpis = podpis;
            this.minimalnyKodApk = minimalnyKodApk;
            this.opublikowano = opublikowano;
        }

        static DaneManifestu zWywolania(PluginCall wywolanie) throws Exception {
            String wersja = wywolanie.getString("bundleVersion");
            String commitSha = wywolanie.getString("commitSha");
            String adres = wywolanie.getString("url");
            String sha256 = wywolanie.getString("sha256");
            String podpis = wywolanie.getString("signature");
            Integer minimalnyKodApk = wywolanie.getInt("minNativeVersionCode");
            String opublikowano = wywolanie.getString("publishedAt");
            if (wersja == null || !wersja.matches("^[A-Za-z0-9._-]{1,64}$")) throw new Exception("Nieprawidłowy bundleVersion.");
            if (commitSha == null || !commitSha.matches("(?i)^[a-f0-9]{40}$")) throw new Exception("Nieprawidłowy commitSha.");
            if (adres == null || !"https".equalsIgnoreCase(URI.create(adres).getScheme())) throw new Exception("Adres Web bundle musi używać HTTPS.");
            if (sha256 == null || !sha256.matches("(?i)^[a-f0-9]{64}$")) throw new Exception("Nieprawidłowy SHA-256 Web bundle.");
            if (podpis == null || podpis.length() > 4096) throw new Exception("Nieprawidłowy podpis Web bundle.");
            if (minimalnyKodApk == null || minimalnyKodApk <= 0) throw new Exception("Nieprawidłowy minNativeVersionCode.");
            if (opublikowano == null) throw new Exception("Brak publishedAt.");
            Instant.parse(opublikowano);
            Base64.decode(podpis, Base64.DEFAULT);
            return new DaneManifestu(wersja, commitSha.toLowerCase(Locale.ROOT), adres,
                sha256.toLowerCase(Locale.ROOT), podpis, minimalnyKodApk, opublikowano);
        }
    }
}
