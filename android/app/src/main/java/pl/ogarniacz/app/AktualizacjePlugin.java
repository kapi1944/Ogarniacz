package pl.ogarniacz.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

@CapacitorPlugin(name = "Aktualizacje")
public class AktualizacjePlugin extends Plugin {
    private static final long MAKSYMALNY_ROZMIAR_APK = 250L * 1024L * 1024L;
    private static final int LIMIT_PRZEKIEROWAN = 5;
    private static final String KATALOG_AKTUALIZACJI = "aktualizacje";

    @PluginMethod
    public void pobierzApk(PluginCall wywolanie) {
        String adres = wywolanie.getString("adres");
        String oczekiwanySkrot = wywolanie.getString("sha256");
        String nazwaPliku = wywolanie.getString("nazwaPliku");
        if (!poprawnyAdresHttps(adres)) {
            wywolanie.reject("Adres APK musi używać HTTPS.");
            return;
        }
        if (oczekiwanySkrot == null || !oczekiwanySkrot.matches("(?i)^[a-f0-9]{64}$")) {
            wywolanie.reject("Manifest nie zawiera prawidłowego SHA-256.");
            return;
        }
        if (nazwaPliku == null || !nazwaPliku.matches("^[A-Za-z0-9._-]+\\.apk$")) {
            wywolanie.reject("Nieprawidłowa nazwa pliku APK.");
            return;
        }

        execute(() -> {
            File plikTymczasowy = null;
            try {
                File katalog = new File(getContext().getCacheDir(), KATALOG_AKTUALIZACJI);
                if (!katalog.exists() && !katalog.mkdirs()) throw new Exception("Nie udało się przygotować katalogu aktualizacji.");
                File plikDocelowy = bezpiecznyPlik(katalog, nazwaPliku);
                plikTymczasowy = bezpiecznyPlik(katalog, nazwaPliku + ".part");
                usunJesliIstnieje(plikTymczasowy);

                powiadomOStanie("pobieranie", 0);
                String obliczonySkrot = pobierz(adres, plikTymczasowy);
                powiadomOStanie("weryfikacja", 100);
                if (!obliczonySkrot.equalsIgnoreCase(oczekiwanySkrot)) {
                    usunJesliIstnieje(plikTymczasowy);
                    wywolanie.reject("SHA-256 pobranego APK nie zgadza się z manifestem. Plik został usunięty.");
                    return;
                }
                usunJesliIstnieje(plikDocelowy);
                if (!plikTymczasowy.renameTo(plikDocelowy)) throw new Exception("Nie udało się zapisać zweryfikowanego APK.");

                JSObject wynik = new JSObject();
                wynik.put("nazwaPliku", nazwaPliku);
                wynik.put("sha256", obliczonySkrot);
                wywolanie.resolve(wynik);
            } catch (Exception blad) {
                if (plikTymczasowy != null) {
                    try {
                        usunJesliIstnieje(plikTymczasowy);
                    } catch (Exception ignored) {
                        // Plik tymczasowy zostanie później usunięty razem z pamięcią podręczną aplikacji.
                    }
                }
                wywolanie.reject(bezpiecznyKomunikat(blad, "Nie udało się pobrać aktualizacji."));
            }
        });
    }

    @PluginMethod
    public void uruchomInstalator(PluginCall wywolanie) {
        String nazwaPliku = wywolanie.getString("nazwaPliku");
        if (nazwaPliku == null || !nazwaPliku.matches("^[A-Za-z0-9._-]+\\.apk$")) {
            wywolanie.reject("Nieprawidłowa nazwa pliku APK.");
            return;
        }

        try {
            File katalog = new File(getContext().getCacheDir(), KATALOG_AKTUALIZACJI);
            File plikApk = bezpiecznyPlik(katalog, nazwaPliku);
            if (!plikApk.isFile()) {
                wywolanie.reject("Zweryfikowany plik APK nie jest już dostępny. Pobierz go ponownie.");
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent ustawienia = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                getActivity().startActivity(ustawienia);
                JSObject wynik = new JSObject();
                wynik.put("uruchomiono", false);
                wynik.put("wymagaZgody", true);
                wywolanie.resolve(wynik);
                return;
            }

            Uri uriApk = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                plikApk
            );
            Intent instalator = new Intent(Intent.ACTION_VIEW);
            instalator.setDataAndType(uriApk, "application/vnd.android.package-archive");
            instalator.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(instalator);

            JSObject wynik = new JSObject();
            wynik.put("uruchomiono", true);
            wynik.put("wymagaZgody", false);
            wywolanie.resolve(wynik);
        } catch (Exception blad) {
            wywolanie.reject(bezpiecznyKomunikat(blad, "Nie udało się uruchomić instalatora Androida."));
        }
    }

    private String pobierz(String adresPoczatkowy, File plikDocelowy) throws Exception {
        URL adres = URI.create(adresPoczatkowy).toURL();
        HttpURLConnection polaczenie = null;
        for (int numer = 0; numer <= LIMIT_PRZEKIEROWAN; numer++) {
            polaczenie = (HttpURLConnection) adres.openConnection();
            polaczenie.setInstanceFollowRedirects(false);
            polaczenie.setConnectTimeout(15000);
            polaczenie.setReadTimeout(30000);
            polaczenie.setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream");
            polaczenie.setRequestProperty("User-Agent", "Ogarniacz-Android-Updater");
            int kod = polaczenie.getResponseCode();
            if (kod >= 300 && kod < 400) {
                String lokalizacja = polaczenie.getHeaderField("Location");
                polaczenie.disconnect();
                if (lokalizacja == null) throw new Exception("Serwer zwrócił przekierowanie bez adresu docelowego.");
                adres = new URL(adres, lokalizacja);
                if (!"https".equalsIgnoreCase(adres.getProtocol())) throw new Exception("Przekierowanie APK nie używa HTTPS.");
                continue;
            }
            if (kod < 200 || kod >= 300) {
                polaczenie.disconnect();
                throw new Exception("Serwer APK zwrócił HTTP " + kod + ".");
            }

            long rozmiar = polaczenie.getContentLengthLong();
            if (rozmiar > MAKSYMALNY_ROZMIAR_APK) {
                polaczenie.disconnect();
                throw new Exception("Plik APK przekracza dozwolony rozmiar 250 MB.");
            }
            MessageDigest skrot = MessageDigest.getInstance("SHA-256");
            long pobrano = 0;
            int ostatniProcent = -1;
            try (InputStream wejscie = polaczenie.getInputStream(); FileOutputStream wyjscie = new FileOutputStream(plikDocelowy)) {
                byte[] bufor = new byte[64 * 1024];
                int liczba;
                while ((liczba = wejscie.read(bufor)) != -1) {
                    pobrano += liczba;
                    if (pobrano > MAKSYMALNY_ROZMIAR_APK) throw new Exception("Plik APK przekracza dozwolony rozmiar 250 MB.");
                    wyjscie.write(bufor, 0, liczba);
                    skrot.update(bufor, 0, liczba);
                    if (rozmiar > 0) {
                        int procent = (int) Math.min(99, pobrano * 100 / rozmiar);
                        if (procent != ostatniProcent && procent % 5 == 0) {
                            ostatniProcent = procent;
                            powiadomOStanie("pobieranie", procent);
                        }
                    }
                }
                wyjscie.getFD().sync();
            } finally {
                polaczenie.disconnect();
            }
            return zapisSzesnastkowy(skrot.digest());
        }
        throw new Exception("Serwer APK przekroczył limit przekierowań.");
    }

    private boolean poprawnyAdresHttps(String adres) {
        try {
            return adres != null && "https".equalsIgnoreCase(URI.create(adres).getScheme());
        } catch (Exception blad) {
            return false;
        }
    }

    private File bezpiecznyPlik(File katalog, String nazwa) throws Exception {
        File plik = new File(katalog, nazwa);
        String katalogKanoniczny = katalog.getCanonicalPath() + File.separator;
        if (!plik.getCanonicalPath().startsWith(katalogKanoniczny)) throw new Exception("Nieprawidłowa ścieżka pliku aktualizacji.");
        return plik;
    }

    private void usunJesliIstnieje(File plik) throws Exception {
        if (plik.exists() && !plik.delete()) throw new Exception("Nie udało się usunąć poprzedniego pliku aktualizacji.");
    }

    private String zapisSzesnastkowy(byte[] bajty) {
        StringBuilder wynik = new StringBuilder(bajty.length * 2);
        for (byte bajt : bajty) wynik.append(String.format(Locale.ROOT, "%02x", bajt));
        return wynik.toString();
    }

    private void powiadomOStanie(String stan, int procent) {
        JSObject dane = new JSObject();
        dane.put("stan", stan);
        dane.put("procent", procent);
        notifyListeners("stanAktualizacji", dane);
    }

    private String bezpiecznyKomunikat(Exception blad, String domyslny) {
        String komunikat = blad.getMessage();
        return komunikat == null || komunikat.isBlank() ? domyslny : komunikat;
    }
}
