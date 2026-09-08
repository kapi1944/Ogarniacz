package pl.ogarniacz.app;

import android.Manifest;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import ai.picovoice.porcupine.PorcupineException;
import ai.picovoice.porcupine.PorcupineManager;
import java.io.IOException;

@CapacitorPlugin(
    name = "WakeWordEcho",
    permissions = { @Permission(alias = "mikrofon", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class WakeWordEchoPlugin extends Plugin {
    private static final String UPRAWNIENIE_MIKROFONU = "mikrofon";
    private static final String PLIK_FRAZY = "echo/hej_echo_android.ppn";
    private PorcupineManager silnik;
    private boolean nasluchAktywny;

    @PluginMethod
    public void sprawdzStan(PluginCall wywolanie) {
        wywolanie.resolve(informacjaOStanie(stanKonfiguracji(), komunikatKonfiguracji()));
    }

    @PluginMethod
    public void uruchom(PluginCall wywolanie) {
        String stanKonfiguracji = stanKonfiguracji();
        if ("aktywny".equals(stanKonfiguracji)) {
            wywolanie.resolve();
            return;
        }
        if (!"zatrzymany".equals(stanKonfiguracji)) {
            String komunikat = komunikatKonfiguracji();
            powiadomStan(stanKonfiguracji, komunikat);
            wywolanie.reject(komunikat, "BRAK_KONFIGURACJI_WAKE_WORD");
            return;
        }
        if (getPermissionState(UPRAWNIENIE_MIKROFONU) != PermissionState.GRANTED) {
            requestPermissionForAlias(UPRAWNIENIE_MIKROFONU, wywolanie, "poZgodzieMikrofonu");
            return;
        }
        uruchomSilnik(wywolanie);
    }

    @PermissionCallback
    private void poZgodzieMikrofonu(PluginCall wywolanie) {
        if (getPermissionState(UPRAWNIENIE_MIKROFONU) != PermissionState.GRANTED) {
            String komunikat = "Brak zgody na użycie mikrofonu przez „Hej Echo”.";
            powiadomStan("niedostepny", komunikat);
            wywolanie.reject(komunikat, "BRAK_ZGODY");
            return;
        }
        uruchomSilnik(wywolanie);
    }

    private void uruchomSilnik(PluginCall wywolanie) {
        getActivity().runOnUiThread(() -> {
            if (nasluchAktywny) {
                wywolanie.resolve();
                return;
            }
            powiadomStan("uruchamianie", null);
            try {
                if (silnik == null) {
                    silnik = new PorcupineManager.Builder()
                        .setAccessKey(BuildConfig.PICOVOICE_ACCESS_KEY)
                        .setKeywordPath(PLIK_FRAZY)
                        .setSensitivity(0.65f)
                        .build(getContext(), indeks -> obsluzWykrycie());
                }
                silnik.start();
                nasluchAktywny = true;
                powiadomStan("aktywny", "Porcupine nasłuchuje lokalnie frazy „Hej Echo”.");
                wywolanie.resolve();
            } catch (PorcupineException blad) {
                zwolnijSilnik();
                String komunikat = "Nie udało się uruchomić lokalnego silnika „Hej Echo”.";
                powiadomStan("blad", komunikat);
                wywolanie.reject(komunikat, "BLAD_WAKE_WORD", blad);
            }
        });
    }

    private void obsluzWykrycie() {
        getActivity().runOnUiThread(() -> {
            try {
                if (silnik != null && nasluchAktywny) silnik.stop();
                nasluchAktywny = false;
                powiadomStan("zatrzymany", null);
                notifyListeners("wykrytoFraze", new JSObject());
            } catch (PorcupineException blad) {
                nasluchAktywny = false;
                powiadomStan("blad", "Nie udało się zwolnić mikrofonu po wykryciu frazy.");
            }
        });
    }

    @PluginMethod
    public void zatrzymaj(PluginCall wywolanie) {
        getActivity().runOnUiThread(() -> {
            zwolnijSilnik();
            powiadomStan("zatrzymany", null);
            wywolanie.resolve();
        });
    }

    private void zwolnijSilnik() {
        if (silnik == null) {
            nasluchAktywny = false;
            return;
        }
        try {
            if (nasluchAktywny) silnik.stop();
        } catch (PorcupineException ignored) {
            // Stan jest czyszczony niezależnie od błędu zwalniania wejścia audio.
        }
        silnik.delete();
        silnik = null;
        nasluchAktywny = false;
    }

    private String stanKonfiguracji() {
        if (BuildConfig.PICOVOICE_ACCESS_KEY == null || BuildConfig.PICOVOICE_ACCESS_KEY.trim().isEmpty()) return "brakKonfiguracji";
        if (!czyIstniejeAsset(PLIK_FRAZY)) return "brakKonfiguracji";
        return nasluchAktywny ? "aktywny" : "zatrzymany";
    }

    private String komunikatKonfiguracji() {
        if (BuildConfig.PICOVOICE_ACCESS_KEY == null || BuildConfig.PICOVOICE_ACCESS_KEY.trim().isEmpty()) {
            return "Brak prywatnego PICOVOICE_ACCESS_KEY w konfiguracji builda.";
        }
        if (!czyIstniejeAsset(PLIK_FRAZY)) return "Brak modelu frazy assets/" + PLIK_FRAZY + ".";
        return nasluchAktywny ? "Porcupine nasłuchuje lokalnie frazy „Hej Echo”." : "Silnik Porcupine jest skonfigurowany.";
    }

    private boolean czyIstniejeAsset(String sciezka) {
        try {
            getContext().getAssets().open(sciezka).close();
            return true;
        } catch (IOException blad) {
            return false;
        }
    }

    private JSObject informacjaOStanie(String stan, String komunikat) {
        JSObject dane = new JSObject();
        dane.put("stan", stan);
        if (komunikat != null) dane.put("komunikat", komunikat);
        return dane;
    }

    private void powiadomStan(String stan, String komunikat) {
        notifyListeners("stanWakeWord", informacjaOStanie(stan, komunikat));
    }

    @Override
    protected void handleOnDestroy() {
        getActivity().runOnUiThread(this::zwolnijSilnik);
        super.handleOnDestroy();
    }
}
