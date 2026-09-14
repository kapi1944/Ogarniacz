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
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.Locale;

@CapacitorPlugin(name = "Aktualizacje")
public class AktualizacjePlugin extends Plugin {
    private static final long MAKSYMALNY_ROZMIAR_APK = 250L * 1024L * 1024L;
    private static final long MINIMALNE_WYMAGANE_MIEJSCE = 2L * 1024L * 1024L * 1024L;
    private static final long MNOZNIK_MIEJSCA_DLA_APK = 4L;
    private static final long RETENCJA_NIEUDANYCH_ARTEFAKTOW_MS = 24L * 60L * 60L * 1000L;
    private static final int LIMIT_PRZEKIEROWAN = 5;
    private static final String KATALOG_AKTUALIZACJI = "aktualizacje";
    private static final String KOD_BRAK_MIEJSCA = "BRAK_MIEJSCA";
    private static final String KOD_BRAK_INSTALATORA = "BRAK_INSTALATORA";
    private static final String KOD_BLAD_POBIERANIA = "BLAD_POBIERANIA";
    private static final String KOD_BLEDNY_SHA = "BLEDNY_SHA";
    private static final String KOD_BLAD_FINALIZACJI = "BLAD_FINALIZACJI";

    @Override public void load() {
        super.load();
        try { usunJesliIstnieje(new File(new File(getContext().getCacheDir(), KATALOG_AKTUALIZACJI), "Ogarniacz-" + BuildConfig.VERSION_NAME + "-release.apk")); }
        catch (Exception ignored) { /* Sprzątanie cache nie blokuje uruchomienia aplikacji. */ }
    }

    @PluginMethod public void pobierzApk(PluginCall wywolanie) {
        String adres = wywolanie.getString("adres"), oczekiwanySkrot = wywolanie.getString("sha256"), nazwaPliku = wywolanie.getString("nazwaPliku");
        Long deklarowanyRozmiar = wywolanie.getLong("rozmiar");
        if (!poprawnyAdresHttps(adres)) { wywolanie.reject("Adres APK musi używać HTTPS.", KOD_BLAD_POBIERANIA); return; }
        if (oczekiwanySkrot == null || !oczekiwanySkrot.matches("(?i)^[a-f0-9]{64}$")) { wywolanie.reject("Manifest nie zawiera prawidłowego SHA-256.", KOD_BLEDNY_SHA); return; }
        if (nazwaPliku == null || !nazwaPliku.matches("^[A-Za-z0-9._-]+\\.apk$")) { wywolanie.reject("Nieprawidłowa nazwa pliku APK.", KOD_BLAD_POBIERANIA); return; }
        if (deklarowanyRozmiar != null && (deklarowanyRozmiar <= 0 || deklarowanyRozmiar > MAKSYMALNY_ROZMIAR_APK)) { wywolanie.reject("Manifest zawiera nieprawidłowy rozmiar APK.", KOD_BLAD_POBIERANIA); return; }
        execute(() -> {
            File tymczasowy = null, docelowy = null;
            try {
                File katalog = new File(getContext().getCacheDir(), KATALOG_AKTUALIZACJI);
                if (!katalog.exists() && !katalog.mkdirs()) throw new Exception("Nie udało się przygotować katalogu aktualizacji.");
                docelowy = bezpiecznyPlik(katalog, nazwaPliku); tymczasowy = bezpiecznyPlik(katalog, nazwaPliku + ".part");
                posprzatajKatalogAktualizacji(katalog, nazwaPliku, System.currentTimeMillis(), false);
                sprawdzMiejscePrzedPobraniem(katalog, deklarowanyRozmiar); usunJesliIstnieje(tymczasowy);
                powiadomOStanie("pobieranie", 0);
                String skrot = pobierz(adres, tymczasowy);
                powiadomOStanie("weryfikacja", 100);
                if (!zweryfikujSkrotLubUsunPlik(tymczasowy, skrot, oczekiwanySkrot)) throw new BladShaException();
                usunJesliIstnieje(docelowy);
                sfinalizujZweryfikowanyApk(tymczasowy, docelowy, oczekiwanySkrot, AktualizacjePlugin::przeniesAtomowo);
                JSObject wynik = new JSObject(); wynik.put("nazwaPliku", nazwaPliku); wynik.put("sha256", skrot); wywolanie.resolve(wynik);
            } catch (Exception blad) {
                usunCzesciowePliki(tymczasowy, docelowy);
                if (blad instanceof BrakMiejscaException) odrzucBrakMiejsca(wywolanie, (BrakMiejscaException) blad);
                else if (blad instanceof BladShaException) wywolanie.reject(blad.getMessage(), KOD_BLEDNY_SHA);
                else if (blad instanceof BladFinalizacjiException) wywolanie.reject(blad.getMessage(), KOD_BLAD_FINALIZACJI);
                else wywolanie.reject(bezpiecznyKomunikat(blad, "Nie udało się pobrać aktualizacji."), KOD_BLAD_POBIERANIA);
            }
        });
    }

    @PluginMethod public void uruchomInstalator(PluginCall wywolanie) {
        String nazwa = wywolanie.getString("nazwaPliku");
        if (nazwa == null || !nazwa.matches("^[A-Za-z0-9._-]+\\.apk$")) { wywolanie.reject("Nieprawidłowa nazwa pliku APK.", KOD_BRAK_INSTALATORA); return; }
        getBridge().executeOnMainThread(() -> uruchomInstalatorNaWatkuGlownym(wywolanie, nazwa));
    }

    private void uruchomInstalatorNaWatkuGlownym(PluginCall wywolanie, String nazwa) {
        try {
            Activity aktywnosc = getActivity();
            if (aktywnosc == null) { wywolanie.reject("Nie można teraz otworzyć ekranu systemowego. Wróć do aplikacji i spróbuj ponownie.", KOD_BRAK_INSTALATORA); return; }
            File plik = bezpiecznyPlik(new File(getContext().getCacheDir(), KATALOG_AKTUALIZACJI), nazwa);
            if (!plik.isFile()) { wywolanie.reject("Zweryfikowany plik APK nie jest już dostępny. Pobierz go ponownie.", KOD_BRAK_INSTALATORA); return; }
            sprawdzMiejscePrzedInstalacja(plik.getParentFile(), plik.length());
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent ustawienia = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:pl.ogarniacz.app"));
                if (ustawienia.resolveActivity(aktywnosc.getPackageManager()) == null) { wywolanie.reject("Android nie udostępnia ustawień instalowania nieznanych aplikacji dla Ogarniacza.", KOD_BRAK_INSTALATORA); return; }
                aktywnosc.startActivity(ustawienia); JSObject wynik = new JSObject(); wynik.put("przekazanoDoSystemu", false); wynik.put("wymagaZgody", true); wywolanie.resolve(wynik); return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", plik);
            Intent instalator = new Intent(Intent.ACTION_VIEW); instalator.setDataAndType(uri, "application/vnd.android.package-archive"); instalator.setClipData(ClipData.newRawUri("APK Ogarniacza", uri)); instalator.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            PackageManager pakiety = aktywnosc.getPackageManager(); ResolveInfo odbiorca = pakiety.resolveActivity(instalator, PackageManager.MATCH_DEFAULT_ONLY);
            if (odbiorca == null || odbiorca.activityInfo == null) { wywolanie.reject("Na urządzeniu nie ma dostępnego systemowego instalatora APK. Sprawdź ustawienia Androida i spróbuj ponownie.", KOD_BRAK_INSTALATORA); return; }
            instalator.setPackage(odbiorca.activityInfo.packageName); aktywnosc.grantUriPermission(odbiorca.activityInfo.packageName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION); aktywnosc.startActivity(instalator);
            JSObject wynik = new JSObject(); wynik.put("przekazanoDoSystemu", true); wynik.put("wymagaZgody", false); wywolanie.resolve(wynik);
        } catch (BrakMiejscaException blad) { odrzucBrakMiejsca(wywolanie, blad); }
        catch (Exception blad) { wywolanie.reject(bezpiecznyKomunikat(blad, "Nie udało się uruchomić instalatora Androida. Spróbuj ponownie."), KOD_BRAK_INSTALATORA); }
    }

    private void odrzucBrakMiejsca(PluginCall wywolanie, BrakMiejscaException blad) {
        JSObject dane = new JSObject(); dane.put("wolneBajty", blad.wolneBajty); dane.put("wymaganeBajty", blad.wymaganeBajty); dane.put("brakujaceBajty", blad.brakujaceBajty);
        wywolanie.reject(blad.getMessage(), KOD_BRAK_MIEJSCA, dane);
    }

    private String pobierz(String adresPoczatkowy, File docelowy) throws Exception {
        URL adres = URI.create(adresPoczatkowy).toURL();
        for (int numer = 0; numer <= LIMIT_PRZEKIEROWAN; numer++) {
            HttpURLConnection polaczenie = (HttpURLConnection) adres.openConnection(); polaczenie.setInstanceFollowRedirects(false); polaczenie.setConnectTimeout(15000); polaczenie.setReadTimeout(30000); polaczenie.setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream"); polaczenie.setRequestProperty("User-Agent", "Ogarniacz-Android-Updater");
            int kod = polaczenie.getResponseCode();
            if (kod >= 300 && kod < 400) { String lokalizacja = polaczenie.getHeaderField("Location"); polaczenie.disconnect(); if (lokalizacja == null) throw new Exception("Serwer zwrócił przekierowanie bez adresu docelowego."); adres = new URL(adres, lokalizacja); if (!"https".equalsIgnoreCase(adres.getProtocol())) throw new Exception("Przekierowanie APK nie używa HTTPS."); continue; }
            if (kod < 200 || kod >= 300) { polaczenie.disconnect(); throw new Exception("Serwer APK zwrócił HTTP " + kod + "."); }
            long rozmiar = polaczenie.getContentLengthLong();
            if (rozmiar > MAKSYMALNY_ROZMIAR_APK) { polaczenie.disconnect(); throw new Exception("Plik APK przekracza dozwolony rozmiar 250 MB."); }
            if (rozmiar > 0) sprawdzMiejscePrzedPobraniem(docelowy.getParentFile(), rozmiar);
            MessageDigest skrot = MessageDigest.getInstance("SHA-256"); long pobrano = 0; int ostatniProcent = -1;
            try (InputStream wejscie = polaczenie.getInputStream(); FileOutputStream wyjscie = new FileOutputStream(docelowy)) {
                byte[] bufor = new byte[64 * 1024]; int liczba;
                while ((liczba = wejscie.read(bufor)) != -1) {
                    pobrano += liczba; if (pobrano > MAKSYMALNY_ROZMIAR_APK) throw new Exception("Plik APK przekracza dozwolony rozmiar 250 MB.");
                    if (rozmiar <= 0 && pobrano % (1024L * 1024L) < liczba) sprawdzMiejscePodczasPobierania(docelowy.getParentFile(), pobrano);
                    wyjscie.write(bufor, 0, liczba); skrot.update(bufor, 0, liczba);
                    if (rozmiar > 0) { int procent = (int) Math.min(99, pobrano * 100 / rozmiar); if (procent != ostatniProcent && procent % 5 == 0) { ostatniProcent = procent; powiadomOStanie("pobieranie", procent); } }
                } wyjscie.getFD().sync();
            } finally { polaczenie.disconnect(); }
            return zapisSzesnastkowy(skrot.digest());
        } throw new Exception("Serwer APK przekroczył limit przekierowań.");
    }

    private boolean poprawnyAdresHttps(String adres) { try { return adres != null && "https".equalsIgnoreCase(URI.create(adres).getScheme()); } catch (Exception blad) { return false; } }
    private File bezpiecznyPlik(File katalog, String nazwa) throws Exception { File plik = new File(katalog, nazwa); if (!plik.getCanonicalPath().startsWith(katalog.getCanonicalPath() + File.separator)) throw new Exception("Nieprawidłowa ścieżka pliku aktualizacji."); return plik; }
    private static void usunJesliIstnieje(File plik) throws Exception { if (plik.exists() && !plik.delete()) throw new Exception("Nie udało się usunąć pliku aktualizacji."); }
    private void sprawdzMiejscePrzedPobraniem(File katalog, Long rozmiar) throws BrakMiejscaException { sprawdzDostepneMiejsce(katalog, rozmiar == null ? MINIMALNE_WYMAGANE_MIEJSCE : obliczWymaganeMiejsce(rozmiar)); }
    private void sprawdzMiejscePodczasPobierania(File katalog, long pobrane) throws BrakMiejscaException { sprawdzDostepneMiejsce(katalog, obliczWymaganeMiejsce(pobrane)); }
    private void sprawdzMiejscePrzedInstalacja(File katalog, long rozmiar) throws BrakMiejscaException { sprawdzDostepneMiejsce(katalog, obliczWymaganeMiejsce(rozmiar)); }
    private void sprawdzDostepneMiejsce(File katalog, long wymagane) throws BrakMiejscaException { long wolne = new StatFs(katalog.getAbsolutePath()).getAvailableBytes(); if (wolne < wymagane) throw new BrakMiejscaException(wolne, wymagane); }
    static long obliczWymaganeMiejsce(long rozmiarApk) { if (rozmiarApk < 0) throw new IllegalArgumentException("Rozmiar APK nie może być ujemny."); return Math.max(MINIMALNE_WYMAGANE_MIEJSCE, Math.multiplyExact(rozmiarApk, MNOZNIK_MIEJSCA_DLA_APK)); }
    static boolean czyJestWystarczajacoMiejsca(long wolne, long rozmiarApk) { return wolne >= obliczWymaganeMiejsce(rozmiarApk); }
    static long obliczBrakujaceMiejsce(long wolne, long wymagane) { return Math.max(0L, wymagane - wolne); }
    static boolean zweryfikujSkrotLubUsunPlik(File plik, String obliczony, String oczekiwany) throws Exception { if (obliczony.equalsIgnoreCase(oczekiwany)) return true; usunPlikPoBledzie(plik); return false; }

    interface PrzenoszeniePliku { void wykonaj(File zrodlo, File cel) throws Exception; }
    static void sfinalizujZweryfikowanyApk(File tymczasowy, File docelowy, String oczekiwanySkrot, PrzenoszeniePliku przenoszenie) throws BladFinalizacjiException {
        long rozmiar = tymczasowy.length();
        try {
            try { przenoszenie.wykonaj(tymczasowy, docelowy); }
            catch (Exception bladPrzeniesienia) { skopiujZFsynchronizacja(tymczasowy, docelowy); usunJesliIstnieje(tymczasowy); }
            if (!docelowy.isFile() || docelowy.length() != rozmiar || !obliczSkrotPliku(docelowy).equalsIgnoreCase(oczekiwanySkrot)) throw new Exception("Finalny plik APK nie przeszedł ponownej weryfikacji.");
        } catch (Exception blad) { try { usunPlikPoBledzie(docelowy); } catch (Exception ignored) { } throw new BladFinalizacjiException(blad); }
    }
    private static void przeniesAtomowo(File zrodlo, File cel) throws Exception { Files.move(zrodlo.toPath(), cel.toPath(), StandardCopyOption.ATOMIC_MOVE); }
    private static void skopiujZFsynchronizacja(File zrodlo, File cel) throws Exception { try (FileInputStream wejscie = new FileInputStream(zrodlo); FileOutputStream wyjscie = new FileOutputStream(cel)) { byte[] bufor = new byte[64 * 1024]; int liczba; while ((liczba = wejscie.read(bufor)) != -1) wyjscie.write(bufor, 0, liczba); wyjscie.getFD().sync(); } if (!cel.isFile() || cel.length() != zrodlo.length()) throw new Exception("Kopiowanie APK nie zachowało oczekiwanego rozmiaru."); }
    static void posprzatajKatalogAktualizacji(File katalog, String nazwaChroniona, long teraz, boolean poAktualizacji) throws Exception {
        File[] pliki = katalog.listFiles(); if (pliki == null) return;
        for (File plik : pliki) { String nazwa = plik.getName(); boolean zarzadzany = nazwa.matches("Ogarniacz-[A-Za-z0-9._-]+-release\\.apk(?:\\.(?:part|tmp))?"); if (!zarzadzany || nazwa.equals(nazwaChroniona) || nazwa.equals(nazwaChroniona + ".part")) continue; boolean wygasly = teraz - plik.lastModified() >= RETENCJA_NIEUDANYCH_ARTEFAKTOW_MS; if (poAktualizacji || nazwa.endsWith(".apk") || wygasly) usunJesliIstnieje(plik); }
    }
    private static String obliczSkrotPliku(File plik) throws Exception { MessageDigest skrot = MessageDigest.getInstance("SHA-256"); try (InputStream wejscie = new FileInputStream(plik)) { byte[] bufor = new byte[64 * 1024]; int liczba; while ((liczba = wejscie.read(bufor)) != -1) skrot.update(bufor, 0, liczba); } return zapisSzesnastkowy(skrot.digest()); }
    private static void usunPlikPoBledzie(File plik) throws Exception { if (plik.exists() && !plik.delete()) throw new Exception("Nie udało się usunąć niekompletnego pliku aktualizacji."); }
    private static void usunCzesciowePliki(File... pliki) { for (File plik : pliki) if (plik != null) try { usunPlikPoBledzie(plik); } catch (Exception ignored) { } }
    private static String zapisSzesnastkowy(byte[] bajty) { StringBuilder wynik = new StringBuilder(bajty.length * 2); for (byte bajt : bajty) wynik.append(String.format(Locale.ROOT, "%02x", bajt)); return wynik.toString(); }
    private void powiadomOStanie(String stan, int procent) { JSObject dane = new JSObject(); dane.put("stan", stan); dane.put("procent", procent); notifyListeners("stanAktualizacji", dane); }
    private String bezpiecznyKomunikat(Exception blad, String domyslny) { String komunikat = blad.getMessage(); return komunikat == null || komunikat.isBlank() ? domyslny : komunikat; }
    private static final class BrakMiejscaException extends Exception { final long wolneBajty, wymaganeBajty, brakujaceBajty; BrakMiejscaException(long wolne, long wymagane) { super("Za mało wolnego miejsca na aktualizację."); wolneBajty = wolne; wymaganeBajty = wymagane; brakujaceBajty = obliczBrakujaceMiejsce(wolne, wymagane); } }
    private static final class BladShaException extends Exception { BladShaException() { super("SHA-256 pobranego APK nie zgadza się z manifestem. Plik został usunięty."); } }
    static final class BladFinalizacjiException extends Exception { BladFinalizacjiException(Exception przyczyna) { super("Nie udało się bezpiecznie zapisać zweryfikowanego APK.", przyczyna); } }
}
