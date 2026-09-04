package pl.ogarniacz.app;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.Locale;

@CapacitorPlugin(
    name = "EchoGlos",
    permissions = { @Permission(alias = "mikrofon", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class EchoGlosPlugin extends Plugin {
    private static final String UPRAWNIENIE_MIKROFONU = "mikrofon";
    private static final int DOMYSLNY_LIMIT_NASLUCHIWANIA_MS = 15000;
    private final Handler obslugaCzasu = new Handler(Looper.getMainLooper());
    private SpeechRecognizer rozpoznawanie;
    private PluginCall aktywneRozpoznawanie;
    private TextToSpeech syntezator;
    private boolean syntezatorGotowy;
    private PluginCall aktywneMowienie;
    private Runnable przekroczenieCzasu;

    @Override
    public void load() {
        getActivity().runOnUiThread(() -> syntezator = new TextToSpeech(getContext(), stan -> {
            if (stan != TextToSpeech.SUCCESS) return;
            int wynik = syntezator.setLanguage(new Locale("pl", "PL"));
            syntezatorGotowy = wynik != TextToSpeech.LANG_MISSING_DATA && wynik != TextToSpeech.LANG_NOT_SUPPORTED;
            syntezator.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String identyfikator) {
                    powiadomStan("mowienie");
                }

                @Override public void onDone(String identyfikator) {
                    zakonczMowienie(null);
                }

                @Override public void onError(String identyfikator) {
                    zakonczMowienie("Syntezator mowy nie odczytał odpowiedzi.");
                }
            });
        }));
    }

    @PluginMethod
    public void sprawdzDostepnosc(PluginCall wywolanie) {
        JSObject wynik = new JSObject();
        wynik.put("rozpoznawanie", SpeechRecognizer.isRecognitionAvailable(getContext()));
        wynik.put("mowienie", syntezatorGotowy);
        wynik.put("zgoda", getPermissionState(UPRAWNIENIE_MIKROFONU).toString());
        wywolanie.resolve(wynik);
    }

    @PluginMethod
    public void rozpocznijNasluchiwanie(PluginCall wywolanie) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            wywolanie.reject("Na urządzeniu nie ma usługi rozpoznawania mowy.", "BRAK_USLUGI_STT");
            return;
        }
        if (getPermissionState(UPRAWNIENIE_MIKROFONU) != PermissionState.GRANTED) {
            requestPermissionForAlias(UPRAWNIENIE_MIKROFONU, wywolanie, "poZgodzieMikrofonu");
            return;
        }
        uruchomRozpoznawanie(wywolanie);
    }

    @PermissionCallback
    private void poZgodzieMikrofonu(PluginCall wywolanie) {
        if (getPermissionState(UPRAWNIENIE_MIKROFONU) != PermissionState.GRANTED) {
            wywolanie.reject("Brak zgody na użycie mikrofonu.", "BRAK_ZGODY");
            return;
        }
        uruchomRozpoznawanie(wywolanie);
    }

    private void uruchomRozpoznawanie(PluginCall wywolanie) {
        getActivity().runOnUiThread(() -> {
            if (aktywneRozpoznawanie != null) {
                wywolanie.reject("Sesja rozpoznawania mowy już trwa.", "SESJA_AKTYWNA");
                return;
            }
            aktywneRozpoznawanie = wywolanie;
            rozpoznawanie = SpeechRecognizer.createSpeechRecognizer(getContext());
            rozpoznawanie.setRecognitionListener(new SluchaczRozpoznawania());
            Intent zamiar = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            zamiar.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            zamiar.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pl-PL");
            zamiar.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "pl-PL");
            zamiar.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
            zamiar.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            int zadanyLimit = wywolanie.getInt("limitMs", DOMYSLNY_LIMIT_NASLUCHIWANIA_MS);
            int limit = Math.max(3000, Math.min(30000, zadanyLimit));
            przekroczenieCzasu = () -> zakonczRozpoznawanie("Przekroczono czas oczekiwania na wypowiedź.", "TIMEOUT");
            obslugaCzasu.postDelayed(przekroczenieCzasu, limit);
            rozpoznawanie.startListening(zamiar);
            powiadomStan("sluchanie");
        });
    }

    @PluginMethod
    public void anulujNasluchiwanie(PluginCall wywolanie) {
        getActivity().runOnUiThread(() -> {
            zakonczRozpoznawanie("Nasłuchiwanie anulowano.", "ANULOWANO");
            wywolanie.resolve();
        });
    }

    @PluginMethod
    public void mow(PluginCall wywolanie) {
        String tekst = wywolanie.getString("tekst", "").trim();
        if (tekst.isEmpty()) {
            wywolanie.reject("Brak tekstu do odczytania.", "BRAK_TEKSTU");
            return;
        }
        if (!syntezatorGotowy || syntezator == null) {
            wywolanie.reject("Polski syntezator mowy nie jest dostępny.", "BRAK_USLUGI_TTS");
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (aktywneMowienie != null) zakonczMowienie("Wypowiedź została przerwana.");
            aktywneMowienie = wywolanie;
            String identyfikator = "echo-" + System.nanoTime();
            if (syntezator.speak(tekst, TextToSpeech.QUEUE_FLUSH, null, identyfikator) == TextToSpeech.ERROR) {
                zakonczMowienie("Nie udało się uruchomić syntezatora mowy.");
            }
        });
    }

    @PluginMethod
    public void zatrzymajMowienie(PluginCall wywolanie) {
        getActivity().runOnUiThread(() -> {
            if (syntezator != null) syntezator.stop();
            zakonczMowienie("Wypowiedź została przerwana.");
            wywolanie.resolve();
        });
    }

    private void zakonczMowienie(String blad) {
        PluginCall wywolanie = aktywneMowienie;
        aktywneMowienie = null;
        if (wywolanie == null) return;
        if (blad == null) wywolanie.resolve();
        else wywolanie.reject(blad, "ANULOWANO");
    }

    private void zakonczRozpoznawanie(String komunikat, String kod) {
        if (przekroczenieCzasu != null) obslugaCzasu.removeCallbacks(przekroczenieCzasu);
        przekroczenieCzasu = null;
        if (rozpoznawanie != null) {
            rozpoznawanie.cancel();
            rozpoznawanie.destroy();
            rozpoznawanie = null;
        }
        PluginCall wywolanie = aktywneRozpoznawanie;
        aktywneRozpoznawanie = null;
        if (wywolanie != null) wywolanie.reject(komunikat, kod);
    }

    private void zakonczRozpoznawanieWynikiem(String tekst) {
        if (przekroczenieCzasu != null) obslugaCzasu.removeCallbacks(przekroczenieCzasu);
        przekroczenieCzasu = null;
        if (rozpoznawanie != null) {
            rozpoznawanie.destroy();
            rozpoznawanie = null;
        }
        PluginCall wywolanie = aktywneRozpoznawanie;
        aktywneRozpoznawanie = null;
        if (wywolanie == null) return;
        JSObject wynik = new JSObject();
        wynik.put("tekst", tekst);
        wywolanie.resolve(wynik);
    }

    private void powiadomStan(String stan) {
        JSObject dane = new JSObject();
        dane.put("stan", stan);
        notifyListeners("stanGlosu", dane);
    }

    private class SluchaczRozpoznawania implements RecognitionListener {
        @Override public void onReadyForSpeech(Bundle parametry) { powiadomStan("sluchanie"); }
        @Override public void onBeginningOfSpeech() { powiadomStan("sluchanie"); }
        @Override public void onRmsChanged(float poziom) {}
        @Override public void onBufferReceived(byte[] bufor) {}
        @Override public void onEndOfSpeech() { powiadomStan("transkrypcja"); }
        @Override public void onPartialResults(Bundle wyniki) {}
        @Override public void onEvent(int typ, Bundle parametry) {}

        @Override
        public void onResults(Bundle wyniki) {
            ArrayList<String> teksty = wyniki.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            String tekst = teksty == null || teksty.isEmpty() ? "" : teksty.get(0).trim();
            if (tekst.isEmpty()) zakonczRozpoznawanie("Nie rozpoznano wypowiedzi.", "BRAK_MOWY");
            else zakonczRozpoznawanieWynikiem(tekst);
        }

        @Override
        public void onError(int blad) {
            if (blad == SpeechRecognizer.ERROR_NO_MATCH || blad == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                zakonczRozpoznawanie("Nie usłyszałem wypowiedzi.", "BRAK_MOWY");
            } else if (blad == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                zakonczRozpoznawanie("Brak zgody na użycie mikrofonu.", "BRAK_ZGODY");
            } else if (blad == SpeechRecognizer.ERROR_AUDIO) {
                zakonczRozpoznawanie("Nie udało się odczytać dźwięku z mikrofonu.", "BLAD_MIKROFONU");
            } else if (blad == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) {
                zakonczRozpoznawanie("Usługa rozpoznawania mowy jest zajęta.", "USLUGA_ZAJETA");
            } else {
                zakonczRozpoznawanie("Usługa rozpoznawania mowy zgłosiła błąd.", "BLAD_STT");
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        getActivity().runOnUiThread(() -> {
            zakonczRozpoznawanie("Sesja głosowa została zakończona.", "ANULOWANO");
            if (syntezator != null) {
                syntezator.stop();
                syntezator.shutdown();
                syntezator = null;
            }
            zakonczMowienie("Sesja głosowa została zakończona.");
        });
        super.handleOnDestroy();
    }
}
