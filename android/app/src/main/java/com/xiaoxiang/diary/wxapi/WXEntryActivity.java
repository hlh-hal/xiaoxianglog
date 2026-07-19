package com.xiaoxiang.diary.wxapi;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

import com.tencent.mm.opensdk.modelbase.BaseReq;
import com.tencent.mm.opensdk.modelbase.BaseResp;
import com.tencent.mm.opensdk.openapi.IWXAPI;
import com.tencent.mm.opensdk.openapi.IWXAPIEventHandler;
import com.tencent.mm.opensdk.openapi.WXAPIFactory;
import com.xiaoxiang.diary.XiangWechatPlugin;

public class WXEntryActivity extends Activity implements IWXAPIEventHandler {
    private IWXAPI api;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        api = WXAPIFactory.createWXAPI(this, XiangWechatPlugin.getPendingAppId(this), true);
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (api == null || intent == null || !api.handleIntent(intent, this)) {
            finish();
        }
    }

    @Override
    public void onReq(BaseReq request) {
        finish();
    }

    @Override
    public void onResp(BaseResp response) {
        XiangWechatPlugin.deliverWechatResponse(getApplicationContext(), response);
        finish();
    }
}
