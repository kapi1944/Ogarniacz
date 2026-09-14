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
        konfiguracja.put("syncApiUrl", pobierzSyncApiUrl());
        konfiguracja.put("androidUpdateManifestUrl", pobierzAdresManifestuApk());
        konfiguracja.put("androidWebUpdateManifestUrl", pobierzAdresManifestuWeb());
        wywolanie.resolve(konfiguracja);
    }

    static String pobierzSyncApiUrl() { return BuildConfig.SYNC_API_URL; }
    static String pobierzAdresManifestuApk() { return BuildConfig.ANDROID_UPDATE_MANIFEST_URL; }
    static String pobierzAdresManifestuWeb() { return BuildConfig.ANDROID_WEB_UPDATE_MANIFEST_URL; }
}
