package pl.ogarniacz.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle zapisanyStan) {
        MagazynAktualizacjiWeb.przygotujStart(this);
        registerPlugin(AktualizacjePlugin.class);
        registerPlugin(AktualizacjeWebPlugin.class);
        registerPlugin(EchoGlosPlugin.class);
        registerPlugin(WakeWordEchoPlugin.class);
        registerPlugin(OdbiorUdostepnianiaPlugin.class);
        super.onCreate(zapisanyStan);
        MagazynAktualizacjiWeb.zastosujPoStarcie(getBridge(), this);
    }
}
