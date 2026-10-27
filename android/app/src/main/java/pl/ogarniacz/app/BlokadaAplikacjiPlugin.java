package pl.ogarniacz.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BlokadaAplikacji")
public class BlokadaAplikacjiPlugin extends Plugin {
    @PluginMethod
    public void otworzUstawienia(PluginCall wywolanie) {
        getActivity().runOnUiThread(() -> {
            ((MainActivity) getActivity()).blokada.otworzUstawienia();
            wywolanie.resolve();
        });
    }
}
