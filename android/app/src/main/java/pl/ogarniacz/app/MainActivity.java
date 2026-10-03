package pl.ogarniacz.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.ServerPath;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle zapisanyStan) {
        MagazynAktualizacjiWeb.przygotujStart(this);
        bridgeBuilder.setServerPath(new ServerPath(ServerPath.PathType.ASSET_PATH, "public"));
        registerPlugin(RuntimeConfigPlugin.class);
        registerPlugin(AktualizacjePlugin.class);

        registerPlugin(EchoGlosPlugin.class);
        registerPlugin(WakeWordEchoPlugin.class);
        registerPlugin(OdbiorUdostepnianiaPlugin.class);
        super.onCreate(zapisanyStan);

    }
}
