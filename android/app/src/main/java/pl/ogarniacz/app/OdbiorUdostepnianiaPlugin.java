package pl.ogarniacz.app;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OdbiorUdostepniania")
public class OdbiorUdostepnianiaPlugin extends Plugin {
    private static final int MAKSYMALNA_DLUGOSC_TRESCI = 10000;
    private static final int MAKSYMALNA_DLUGOSC_TYTULU = 200;

    @Override
    protected void handleOnNewIntent(Intent zamiar) {
        String akcja = zamiar.getAction();
        boolean udostepnienie = Intent.ACTION_SEND.equals(akcja);
        boolean zaznaczonyTekst = Intent.ACTION_PROCESS_TEXT.equals(akcja);
        if (!udostepnienie && !zaznaczonyTekst) return;
        if (udostepnienie && (zamiar.getType() == null || !zamiar.getType().startsWith("text/"))) return;

        CharSequence przekazanaTresc = zamiar.getCharSequenceExtra(
            zaznaczonyTekst ? Intent.EXTRA_PROCESS_TEXT : Intent.EXTRA_TEXT
        );
        String tresc = ogranicz(przekazanaTresc, MAKSYMALNA_DLUGOSC_TRESCI);
        if (tresc.isBlank()) return;

        JSObject dane = new JSObject();
        dane.put("tekst", tresc);
        String tytul = ogranicz(zamiar.getCharSequenceExtra(Intent.EXTRA_SUBJECT), MAKSYMALNA_DLUGOSC_TYTULU);
        if (!tytul.isBlank()) dane.put("tytul", tytul);
        notifyListeners("odebranoUdostepnienie", dane, true);

        zamiar.setAction(null);
        zamiar.removeExtra(Intent.EXTRA_TEXT);
        zamiar.removeExtra(Intent.EXTRA_PROCESS_TEXT);
        zamiar.removeExtra(Intent.EXTRA_SUBJECT);
    }

    private String ogranicz(CharSequence wartosc, int limit) {
        if (wartosc == null) return "";
        String tekst = wartosc.toString().trim();
        return tekst.length() <= limit ? tekst : tekst.substring(0, limit);
    }
}
