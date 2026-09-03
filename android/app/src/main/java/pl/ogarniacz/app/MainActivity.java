package pl.ogarniacz.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle zapisanyStan) {
        registerPlugin(OdbiorUdostepnianiaPlugin.class);
        super.onCreate(zapisanyStan);
    }
}
