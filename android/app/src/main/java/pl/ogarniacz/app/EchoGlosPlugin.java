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
    private SpeechRecognizer rozpoznawanieBargeIn;
    private PluginCall aktywneRozpoznawanie;
    private TextToSpeech syntezator;
    private boolean syntezatorGotowy;
    private PluginCall aktywneMowienie;
    private Runnable przekroczenieCzasu;
    private long numerRozpoznawania;
    private long numerBargeIn;
    private boolean wykrytoBargeIn;
    private String tekstBargeIn;
    private String tekstMowienia = "";
    private String identyfikatorMowienia;

    @Override
    public void load() {
        getActivity().runOnUiThread(() -> syntezator = new TextToSpeech(getContext(), stan -> {
            if (stan != TextToSpeech.SUCCESS) return;
            int wynik = syntezator.setLanguage(new Locale("pl", "PL"));
            syntezatorGotowy = wynik != TextToSpeech.LANG_MISSING_DATA && wynik != TextToSpeech.LANG_NOT_SUPPORTED;
            syntezator.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String identyfikator) {
                    getActivity().runOnUiThread(() -> {
                        if (!czyAktualneMowienie(identyfikator)) return;
                        powiadomStan("mowienie");
                        uruchomWykrywanieBargeIn();
                    });
                }

                @Override public void onDone(String identyfikator) {
                    getActivity().runOnUiThread(() -> {
                        if (!czyAktualneMowienie(identyfikator)) return;
                        zakonczWykrywanieBargeIn();
                        zakonczMowienie(null);
                    });
                }

                @Override public void onStop(String identyfikator, boolean przerwane) {
                    getActivity().runOnUiThread(() -> {
                        if (!czyAktualneMowienie(identyfikator)) return;
                        if (!wykrytoBargeIn) zakonczWykrywanieBargeIn();
                        zakonczMowienie("Wypowiedź została przerwana.");
                    });
                }

                @Override public void onError(String identyfikator) {
                    getActivity().runOnUiThread(() -> {
                        if (!czyAktualneMowienie(identyfikator)) return;
                        zakonczWykrywanieBargeIn();
                        zakonczMowienie("Syntezator mowy nie odczytał odpowiedzi.");
                    });
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
            if (aktywneRozpoznawanie != null || rozpoznawanie != null) {
                wywolanie.reject("Sesja rozpoznawania mowy już trwa.", "SESJA_AKTYWNA");
                return;
            }
            if (wykrytoBargeIn) {
                if (tekstBargeIn != null) {
                    String tekst = tekstBargeIn;
                    tekstBargeIn = null;
                    wykrytoBargeIn = false;
                    wywolanie.resolve(wynikRozpoznawania(tekst));
                } else if (rozpoznawanieBargeIn != null) {
                    aktywneRozpoznawanie = wywolanie;
                } else {
                    wywolanie.reject("Nie usłyszałem wypowiedzi.", "BRAK_MOWY");
                }
                return;
            }
            if (rozpoznawanieBargeIn != null) {
                wywolanie.reject("Trwa przechwytywanie wypowiedzi przerywającej Echo.", "SESJA_STT_AKTYWNA");
                return;
            }
            aktywneRozpoznawanie = wywolanie;
            long numerSesji = ++numerRozpoznawania;
            rozpoznawanie = SpeechRecognizer.createSpeechRecognizer(getContext());
            rozpoznawanie.setRecognitionListener(new SluchaczRozpoznawania(numerSesji));
            Intent zamiar = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            zamiar.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            zamiar.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pl-PL");
            zamiar.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "pl-PL");
            zamiar.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            zamiar.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            int zadanyLimit = wywolanie.getInt("limitMs", DOMYSLNY_LIMIT_NASLUCHIWANIA_MS);
            int limit = Math.max(3000, Math.min(30000, zadanyLimit));
            int zadanyLimitPauzy = wywolanie.getInt("limitPauzyMs", 4000);
            int limitPauzy = Math.max(500, Math.min(5000, zadanyLimitPauzy));
            zamiar.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, limitPauzy);
            zamiar.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, limitPauzy);
            przekroczenieCzasu = () -> {
                if (czyAktualneRozpoznawanie(numerSesji)) zakonczRozpoznawanie("Przekroczono czas oczekiwania na wypowiedź.", "TIMEOUT");
            };
            obslugaCzasu.postDelayed(przekroczenieCzasu, limit);
            rozpoznawanie.startListening(zamiar);
            powiadomStan("sluchanie");
        });
    }

    @PluginMethod
    public void anulujNasluchiwanie(PluginCall wywolanie) {
        getActivity().runOnUiThread(() -> {
            zakonczRozpoznawanie("Nasłuchiwanie anulowano.", "ANULOWANO");
            wykrytoBargeIn = false;
            tekstBargeIn = null;
            zakonczWykrywanieBargeIn();
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
            if (aktywneRozpoznawanie != null || rozpoznawanie != null) {
                wywolanie.reject("Nie można rozpocząć odczytu podczas rozpoznawania mowy.", "SESJA_STT_AKTYWNA");
                return;
            }
            if (aktywneMowienie != null) {
                zakonczWykrywanieBargeIn();
                if (syntezator != null) syntezator.stop();
                zakonczMowienie("Wypowiedź została przerwana.");
            }
            aktywneMowienie = wywolanie;
            tekstMowienia = tekst;
            wykrytoBargeIn = false;
            tekstBargeIn = null;
            String identyfikator = "echo-" + System.nanoTime();
            identyfikatorMowienia = identyfikator;
            if (syntezator.speak(tekst, TextToSpeech.QUEUE_FLUSH, null, identyfikator) == TextToSpeech.ERROR) {
                zakonczMowienie("Nie udało się uruchomić syntezatora mowy.");
                return;
            }
        });
    }

    @PluginMethod
    public void zatrzymajMowienie(PluginCall wywolanie) {
        getActivity().runOnUiThread(() -> {
            wykrytoBargeIn = false;
            tekstBargeIn = null;
            zakonczWykrywanieBargeIn();
            if (syntezator != null) syntezator.stop();
            zakonczMowienie("Wypowiedź została przerwana.");
            wywolanie.resolve();
        });
    }

    private void zakonczMowienie(String blad) {
        PluginCall wywolanie = aktywneMowienie;
        aktywneMowienie = null;
        identyfikatorMowienia = null;
        if (wywolanie == null) return;
        if (blad == null) wywolanie.resolve();
        else wywolanie.reject(blad, "ANULOWANO");
    }

    private boolean czyAktualneMowienie(String identyfikator) {
        return aktywneMowienie != null && identyfikator.equals(identyfikatorMowienia);
    }

    private JSObject wynikRozpoznawania(String tekst) {
        JSObject wynik = new JSObject();
        wynik.put("tekst", tekst);
        return wynik;
    }

    private void zakonczRozpoznawanie(String komunikat, String kod) {
        if (przekroczenieCzasu != null) obslugaCzasu.removeCallbacks(przekroczenieCzasu);
        przekroczenieCzasu = null;
        if (rozpoznawanie != null) {
            rozpoznawanie.cancel();
            rozpoznawanie.destroy();
            rozpoznawanie = null;
        }
        numerRozpoznawania += 1;
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
        numerRozpoznawania += 1;
        PluginCall wywolanie = aktywneRozpoznawanie;
        aktywneRozpoznawanie = null;
        if (wywolanie == null) return;
        wywolanie.resolve(wynikRozpoznawania(tekst));
    }

    private void uruchomWykrywanieBargeIn() {
        if (aktywneMowienie == null || aktywneRozpoznawanie != null || rozpoznawanie != null || rozpoznawanieBargeIn != null || !SpeechRecognizer.isRecognitionAvailable(getContext())) return;
        long numerSesji = ++numerBargeIn;
        rozpoznawanieBargeIn = SpeechRecognizer.createSpeechRecognizer(getContext());
        rozpoznawanieBargeIn.setRecognitionListener(new SluchaczBargeIn(numerSesji));
        Intent zamiar = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        zamiar.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        zamiar.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pl-PL");
        zamiar.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "pl-PL");
        zamiar.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        zamiar.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        zamiar.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1200);
        rozpoznawanieBargeIn.startListening(zamiar);
    }

    private void zakonczWykrywanieBargeIn() {
        if (rozpoznawanieBargeIn != null) {
            rozpoznawanieBargeIn.cancel();
            rozpoznawanieBargeIn.destroy();
            rozpoznawanieBargeIn = null;
        }
        numerBargeIn += 1;
        if (!wykrytoBargeIn) tekstMowienia = "";
    }

    private boolean czyAktualneRozpoznawanie(long numerSesji) {
        return numerSesji == numerRozpoznawania && rozpoznawanie != null && aktywneRozpoznawanie != null;
    }

    private boolean czyAktualnyBargeIn(long numerSesji) {
        return numerSesji == numerBargeIn && rozpoznawanieBargeIn != null;
    }

    private String normalizujTekst(String tekst) {
        return tekst.toLowerCase(new Locale("pl", "PL"))
            .replace('ł', 'l')
            .replaceAll("[^a-z0-9\\s]", " ")
            .trim()
            .replaceAll("\\s+", " ");
    }

    private boolean czyPotwierdzonyBargeIn(String tekst) {
        String uproszczony = normalizujTekst(tekst);
        String odczytywany = normalizujTekst(tekstMowienia);
        return uproszczony.split(" ").length >= 2
            && !odczytywany.contains(uproszczony)
            && !uproszczony.contains(odczytywany);
    }

    private class SluchaczBargeIn implements RecognitionListener {
        private final long numerSesji;

        SluchaczBargeIn(long numerSesji) {
            this.numerSesji = numerSesji;
        }

        @Override public void onReadyForSpeech(Bundle parametry) {}
        @Override public void onBeginningOfSpeech() {}
        @Override public void onRmsChanged(float poziom) {}
        @Override public void onBufferReceived(byte[] bufor) {}
        @Override public void onEndOfSpeech() {}
        @Override public void onEvent(int typ, Bundle parametry) {}

        @Override public void onPartialResults(Bundle wyniki) {
            if (!czyAktualnyBargeIn(numerSesji) || aktywneMowienie == null) return;
            String tekst = tekstRozpoznania(wyniki);
            if (wykrytoBargeIn || !czyPotwierdzonyBargeIn(tekst)) return;
            wykrytoBargeIn = true;
            powiadomStan("bargeIn");
            if (syntezator != null) syntezator.stop();
        }

        @Override public void onResults(Bundle wyniki) {
            if (!czyAktualnyBargeIn(numerSesji)) return;
            String tekst = tekstRozpoznania(wyniki);
            if (!wykrytoBargeIn || tekst.isEmpty()) {
                zakonczWykrywanieBargeIn();
                return;
            }
            zakonczWykrywanieBargeIn();
            tekstMowienia = "";
            PluginCall wywolanie = aktywneRozpoznawanie;
            aktywneRozpoznawanie = null;
            if (wywolanie != null) wywolanie.resolve(wynikRozpoznawania(tekst));
            else tekstBargeIn = tekst;
        }

        @Override public void onError(int blad) {
            if (!czyAktualnyBargeIn(numerSesji)) return;
            if (wykrytoBargeIn && aktywneRozpoznawanie != null) {
                PluginCall wywolanie = aktywneRozpoznawanie;
                aktywneRozpoznawanie = null;
                wywolanie.reject("Nie usłyszałem wypowiedzi.", "BRAK_MOWY");
            }
            wykrytoBargeIn = false;
            tekstBargeIn = null;
            zakonczWykrywanieBargeIn();
        }
    }

    private void powiadomStan(String stan) {
        powiadomStan(stan, null);
    }

    private void powiadomStan(String stan, String tekst) {
        JSObject dane = new JSObject();
        dane.put("stan", stan);
        if (tekst != null) dane.put("tekst", tekst);
        notifyListeners("stanGlosu", dane);
    }

    private String tekstRozpoznania(Bundle wyniki) {
        ArrayList<String> teksty = wyniki.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return teksty == null || teksty.isEmpty() ? "" : teksty.get(0).trim();
    }

    private class SluchaczRozpoznawania implements RecognitionListener {
        private final long numerSesji;

        SluchaczRozpoznawania(long numerSesji) {
            this.numerSesji = numerSesji;
        }

        @Override public void onReadyForSpeech(Bundle parametry) { if (czyAktualneRozpoznawanie(numerSesji)) powiadomStan("sluchanie"); }
        @Override public void onBeginningOfSpeech() { if (czyAktualneRozpoznawanie(numerSesji)) powiadomStan("mowiUzytkownik"); }
        @Override public void onRmsChanged(float poziom) {}
        @Override public void onBufferReceived(byte[] bufor) {}
        @Override public void onEndOfSpeech() { if (czyAktualneRozpoznawanie(numerSesji)) powiadomStan("transkrypcja"); }
        @Override public void onPartialResults(Bundle wyniki) {
            if (!czyAktualneRozpoznawanie(numerSesji)) return;
            String tekst = tekstRozpoznania(wyniki);
            if (!tekst.isEmpty()) powiadomStan("mowiUzytkownik", tekst);
        }
        @Override public void onEvent(int typ, Bundle parametry) {}

        @Override
        public void onResults(Bundle wyniki) {
            if (!czyAktualneRozpoznawanie(numerSesji)) return;
            String tekst = tekstRozpoznania(wyniki);
            if (tekst.isEmpty()) zakonczRozpoznawanie("Nie rozpoznano wypowiedzi.", "BRAK_MOWY");
            else zakonczRozpoznawanieWynikiem(tekst);
        }

        @Override
        public void onError(int blad) {
            if (!czyAktualneRozpoznawanie(numerSesji)) return;
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
            zakonczWykrywanieBargeIn();
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
