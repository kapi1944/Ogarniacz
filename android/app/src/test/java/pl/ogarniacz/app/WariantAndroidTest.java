package pl.ogarniacz.app;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.pm.ProviderInfo;
import android.content.res.XmlResourceParser;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class WariantAndroidTest {
    @Test public void pakietDaneProviderOrazLinkiOdpowiadajaWariantowi() throws Exception {
        Context kontekst = RuntimeEnvironment.getApplication();
        String pakiet = BuildConfig.KANAL_BETA ? "pl.ogarniacz.app.beta" : "pl.ogarniacz.app";
        assertEquals(pakiet, BuildConfig.APPLICATION_ID);
        assertEquals(pakiet, kontekst.getPackageName());
        assertTrue(kontekst.getFilesDir().getAbsolutePath().contains(pakiet));
        ProviderInfo dostawca = kontekst.getPackageManager().resolveContentProvider(pakiet + ".fileprovider", PackageManager.GET_META_DATA);
        assertNotNull(dostawca);
        assertEquals(pakiet, dostawca.packageName);
        assertFalse(dostawca.exported);
        assertEquals(BuildConfig.KANAL_BETA ? "Ogarniacz Beta" : "Ogarniacz", kontekst.getString(R.string.app_name));
        XmlResourceParser skroty = kontekst.getResources().getXml(R.xml.shortcuts);
        int liczba = 0;
        while (skroty.next() != XmlResourceParser.END_DOCUMENT) {
            if (skroty.getEventType() == XmlResourceParser.START_TAG && "intent".equals(skroty.getName())) {
                assertEquals(pakiet, skroty.getAttributeValue("http://schemas.android.com/apk/res/android", "targetPackage"));
                assertTrue(skroty.getAttributeValue("http://schemas.android.com/apk/res/android", "data").startsWith(BuildConfig.KANAL_BETA ? "ogarniacz-beta://" : "ogarniacz://"));
                liczba++;
            }
        }
        skroty.close();
        assertEquals(4, liczba);
        if (BuildConfig.KANAL_BETA) {
            assertEquals("", RuntimeConfigPlugin.pobierzSyncApiUrl());
            assertEquals("", RuntimeConfigPlugin.pobierzAdresManifestuApk());
        }
    }
}
