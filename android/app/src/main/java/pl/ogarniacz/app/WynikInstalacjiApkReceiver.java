package pl.ogarniacz.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;

public class WynikInstalacjiApkReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context kontekst, Intent intencja) {
        int statusAndroida = intencja.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String komunikat = intencja.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        Intent potwierdzenie = statusAndroida == PackageInstaller.STATUS_PENDING_USER_ACTION
            ? pobierzPotwierdzenie(intencja) : null;
        StanInstalacjiApk.zapiszWynikSystemu(kontekst,
            intencja.getStringExtra("wersjaDocelowa"), intencja.getLongExtra("versionCodeDocelowy", 0),
            intencja.getIntExtra("sessionId", -1), statusAndroida, komunikat, potwierdzenie);
        AktualizacjePlugin.powiadomOStatusieInstalacji(kontekst);
    }

    private Intent pobierzPotwierdzenie(Intent intencja) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            ? intencja.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class)
            : intencja.getParcelableExtra(Intent.EXTRA_INTENT);
    }
}
