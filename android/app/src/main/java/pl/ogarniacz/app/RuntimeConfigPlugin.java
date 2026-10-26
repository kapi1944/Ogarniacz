package pl.ogarniacz.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RuntimeConfig")
public class RuntimeConfigPlugin extends Plugin {
    @PluginMethod
    public void pobierzKonfiguracje(PluginCall wywolanie) {
        JSObject konfiguracja = new JSObject();
        konfiguracja.put("kanalBeta", BuildConfig.KANAL_BETA);
        konfiguracja.put("syncApiUrl", pobierzSyncApiUrl());
        konfiguracja.put("androidUpdateManifestUrl", pobierzAdresManifestuApk());
        wywolanie.resolve(konfiguracja);
    }

    static String pobierzSyncApiUrl() { return BuildConfig.SYNC_API_URL; }
    static String pobierzAdresManifestuApk() { return BuildConfig.ANDROID_UPDATE_MANIFEST_URL; }
}
