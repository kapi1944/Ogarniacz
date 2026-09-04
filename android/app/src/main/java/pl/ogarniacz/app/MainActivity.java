package pl.ogarniacz.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle zapisanyStan) {
        registerPlugin(AktualizacjePlugin.class);
        registerPlugin(EchoGlosPlugin.class);
        registerPlugin(OdbiorUdostepnianiaPlugin.class);
        super.onCreate(zapisanyStan);
    }
}
