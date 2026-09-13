package pl.ogarniacz.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.StatFs;
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
    private static final long MINIMALNY_ZAPAS_INSTALACJI = 32L * 1024L * 1024L;
    private static final int LIMIT_PRZEKIEROWAN = 5;
    private static final String KATALOG_AKTUALIZACJI = "aktualizacje";
    private static final String KOD_BRAK_MIEJSCA = "BRAK_MIEJSCA";
    private static final String KOD_BRAK_INSTALATORA = "BRAK_INSTALATORA";

    @PluginMethod
    public void pobierzApk(PluginCall wywolanie) {
        String adres = wywolanie.getString("adres");
        String oczekiwanySkrot = wywolanie.getString("sha256");
        String nazwaPliku = wywolanie.getString("nazwaPliku");
        Long deklarowanyRozmiar = wywolanie.getLong("rozmiar");
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
        if (deklarowanyRozmiar != null && (deklarowanyRozmiar <= 0 || deklarowanyRozmiar > MAKSYMALNY_ROZMIAR_APK)) {
            wywolanie.reject("Manifest zawiera nieprawidłowy rozmiar APK.");
            return;
        }

        execute(() -> {
            File plikTymczasowy = null;
            try {
                File katalog = new File(getContext().getCacheDir(), KATALOG_AKTUALIZACJI);
                if (!katalog.exists() && !katalog.mkdirs()) throw new Exception("Nie udało się przygotować katalogu aktualizacji.");
                sprawdzMiejscePrzedPobraniem(katalog, deklarowanyRozmiar);
                File plikDocelowy = bezpiecznyPlik(katalog, nazwaPliku);
                plikTymczasowy = bezpiecznyPlik(katalog, nazwaPliku + ".part");
                usunJesliIstnieje(plikTymczasowy);

                powiadomOStanie("pobieranie", 0);
                String obliczonySkrot = pobierz(adres, plikTymczasowy);
                powiadomOStanie("weryfikacja", 100);
                if (!zweryfikujSkrotLubUsunPlik(plikTymczasowy, obliczonySkrot, oczekiwanySkrot)) {
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
                if (blad instanceof BrakMiejscaException) {
                    wywolanie.reject(blad.getMessage(), KOD_BRAK_MIEJSCA);
                } else {
                    wywolanie.reject(bezpiecznyKomunikat(blad, "Nie udało się pobrać aktualizacji."));
                }
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

        getBridge().executeOnMainThread(() -> uruchomInstalatorNaWatkuGlownym(wywolanie, nazwaPliku));
    }

    private void uruchomInstalatorNaWatkuGlownym(PluginCall wywolanie, String nazwaPliku) {
        try {
            Activity aktywnosc = getActivity();
            if (aktywnosc == null) {
                wywolanie.reject("Nie można teraz otworzyć ekranu systemowego. Wróć do aplikacji i spróbuj ponownie.", KOD_BRAK_INSTALATORA);
                return;
            }
            File katalog = new File(getContext().getCacheDir(), KATALOG_AKTUALIZACJI);
            File plikApk = bezpiecznyPlik(katalog, nazwaPliku);
            if (!plikApk.isFile()) {
                wywolanie.reject("Zweryfikowany plik APK nie jest już dostępny. Pobierz go ponownie.");
                return;
            }
            sprawdzMiejscePrzedInstalacja(katalog, plikApk.length());

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent ustawienia = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:pl.ogarniacz.app")
                );
                if (ustawienia.resolveActivity(aktywnosc.getPackageManager()) == null) {
                    wywolanie.reject("Android nie udostępnia ustawień instalowania nieznanych aplikacji dla Ogarniacza.", KOD_BRAK_INSTALATORA);
                    return;
                }
                aktywnosc.startActivity(ustawienia);
                JSObject wynik = new JSObject();
                wynik.put("przekazanoDoSystemu", false);
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
            instalator.setClipData(ClipData.newRawUri("APK Ogarniacza", uriApk));
            instalator.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            PackageManager menedzerPakietow = aktywnosc.getPackageManager();
            ResolveInfo odbiorca = menedzerPakietow.resolveActivity(instalator, PackageManager.MATCH_DEFAULT_ONLY);
            if (odbiorca == null || odbiorca.activityInfo == null) {
                wywolanie.reject("Na urządzeniu nie ma dostępnego systemowego instalatora APK. Sprawdź ustawienia Androida i spróbuj ponownie.", KOD_BRAK_INSTALATORA);
                return;
            }
            instalator.setPackage(odbiorca.activityInfo.packageName);
            aktywnosc.grantUriPermission(odbiorca.activityInfo.packageName, uriApk, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            aktywnosc.startActivity(instalator);

            JSObject wynik = new JSObject();
            wynik.put("przekazanoDoSystemu", true);
            wynik.put("wymagaZgody", false);
            wywolanie.resolve(wynik);
        } catch (BrakMiejscaException blad) {
            wywolanie.reject(blad.getMessage(), KOD_BRAK_MIEJSCA);
        } catch (Exception blad) {
            wywolanie.reject(
                bezpiecznyKomunikat(blad, "Nie udało się uruchomić instalatora Androida. Spróbuj ponownie."),
                KOD_BRAK_INSTALATORA
            );
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
            if (rozmiar > 0) sprawdzMiejscePrzedPobraniem(plikDocelowy.getParentFile(), rozmiar);
            MessageDigest skrot = MessageDigest.getInstance("SHA-256");
            long pobrano = 0;
            int ostatniProcent = -1;
            try (InputStream wejscie = polaczenie.getInputStream(); FileOutputStream wyjscie = new FileOutputStream(plikDocelowy)) {
                byte[] bufor = new byte[64 * 1024];
                int liczba;
                while ((liczba = wejscie.read(bufor)) != -1) {
                    pobrano += liczba;
                    if (pobrano > MAKSYMALNY_ROZMIAR_APK) throw new Exception("Plik APK przekracza dozwolony rozmiar 250 MB.");
                    if (rozmiar <= 0 && pobrano % (1024L * 1024L) < liczba) {
                        sprawdzMiejscePodczasPobierania(plikDocelowy.getParentFile(), pobrano);
                    }
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

    private void sprawdzMiejscePrzedPobraniem(File katalog, Long rozmiarApk) throws BrakMiejscaException {
        long wolneBajty = new StatFs(katalog.getAbsolutePath()).getAvailableBytes();
        long wymaganeBajty = rozmiarApk == null
            ? MINIMALNY_ZAPAS_INSTALACJI
            : obliczWymaganeMiejscePrzedPobraniem(rozmiarApk);
        if (wolneBajty < wymaganeBajty) throw new BrakMiejscaException();
    }

    private void sprawdzMiejscePodczasPobierania(File katalog, long pobraneBajty) throws BrakMiejscaException {
        long wolneBajty = new StatFs(katalog.getAbsolutePath()).getAvailableBytes();
        if (wolneBajty < obliczZapasInstalacji(pobraneBajty)) throw new BrakMiejscaException();
    }

    private void sprawdzMiejscePrzedInstalacja(File katalog, long rozmiarApk) throws BrakMiejscaException {
        long wolneBajty = new StatFs(katalog.getAbsolutePath()).getAvailableBytes();
        if (wolneBajty < obliczZapasInstalacji(rozmiarApk)) throw new BrakMiejscaException();
    }

    static long obliczZapasInstalacji(long rozmiarApk) {
        return Math.max(MINIMALNY_ZAPAS_INSTALACJI, rozmiarApk);
    }

    static long obliczWymaganeMiejscePrzedPobraniem(long rozmiarApk) {
        return rozmiarApk + obliczZapasInstalacji(rozmiarApk);
    }

    static boolean zweryfikujSkrotLubUsunPlik(File plik, String obliczonySkrot, String oczekiwanySkrot) throws Exception {
        if (obliczonySkrot.equalsIgnoreCase(oczekiwanySkrot)) return true;
        if (plik.exists() && !plik.delete()) throw new Exception("Nie udało się usunąć błędnego pliku aktualizacji.");
        return false;
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

    private static final class BrakMiejscaException extends Exception {
        BrakMiejscaException() {
            super("Za mało wolnego miejsca na aktualizację. Zwolnij miejsce w pamięci urządzenia i spróbuj ponownie.");
        }
    }
}
