package com.xiaoxiang.diary;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalVaultPlugin.class);
        registerPlugin(XiangNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
