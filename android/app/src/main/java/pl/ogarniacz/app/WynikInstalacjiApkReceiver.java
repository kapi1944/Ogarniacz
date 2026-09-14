package pl.ogarniacz.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

public class WynikInstalacjiApkReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context kontekst, Intent intencja) {
        int statusAndroida = intencja.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String komunikat = intencja.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        String status = StanInstalacjiApk.mapujStatus(statusAndroida, komunikat);
        StanInstalacjiApk.zapisz(kontekst, intencja.getStringExtra("wersjaDocelowa"), intencja.getLongExtra("versionCodeDocelowy", 0), intencja.getIntExtra("sessionId", -1), status, statusAndroida, komunikat);
        if (statusAndroida == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent potwierdzenie = intencja.getParcelableExtra(Intent.EXTRA_INTENT);
            if (potwierdzenie != null) { potwierdzenie.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); kontekst.startActivity(potwierdzenie); }
        }
        AktualizacjePlugin.powiadomOStatusieInstalacji(kontekst);
    }
}
