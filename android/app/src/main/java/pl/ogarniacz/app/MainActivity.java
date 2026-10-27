package pl.ogarniacz.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.ServerPath;

public class MainActivity extends BridgeActivity {
    BlokadaAplikacji blokada;

    @Override
    public void onPause() {
        if (blokada != null) blokada.wTle();
        super.onPause();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (blokada != null) blokada.wznow();
    }

    @Override
    protected void onCreate(Bundle zapisanyStan) {
        MigracjaPozostalosciWebOta.wykonaj(this);
        bridgeBuilder.setServerPath(new ServerPath(ServerPath.PathType.ASSET_PATH, "public"));
        registerPlugin(BlokadaAplikacjiPlugin.class);
        registerPlugin(RuntimeConfigPlugin.class);
        registerPlugin(AktualizacjePlugin.class);

        registerPlugin(EchoGlosPlugin.class);
        registerPlugin(WakeWordEchoPlugin.class);
        registerPlugin(OdbiorUdostepnianiaPlugin.class);
        registerPlugin(EksportPlikuPlugin.class);
        super.onCreate(zapisanyStan);
        blokada = new BlokadaAplikacji(this);
        blokada.wznow();

    }
}
