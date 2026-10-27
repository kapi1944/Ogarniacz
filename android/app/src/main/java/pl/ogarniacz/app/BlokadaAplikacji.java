package pl.ogarniacz.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;


import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import java.security.*;
import java.util.Arrays;
import javax.crypto.*;
import javax.crypto.spec.PBEKeySpec;
import android.util.Base64;

/** Lokalna osłona Androida; nie zmienia kont, baz ani synchronizacji. */
class BlokadaAplikacji {
    private final Activity aktywnosc;
    final SharedPreferences ustawienia;
    private AlertDialog ekran;
    private AlertDialog konfiguracja;
    private boolean zablokowana;
    private static final int[] MINUTY = {0, 1, 5, 15, 30, 60};

    BlokadaAplikacji(Activity aktywnosc) {
        this.aktywnosc = aktywnosc;
        ustawienia = aktywnosc.getSharedPreferences("blokada-aplikacji", Context.MODE_PRIVATE);
        zablokowana = wlaczona() && (ustawienia.getBoolean("restart", true) || uplynalCzas());
        zabezpieczOkno();
    }

    boolean wlaczona() { return !ustawienia.getString("tryb", "brak").equals("brak"); }
    static boolean poprawnySekret(String tryb, String sekret) {
        return tryb.equals("pin") ? sekret.matches("[0-9]{4,12}")
            : tryb.equals("haslo") && sekret.length() >= 8 && !sekret.codePoints().anyMatch(znak -> Character.isWhitespace(znak) || Character.isSpaceChar(znak));
    }
    boolean uplynalCzas() {
        long ostatnio = ustawienia.getLong("aktywnosc", 0);
        long czas = System.currentTimeMillis();
        return czas < ostatnio || czas - ostatnio >= ustawienia.getInt("minuty", 0) * 60000L;
    }
    void zabezpieczOkno() {
        if (wlaczona()) aktywnosc.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        else aktywnosc.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
    void wTle() {
        if (!zablokowana && wlaczona()) zapisz(ustawienia.edit().putLong("aktywnosc", System.currentTimeMillis()));
        if (konfiguracja != null) konfiguracja.dismiss();
        if (wlaczona()) pokazOslone();
    }
    void wznow() {
        if (wlaczona() && (zablokowana || uplynalCzas())) {
            zablokowana = true;
            pokazOslone();
        } else if (ekran != null) { ekran.dismiss(); ekran = null; }
    }
    private void zapisz(SharedPreferences.Editor edycja) {
        if (!edycja.commit()) throw new IllegalStateException("Nie można zapisać zabezpieczeń.");
    }
    SecretKey klucz() throws Exception {
        KeyStore magazyn = KeyStore.getInstance("AndroidKeyStore");
        magazyn.load(null);
        String alias = "ogarniacz-blokada-v1";
        if (!magazyn.containsAlias(alias)) {
            KeyGenerator generator = KeyGenerator.getInstance("HmacSHA256", "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
                .setDigests(KeyProperties.DIGEST_SHA256).build());
            generator.generateKey();
        }
        return (SecretKey) magazyn.getKey(alias, null);
    }
    private byte[] skrot(String sekret, byte[] sol) throws Exception {
        PBEKeySpec parametry = new PBEKeySpec(sekret.toCharArray(), sol, 600000, 256);
        byte[] pochodna;
        try { pochodna = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(parametry).getEncoded(); }
        finally { parametry.clearPassword(); }
        try {
            Mac podpis = Mac.getInstance("HmacSHA256");
            podpis.init(klucz());
            return podpis.doFinal(pochodna);
        } finally { Arrays.fill(pochodna, (byte) 0); }
    }
    boolean sprawdz(String sekret) throws Exception {
        long teraz = System.currentTimeMillis();
        long doKiedy = ustawienia.getLong("czekaj", 0);
        if (doKiedy > teraz || ustawienia.getLong("proba", 0) > teraz)
            throw new IllegalArgumentException("Zbyt wiele prób. Odczekaj minutę; sprawdź datę urządzenia.");
        int proby = ustawienia.getInt("proby", 0) + 1;
        zapisz(ustawienia.edit().putInt("proby", proby).putLong("proba", teraz)
            .putLong("czekaj", proby >= 5 ? teraz + 60000 : 0));
        boolean zgodny = MessageDigest.isEqual(skrot(sekret, Base64.decode(ustawienia.getString("sol", ""), Base64.NO_WRAP)),
            Base64.decode(ustawienia.getString("skrot", ""), Base64.NO_WRAP));
        if (zgodny) zapisz(ustawienia.edit().putInt("proby", 0).putLong("czekaj", 0).putLong("proba", 0));
        return zgodny;
    }
    private EditText pole(LinearLayout uklad, String opis, boolean pin) {
        EditText pole = new EditText(aktywnosc);
        pole.setHint(opis);
        pole.setContentDescription(opis);
        pole.setInputType(pin ? InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD
            : InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        pole.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        pole.setSaveEnabled(false);
        uklad.addView(pole);
        return pole;
    }
    private LinearLayout uklad() {
        LinearLayout uklad = new LinearLayout(aktywnosc);
        uklad.setOrientation(LinearLayout.VERTICAL);
        uklad.setPadding(32, 24, 32, 24);
        return uklad;
    }
    private void pokazOslone() {
        if (ekran != null && ekran.isShowing()) return;
        LinearLayout uklad = uklad();

        EditText sekret = pole(uklad, ustawienia.getString("tryb", "pin").equals("pin") ? "PIN" : "Hasło", ustawienia.getString("tryb", "pin").equals("pin"));
        TextView komunikat = new TextView(aktywnosc);
        komunikat.setText("Odblokowanie działa offline.");
        uklad.addView(komunikat);
        ekran = new AlertDialog.Builder(aktywnosc).setTitle("Ogarniacz — aplikacja zablokowana")
            .setView(uklad).setCancelable(false).setPositiveButton("Odblokuj", null).create();
        ekran.setOnShowListener(zdarzenie -> {
            ekran.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            ekran.getWindow().setDimAmount(1f);
            ekran.getWindow().setLayout(-1, -1);
            ekran.getButton(-1).setOnClickListener(widok -> {
                if (!aktywnaProba) wykonaj(ekran.getButton(-1), komunikat, () -> {
                    String wartosc = sekret.getText().toString(); sekret.setText("");
                    if (!sprawdz(wartosc)) throw new IllegalArgumentException("Nieprawidłowy PIN lub hasło.");
                    zablokowana = false;
                    zapisz(ustawienia.edit().putLong("aktywnosc", System.currentTimeMillis()));
                    ekran.dismiss(); ekran = null;
                });
            });
        });
        ekran.show();
    }
    private boolean aktywnaProba;
    private interface Operacja { void wykonaj() throws Exception; }
    private void wykonaj(Button przycisk, TextView komunikat, Operacja operacja) {
        // Formularze natywne nie przekazują sekretów do JavaScript ani storage WebView.
        aktywnaProba = true;
        przycisk.setEnabled(false);
        try { operacja.wykonaj(); }
        catch (IllegalArgumentException blad) { komunikat.setText(blad.getMessage()); }
        catch (Exception blad) { komunikat.setText("Nie udało się odczytać lub zapisać zabezpieczeń. Dostęp pozostaje zablokowany."); }
        finally { aktywnaProba = false; przycisk.setEnabled(true); }
    }
    void zapiszKonfiguracje(String wybrany, String wartosc, String potwierdzenie, int minuty, boolean restart, String aktualny) throws Exception {
        if (wlaczona() && !sprawdz(aktualny)) throw new IllegalArgumentException("Nieprawidłowy aktualny PIN lub hasło.");
        SharedPreferences.Editor edycja = ustawienia.edit();
        boolean zachowaj = wlaczona() && wybrany.equals(ustawienia.getString("tryb", "")) && wartosc.isEmpty() && potwierdzenie.isEmpty();
        if (!wybrany.equals("brak") && !zachowaj) {
            if (!poprawnySekret(wybrany, wartosc) || !wartosc.equals(potwierdzenie)) throw new IllegalArgumentException("Sprawdź format i zgodność obu nowych pól.");
            byte[] sol = new byte[16]; new SecureRandom().nextBytes(sol);
            edycja.putString("sol", Base64.encodeToString(sol, Base64.NO_WRAP)).putString("skrot", Base64.encodeToString(skrot(wartosc, sol), Base64.NO_WRAP));
        }
        if (wybrany.equals("brak")) edycja.remove("sol").remove("skrot");
        zapisz(edycja.putString("tryb", wybrany).putInt("minuty", minuty).putBoolean("restart", restart).putLong("aktywnosc", System.currentTimeMillis()));
    }
    void otworzUstawienia() {
        if (zablokowana || (konfiguracja != null && konfiguracja.isShowing())) return;
        LinearLayout uklad = uklad();
        Spinner tryb = new Spinner(aktywnosc);
        tryb.setAdapter(new ArrayAdapter<>(aktywnosc, android.R.layout.simple_spinner_dropdown_item, new String[]{"Brak blokady", "Kod PIN", "Hasło"}));
        tryb.setSelection(ustawienia.getString("tryb", "brak").equals("pin") ? 1 : ustawienia.getString("tryb", "brak").equals("haslo") ? 2 : 0);
        uklad.addView(tryb);
        EditText aktualny = wlaczona() ? pole(uklad, "Aktualny PIN lub hasło", ustawienia.getString("tryb", "pin").equals("pin")) : null;
        EditText nowy = pole(uklad, "Nowy PIN (4–12 cyfr) lub hasło (minimum 8 znaków, bez spacji)", false);
        EditText powtorzony = pole(uklad, "Powtórz nowy PIN lub hasło", false);
        TextView etykieta = new TextView(aktywnosc); etykieta.setText("Blokuj po czasie w tle:"); uklad.addView(etykieta);
        Spinner czas = new Spinner(aktywnosc);
        czas.setAdapter(new ArrayAdapter<>(aktywnosc, android.R.layout.simple_spinner_dropdown_item, new String[]{"Natychmiast", "1 minuta", "5 minut", "15 minut", "30 minut", "60 minut"}));
        for (int numer = 0; numer < MINUTY.length; numer++) if (MINUTY[numer] == ustawienia.getInt("minuty", 0)) czas.setSelection(numer);
        uklad.addView(czas);
        CheckBox restart = new CheckBox(aktywnosc); restart.setText("Wymagaj odblokowania po ponownym uruchomieniu aplikacji"); restart.setChecked(ustawienia.getBoolean("restart", true)); uklad.addView(restart);
        TextView komunikat = new TextView(aktywnosc); komunikat.setText("Brak odzyskiwania zapomnianego kodu. Blokada nie szyfruje bazy danych. Zmiana czasu również wymaga aktualnego kodu. Pozostaw nowe pola puste, aby zachować kod."); uklad.addView(komunikat);
        ScrollView przewijanie = new ScrollView(aktywnosc); przewijanie.addView(uklad);
        konfiguracja = new AlertDialog.Builder(aktywnosc).setTitle("Blokada aplikacji").setView(przewijanie)
            .setNegativeButton("Anuluj", null).setPositiveButton("Zapisz", null).create();
        konfiguracja.setOnShowListener(zdarzenie -> {
            konfiguracja.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            konfiguracja.getButton(-1).setOnClickListener(widok -> wykonaj(konfiguracja.getButton(-1), komunikat, () -> {
                String wybrany = new String[]{"brak", "pin", "haslo"}[tryb.getSelectedItemPosition()];
                String wartosc = nowy.getText().toString();
                String potwierdzenie = powtorzony.getText().toString();
                String poprzedni = aktualny == null ? "" : aktualny.getText().toString();
                nowy.setText(""); powtorzony.setText(""); if (aktualny != null) aktualny.setText("");

                zapiszKonfiguracje(wybrany, wartosc, potwierdzenie, MINUTY[czas.getSelectedItemPosition()], restart.isChecked(), poprzedni);
                zabezpieczOkno(); konfiguracja.dismiss();
            }));
        });
        konfiguracja.show();
    }
}
