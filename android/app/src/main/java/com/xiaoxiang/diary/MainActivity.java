package com.xiaoxiang.diary;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int APP_SURFACE_COLOR = Color.parseColor("#FAF9F5");

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalVaultPlugin.class);
        registerPlugin(XiangNotificationsPlugin.class);
        registerPlugin(XiangImageSaverPlugin.class);
        registerPlugin(XiangUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        configureSystemBars();
        disableWebViewOverscroll();
    }

    private void configureSystemBars() {
        Window window = getWindow();
        View rootView = window.getDecorView();

        window.setStatusBarColor(APP_SURFACE_COLOR);
        window.setNavigationBarColor(APP_SURFACE_COLOR);
        rootView.setBackgroundColor(APP_SURFACE_COLOR);

        int systemUiFlags = rootView.getSystemUiVisibility();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            systemUiFlags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            systemUiFlags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        rootView.setSystemUiVisibility(systemUiFlags);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        WebView webView = getBridge().getWebView();
        if (webView != null) {
            configureWebViewAppearance(webView);
        }
    }

    private void configureWebViewAppearance(WebView webView) {
        webView.setBackgroundColor(APP_SURFACE_COLOR);

        WebSettings settings = webView.getSettings();
        if (settings == null) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            settings.setAlgorithmicDarkeningAllowed(false);
        }
    }

    private void disableWebViewOverscroll() {
        View rootView = getWindow().getDecorView();
        rootView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        }
    }
}
