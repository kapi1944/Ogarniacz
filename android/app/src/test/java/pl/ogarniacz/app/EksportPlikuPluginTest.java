package pl.ogarniacz.app;

import static org.junit.Assert.*;
import android.app.Activity;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ProviderInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.JSArray;
import com.capacitorjs.plugins.share.SharePlugin;
import androidx.appcompat.app.AppCompatActivity;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.lang.reflect.Method;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Robolectric;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
import org.robolectric.shadow.api.Shadow;
import org.robolectric.util.ReflectionHelpers.ClassParameter;
import org.robolectric.shadows.ShadowContentResolver;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, instrumentedPackages = {"androidx.core.content.FileProvider"}, shadows = EksportPlikuPluginTest.SciezkiFileProvider.class)
public class EksportPlikuPluginTest {
    @Implements(value = androidx.core.content.FileProvider.class, isInAndroidSdk = false)
    public static class SciezkiFileProvider {
        @Implementation protected static String removeTrailingSlash(String sciezka) {
            // AndroidX zakłada separator Androida. Normalizujemy tylko ścieżki hosta testów,
            // zachowując oryginalne sprawdzanie katalogu, kanonikalizację i odczyt plików.
            return Shadow.directlyOn(androidx.core.content.FileProvider.class, "removeTrailingSlash",
                ClassParameter.from(String.class, sciezka.replace(File.separatorChar, '/')));
        }
    }

    private final Uri adres = Uri.parse("content://dokumenty-test/kopia.json");
    private KontekstTestowy wtyczka;
    private DostawcaTestowy dostawca;

    @Before public void przygotuj() throws Exception {
        wtyczka = new KontekstTestowy();
        dostawca = new DostawcaTestowy();
        ProviderInfo informacje = new ProviderInfo();
        informacje.authority = "dokumenty-test";
        dostawca.attachInfo(wtyczka.getContext(), informacje);
        dostawca.plik = File.createTempFile("eksport", ".json", wtyczka.getContext().getCacheDir());
        ShadowContentResolver.registerProviderInternal("dokumenty-test", dostawca);
        // Robolectric zmienia katalog aplikacji między testami, a AndroidX zachowuje statyczny cache ścieżek.
        // Nowa instancja providera czyta prawdziwy manifest i odświeża ścieżki dla bieżącego katalogu.
        String nazwaDostawcy = wtyczka.getContext().getPackageName() + ".fileprovider";
        ProviderInfo konfiguracja = wtyczka.getContext().getPackageManager().resolveContentProvider(nazwaDostawcy, PackageManager.GET_META_DATA);
        assertNotNull(konfiguracja);
        androidx.core.content.FileProvider dostawcaPlikow = new androidx.core.content.FileProvider();
        dostawcaPlikow.attachInfo(wtyczka.getContext(), konfiguracja);
        ShadowContentResolver.registerProviderInternal(nazwaDostawcy, dostawcaPlikow);
    }

    @Test public void otwieraSystemowyWyborJsonBezTekstuIZwracaAnulowanie() throws Exception {
        WywolanieTestowe wywolanie = new WywolanieTestowe(new JSObject().put("nazwa", "kopia.json").put("tekst", "{}"));
        wtyczka.zapisz(wywolanie);
        assertEquals(Intent.ACTION_CREATE_DOCUMENT, wtyczka.zamiar.getAction());
        assertEquals("application/json", wtyczka.zamiar.getType());
        assertTrue(wtyczka.zamiar.hasCategory(Intent.CATEGORY_OPENABLE));
        assertEquals("kopia.json", wtyczka.zamiar.getStringExtra(Intent.EXTRA_TITLE));
        assertFalse(wtyczka.zamiar.hasExtra(Intent.EXTRA_TEXT));
        odebrano(wywolanie, Activity.RESULT_CANCELED, null);
        assertEquals("anulowano", wywolanie.wynik.getString("status"));
    }

    @Test public void brakUriNieJestSukcesem() throws Exception {
        WywolanieTestowe wywolanie = new WywolanieTestowe(new JSObject());
        odebrano(wywolanie, Activity.RESULT_OK, new Intent());
        assertNotNull(wywolanie.blad);
        assertNull(wywolanie.wynik);
    }

    @Test public void zapisujeDokladneBajtyUtf8IOdczytujeDokument() throws Exception {
        String tekst = "{\"szyfrogram\":\"test żółć\"}";
        EksportPlikuPlugin.zapiszDokument(wtyczka.getContext(), adres, tekst);
        assertArrayEquals(tekst.getBytes(StandardCharsets.UTF_8), Files.readAllBytes(dostawca.plik.toPath()));
        assertTrue(dostawca.odczytano);
    }

    @Test public void binarnyPngZachowujeNazweMimeIOryginalneBajty() throws Exception {
        byte[] bajty = new byte[] { (byte)137, 80, 78, 71, 0, (byte)255, (byte)128, 10 };
        String base64 = android.util.Base64.encodeToString(bajty, android.util.Base64.NO_WRAP);
        WywolanieTestowe wywolanie = new WywolanieTestowe(new JSObject().put("nazwa", "mózg–żarówka.png").put("typ", "image/png").put("base64", base64));
        wtyczka.zapisz(wywolanie);
        assertNull(wywolanie.blad);
        assertEquals("image/png", wtyczka.zamiar.getType());
        assertEquals("mózg–żarówka.png", wtyczka.zamiar.getStringExtra(Intent.EXTRA_TITLE));
        EksportPlikuPlugin.zapiszDokument(wtyczka.getContext(), adres, EksportPlikuPlugin.dekodujBajty(base64));
        assertArrayEquals(bajty, Files.readAllBytes(dostawca.plik.toPath()));
        assertTrue(dostawca.odczytano);
        odebrano(wywolanie, Activity.RESULT_CANCELED, null);
        assertEquals("anulowano", wywolanie.wynik.getString("status"));
    }

    @Test public void niejednoznaczneLubUszkodzoneDaneNieOtwierajaOknaZapisu() {
        for (JSObject dane : new JSObject[] {
                new JSObject().put("nazwa", "ikona.ico").put("tekst", "test").put("base64", "AAABAA=="),
                new JSObject().put("nazwa", "ikona.ico").put("base64", "nie Base64"),
                new JSObject().put("nazwa", "../ikona.ico").put("base64", "AAABAA==") }) {
            WywolanieTestowe wywolanie = new WywolanieTestowe(dane);
            wtyczka.zapisz(wywolanie);
            assertNotNull(wywolanie.blad);
            assertNull(wtyczka.zamiar);
        }
    }

    @Test public void binarnyPlikTakzeWymagaZgodnegoOdczytuPoZapisie() {
        dostawca.uszkodzOdczyt = true;
        assertThrows(IOException.class, () -> EksportPlikuPlugin.zapiszDokument(wtyczka.getContext(), adres, new byte[] { 0, 0, 1, 0 }));
    }

    @Test public void odmowaZapisuBlokujeSukces() {
        dostawca.odmowaZapisu = true;
        assertThrows(SecurityException.class, () -> EksportPlikuPlugin.zapiszDokument(wtyczka.getContext(), adres, "{}"));
    }

    @Test public void odmowaOdczytuBlokujeSukcesPoZapisie() {
        dostawca.odmowaOdczytu = true;
        assertThrows(SecurityException.class, () -> EksportPlikuPlugin.zapiszDokument(wtyczka.getContext(), adres, "{}"));
    }

    @Test public void skroconyLubZmienionyDokumentNieJestZapisanymBackupem() {
        dostawca.uszkodzOdczyt = true;
        assertThrows(IOException.class, () -> EksportPlikuPlugin.zapiszDokument(wtyczka.getContext(), adres, "{\"test\":1}"));
    }

    @Test public void sprawdzaRzeczywistyZalacznikPrzezFileProvider() throws Exception {
        File katalog = new File(wtyczka.getContext().getCacheDir(), "eksport/test");
        assertTrue(katalog.mkdirs() || katalog.isDirectory());
        File plik = new File(katalog, "kopia.json");
        Files.write(plik.toPath(), "{\"szyfrogram\":\"test\"}".getBytes(StandardCharsets.UTF_8));
        Uri adresTresci = androidx.core.content.FileProvider.getUriForFile(wtyczka.getContext(), wtyczka.getContext().getPackageName() + ".fileprovider", plik);
        assertEquals("application/json", wtyczka.getContext().getContentResolver().getType(adresTresci));
        WywolanieTestowe wywolanie = new WywolanieTestowe(new JSObject().put("uri", Uri.fromFile(plik).toString()));
        wtyczka.sprawdzZalacznik(wywolanie);
        assertNull(wywolanie.blad);
        assertNotNull(wywolanie.wynik);
        assertEquals("application/json", wywolanie.wynik.getString("typ"));
        assertTrue(wywolanie.wynik.getString("uri").startsWith("content://"));
    }

    @Test public void odrzucaObceNieistniejaceIPusteZalaczniki() throws Exception {
        File pusty = new File(wtyczka.getContext().getCacheDir(), "eksport/pusty.json");
        assertTrue(pusty.getParentFile().mkdirs() || pusty.getParentFile().isDirectory());
        Files.write(pusty.toPath(), new byte[0]);
        for (String uri : new String[] { "https://example.com/a.json", "content://obcy/a.json", "file:///brak.json", Uri.fromFile(pusty).toString() }) {
            WywolanieTestowe wywolanie = new WywolanieTestowe(new JSObject().put("uri", uri));
            wtyczka.sprawdzZalacznik(wywolanie);
            assertNotNull(wywolanie.blad);
            assertNull(wywolanie.wynik);
        }
    }

    @Test public void fileProviderNieUdostepniaApkAniSasiedniegoKatalogu() throws Exception {
        String nazwaDostawcy = wtyczka.getContext().getPackageName() + ".fileprovider";
        for (String sciezka : new String[] { "aktualizacje/aktualizacja.apk", "eksport-obcy/kopia.json", "eksport/../prywatny.json" }) {
            File plik = new File(wtyczka.getContext().getCacheDir(), sciezka);
            assertTrue(plik.getParentFile().mkdirs() || plik.getParentFile().isDirectory());
            Files.write(plik.toPath(), "prywatne".getBytes(StandardCharsets.UTF_8));
            assertThrows(IllegalArgumentException.class, () -> androidx.core.content.FileProvider.getUriForFile(wtyczka.getContext(), nazwaDostawcy, plik));
        }
        Uri ucieczka = Uri.parse("content://" + nazwaDostawcy + "/eksport/..%2Fprywatny.json");
        assertThrows(SecurityException.class, () -> wtyczka.getContext().getContentResolver().openInputStream(ucieczka));
    }

    @Test public void capacitorPrzekazujeJsonZPrawemOdczytuBezTekstu() throws Exception {
        AppCompatActivity aktywnosc = Robolectric.buildActivity(AppCompatActivity.class).get();
        final Intent[] otwartyZamiar = new Intent[1];
        SharePlugin udostepnianie = new SharePlugin() {
            @Override public Context getContext() { return wtyczka.getContext(); }
            @Override public AppCompatActivity getActivity() { return aktywnosc; }
            @Override public void startActivityForResult(PluginCall wywolanie, Intent zamiar, String nazwa) { otwartyZamiar[0] = zamiar; }
        };
        File plik = new File(wtyczka.getContext().getCacheDir(), "eksport/zalacznik.json");
        assertTrue(plik.getParentFile().mkdirs() || plik.getParentFile().isDirectory());
        byte[] bajty = "{\"szyfrogram\":\"test\"}".getBytes(StandardCharsets.UTF_8);
        Files.write(plik.toPath(), bajty);
        JSArray pliki = new JSArray();
        pliki.put(Uri.fromFile(plik).toString());
        WywolanieTestowe wywolanie = new WywolanieTestowe(new JSObject().put("files", pliki));
        udostepnianie.share(wywolanie);
        assertNull(wywolanie.blad);
        assertNotNull(otwartyZamiar[0]);
        Intent wysylany = otwartyZamiar[0].getParcelableExtra(Intent.EXTRA_INTENT);
        assertEquals(Intent.ACTION_SEND, wysylany.getAction());
        assertEquals("application/json", wysylany.getType());
        assertFalse(wysylany.hasExtra(Intent.EXTRA_TEXT));
        assertTrue((wysylany.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0);
        Uri uri = wysylany.getParcelableExtra(Intent.EXTRA_STREAM);
        assertEquals("content", uri.getScheme());
        assertEquals(uri, wysylany.getClipData().getItemAt(0).getUri());
        try (java.io.InputStream odczyt = wtyczka.getContext().getContentResolver().openInputStream(uri)) {
            WeryfikacjaPliku.sprawdz(odczyt, bajty);
        }
    }

    @Test public void brakSystemowegoOknaZapisuNieJestSukcesem() {
        wtyczka.brakOkna = true;
        WywolanieTestowe wywolanie = new WywolanieTestowe(new JSObject().put("nazwa", "kopia.json").put("tekst", "{}"));
        wtyczka.zapisz(wywolanie);
        assertNotNull(wywolanie.blad);
        assertNull(wywolanie.wynik);
    }

    private void odebrano(WywolanieTestowe wywolanie, int kod, Intent zamiar) throws Exception {
        Method metoda = EksportPlikuPlugin.class.getDeclaredMethod("poWyborzeMiejsca", PluginCall.class, ActivityResult.class);
        metoda.setAccessible(true);
        metoda.invoke(wtyczka, wywolanie, new ActivityResult(kod, zamiar));
    }

    private static class KontekstTestowy extends EksportPlikuPlugin {
        Intent zamiar;
        boolean brakOkna;
        @Override public Context getContext() { return RuntimeEnvironment.getApplication(); }
        @Override public void startActivityForResult(PluginCall wywolanie, Intent zamiar, String nazwa) {
            if (brakOkna) throw new android.content.ActivityNotFoundException();
            this.zamiar = zamiar;
        }
    }

    private static class WywolanieTestowe extends PluginCall {
        JSObject wynik;
        String blad;
        WywolanieTestowe(JSObject dane) { super(null, "EksportPliku", "test", "test", dane); }
        @Override public void resolve(JSObject dane) { wynik = dane; }
        @Override public void reject(String komunikat) { blad = komunikat; }
    }

    public static class DostawcaTestowy extends ContentProvider {
        File plik;
        boolean odmowaZapisu, odmowaOdczytu, uszkodzOdczyt, odczytano;
        @Override public ParcelFileDescriptor openFile(Uri adres, String tryb) throws java.io.FileNotFoundException {
            boolean zapis = tryb.contains("w");
            if ((zapis && odmowaZapisu) || (!zapis && odmowaOdczytu)) throw new SecurityException("Odmowa testowa");
            if (!zapis) {
                odczytano = true;
                if (uszkodzOdczyt) {
                    try { Files.write(plik.toPath(), "uszkodzony".getBytes(StandardCharsets.UTF_8)); } catch (IOException przyczyna) { throw new java.io.FileNotFoundException(); }
                }
            }
            return ParcelFileDescriptor.open(plik, zapis ? ParcelFileDescriptor.MODE_WRITE_ONLY | ParcelFileDescriptor.MODE_TRUNCATE : ParcelFileDescriptor.MODE_READ_ONLY);
        }
        @Override public boolean onCreate() { return true; }
        @Override public String getType(Uri adres) { return "application/json"; }
        @Override public Cursor query(Uri adres, String[] kolumny, String wybor, String[] argumenty, String sortowanie) { return null; }
        @Override public Uri insert(Uri adres, ContentValues wartosci) { throw new UnsupportedOperationException(); }
        @Override public int delete(Uri adres, String wybor, String[] argumenty) { throw new UnsupportedOperationException(); }
        @Override public int update(Uri adres, ContentValues wartosci, String wybor, String[] argumenty) { throw new UnsupportedOperationException(); }
    }
}
