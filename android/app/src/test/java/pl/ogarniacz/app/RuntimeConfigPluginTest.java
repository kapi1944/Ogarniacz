package pl.ogarniacz.app;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class RuntimeConfigPluginTest {
    @Test
    public void pluginUdostepniaWartosciZBuildConfig() {
        assertEquals(BuildConfig.SYNC_API_URL, RuntimeConfigPlugin.pobierzSyncApiUrl());
        assertEquals(BuildConfig.ANDROID_UPDATE_MANIFEST_URL, RuntimeConfigPlugin.pobierzAdresManifestuApk());
        assertEquals(BuildConfig.ANDROID_WEB_UPDATE_MANIFEST_URL, RuntimeConfigPlugin.pobierzAdresManifestuWeb());
    }
}
