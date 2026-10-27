package pl.ogarniacz.app;

import android.app.Activity;
import android.app.AlertDialog;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.shadows.ShadowAlertDialog;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
public class BlokadaAplikacjiTest {
    private Activity aktywnosc;
    private BlokadaAplikacji blokada;
    private BlokadaAplikacji utworz() {
        return new BlokadaAplikacji(aktywnosc) {
            @Override SecretKey klucz() { return new SecretKeySpec(new byte[32], "HmacSHA256"); }
        };
    }
    private android.widget.EditText znajdzPole(android.view.View widok) {
        if (widok instanceof android.widget.EditText) return (android.widget.EditText) widok;
        if (widok instanceof android.view.ViewGroup) {
            android.view.ViewGroup grupa = (android.view.ViewGroup) widok;
            for (int numer = 0; numer < grupa.getChildCount(); numer++) {
                android.widget.EditText pole = znajdzPole(grupa.getChildAt(numer));
                if (pole != null) return pole;
            }
        }
        return null;
    }
    @Before public void przygotuj() {
        aktywnosc = Robolectric.buildActivity(Activity.class).setup().get();
        aktywnosc.getSharedPreferences("blokada-aplikacji", 0).edit().clear().commit();
        blokada = utworz();
    }
    @Test public void domyslnieWylaczonaIFormaty() {
        assertFalse(blokada.wlaczona());
        for (String kod : new String[]{"123", "1234567890123", "12a4", "12 4"}) assertFalse(BlokadaAplikacji.poprawnySekret("pin", kod));
        assertTrue(BlokadaAplikacji.poprawnySekret("pin", "0000"));
        assertTrue(BlokadaAplikacji.poprawnySekret("pin", "123456789012"));
        assertFalse(BlokadaAplikacji.poprawnySekret("haslo", "1234567"));
        assertFalse(BlokadaAplikacji.poprawnySekret("haslo", "haslo abc"));
        assertFalse(BlokadaAplikacji.poprawnySekret("haslo", "haslo\tabc"));
    }
    @Test public void pinHasloZmianaIWylaczenieBezZmianyDanych() throws Exception {
        aktywnosc.getSharedPreferences("konto", 0).edit().putString("sesja", "zachowana").commit();
        blokada.zapiszKonfiguracje("pin", "1234", "1234", 5, true, "");
        assertTrue(blokada.sprawdz("1234"));
        assertFalse(blokada.sprawdz("4321"));
        assertFalse(blokada.ustawienia.getAll().containsValue("1234"));
        try { blokada.zapiszKonfiguracje("brak", "", "", 0, true, "9999"); fail(); } catch (IllegalArgumentException oczekiwany) { assertTrue(blokada.wlaczona()); }
        blokada.zapiszKonfiguracje("pin", "5678", "5678", 1, true, "1234");
        assertFalse(blokada.sprawdz("1234")); assertTrue(blokada.sprawdz("5678"));
        blokada.zapiszKonfiguracje("haslo", "DlugieHaslo!", "DlugieHaslo!", 1, true, "5678");
        assertTrue(utworz().sprawdz("DlugieHaslo!"));
        blokada.zapiszKonfiguracje("brak", "", "", 0, true, "DlugieHaslo!");
        assertFalse(utworz().wlaczona());
        assertFalse(blokada.ustawienia.contains("skrot"));
        assertEquals("zachowana", aktywnosc.getSharedPreferences("konto", 0).getString("sesja", ""));
    }
    @Test public void roznePotwierdzenieNieZapisuje() throws Exception {
        try { blokada.zapiszKonfiguracje("pin", "1234", "1235", 0, true, ""); fail(); }
        catch (IllegalArgumentException oczekiwany) { assertFalse(blokada.wlaczona()); }
    }
    @Test public void limitProbPrzetrwaRestart() throws Exception {
        blokada.zapiszKonfiguracje("pin", "1234", "1234", 0, true, "");
        for (int numer = 0; numer < 5; numer++) assertFalse(blokada.sprawdz("0000"));
        try { utworz().sprawdz("1234"); fail(); } catch (IllegalArgumentException oczekiwany) { }
        blokada.ustawienia.edit().putLong("czekaj", System.currentTimeMillis() - 1).commit();
        assertTrue(utworz().sprawdz("1234"));
    }
    @Test public void czasTlaRestartIOslona() throws Exception {
        blokada.zapiszKonfiguracje("pin", "1234", "1234", 5, false, "");
        blokada.wTle(); blokada.wznow();
        assertFalse(ShadowAlertDialog.getLatestAlertDialog().isShowing());
        blokada.ustawienia.edit().putLong("aktywnosc", System.currentTimeMillis() - 300001).commit();
        blokada.wznow(); assertTrue(ShadowAlertDialog.getLatestAlertDialog().isShowing());
        ShadowAlertDialog.getLatestAlertDialog().dismiss();
        blokada.zapiszKonfiguracje("pin", "", "", 60, true, "1234");
        utworz().wznow();
        AlertDialog ekran = ShadowAlertDialog.getLatestAlertDialog();
        assertTrue(ekran.isShowing());
        org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();
        android.widget.EditText pole = znajdzPole(ekran.getWindow().getDecorView());
        pole.setText("9999"); ekran.getButton(-1).performClick();
        assertTrue(ekran.isShowing());
        pole.setText("1234"); ekran.getButton(-1).performClick();
        assertFalse(ekran.isShowing());
    }
}
