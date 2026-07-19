package com.xiaoxiang.diary;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.tencent.mm.opensdk.modelbase.BaseResp;
import com.tencent.mm.opensdk.modelmsg.SendAuth;
import com.tencent.mm.opensdk.openapi.IWXAPI;
import com.tencent.mm.opensdk.openapi.WXAPIFactory;

import java.lang.ref.WeakReference;
import java.security.SecureRandom;

@CapacitorPlugin(name = "XiangWechat")
public class XiangWechatPlugin extends Plugin {
    private static final String PREFS_NAME = "xiaoxiang_wechat_auth";
    private static final String KEY_APP_ID = "app_id";
    private static final String KEY_PENDING_STATE = "pending_state";
    private static final String KEY_PENDING_AT = "pending_at";
    private static final String KEY_RESULT_STATE = "result_state";
    private static final String KEY_RESULT_CODE = "result_code";
    private static final String KEY_RESULT_ERR_CODE = "result_err_code";
    private static final String KEY_RESULT_AT = "result_at";
    private static final long AUTH_TIMEOUT_MS = 120_000L;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static WeakReference<XiangWechatPlugin> activeInstance = new WeakReference<>(null);

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private String pendingCallbackId;
    private Runnable timeoutRunnable;

    @Override
    public void load() {
        activeInstance = new WeakReference<>(this);
    }

    @Override
    protected void handleOnDestroy() {
        if (activeInstance.get() == this) {
            activeInstance.clear();
        }
        cancelTimeout();
    }

    @PluginMethod
    public void isInstalled(PluginCall call) {
        String appId = call.getString("appId", "");
        IWXAPI api = WXAPIFactory.createWXAPI(getContext(), appId, true);
        JSObject result = new JSObject();
        result.put("installed", api.isWXAppInstalled());
        result.put("supported", api.getWXAppSupportAPI() > 0);
        call.resolve(result);
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        String appId = call.getString("appId", "").trim();
        if (appId.isEmpty() || appId.length() > 128) {
            call.reject("微信 AppID 配置不正确", "INVALID_APP_ID");
            return;
        }
        if (pendingCallbackId != null) {
            call.reject("已有微信授权正在进行，请稍候", "AUTH_IN_PROGRESS");
            return;
        }

        IWXAPI api = WXAPIFactory.createWXAPI(getContext(), appId, true);
        if (!api.registerApp(appId)) {
            call.reject("微信登录初始化失败，请检查应用签名", "REGISTER_FAILED");
            return;
        }
        if (!api.isWXAppInstalled()) {
            call.reject("请先安装微信客户端", "WECHAT_NOT_INSTALLED");
            return;
        }

        String state = randomState();
        clearStoredResult(getContext());
        getPrefs(getContext()).edit()
            .putString(KEY_APP_ID, appId)
            .putString(KEY_PENDING_STATE, state)
            .putLong(KEY_PENDING_AT, System.currentTimeMillis())
            .apply();

        SendAuth.Req request = new SendAuth.Req();
        request.scope = "snsapi_userinfo";
        request.state = state;

        pendingCallbackId = call.getCallbackId();
        bridge.saveCall(call);
        if (!api.sendReq(request)) {
            clearStoredResult(getContext());
            finishPendingCall(null, "无法拉起微信，请稍后重试", "SEND_FAILED");
            return;
        }
        scheduleTimeout();
    }

    @PluginMethod
    public void consumePendingResult(PluginCall call) {
        SharedPreferences prefs = getPrefs(getContext());
        String pendingState = prefs.getString(KEY_PENDING_STATE, "");
        String resultState = prefs.getString(KEY_RESULT_STATE, "");
        String code = prefs.getString(KEY_RESULT_CODE, "");
        int errCode = prefs.getInt(KEY_RESULT_ERR_CODE, Integer.MIN_VALUE);
        long pendingAt = prefs.getLong(KEY_PENDING_AT, 0L);
        long resultAt = prefs.getLong(KEY_RESULT_AT, 0L);

        if (resultAt <= 0) {
            boolean pending = pendingAt > 0 && System.currentTimeMillis() - pendingAt <= AUTH_TIMEOUT_MS;
            if (!pending) clearStoredResult(getContext());
            JSObject result = new JSObject();
            result.put("available", false);
            result.put("pending", pending);
            call.resolve(result);
            return;
        }
        if (System.currentTimeMillis() - resultAt > AUTH_TIMEOUT_MS) {
            clearStoredResult(getContext());
            JSObject result = new JSObject();
            result.put("available", false);
            result.put("pending", false);
            call.resolve(result);
            return;
        }
        if (pendingState.isEmpty() || !pendingState.equals(resultState)) {
            clearStoredResult(getContext());
            call.reject("微信授权状态校验失败，请重新授权", "STATE_MISMATCH");
            return;
        }

        clearStoredResult(getContext());
        if (errCode == BaseResp.ErrCode.ERR_OK && !code.isEmpty()) {
            JSObject result = new JSObject();
            result.put("available", true);
            result.put("code", code);
            call.resolve(result);
            return;
        }
        rejectForWechatError(call, errCode);
    }

    public static void deliverWechatResponse(Context context, BaseResp response) {
        String pendingState = getPrefs(context).getString(KEY_PENDING_STATE, "");
        String resultState = response instanceof SendAuth.Resp ? ((SendAuth.Resp) response).state : "";
        String authCode = response instanceof SendAuth.Resp ? ((SendAuth.Resp) response).code : "";
        int errCode = response.errCode;

        if (pendingState.isEmpty() || !pendingState.equals(resultState)) {
            errCode = Integer.MIN_VALUE;
            authCode = "";
        }
        getPrefs(context).edit()
            .putString(KEY_RESULT_STATE, resultState == null ? "" : resultState)
            .putString(KEY_RESULT_CODE, authCode == null ? "" : authCode)
            .putInt(KEY_RESULT_ERR_CODE, errCode)
            .putLong(KEY_RESULT_AT, System.currentTimeMillis())
            .apply();

        XiangWechatPlugin plugin = activeInstance.get();
        if (plugin != null) {
            final int deliveredErrCode = errCode;
            final String deliveredCode = authCode;
            plugin.mainHandler.post(() -> plugin.handleWechatResponse(deliveredErrCode, deliveredCode));
        }
    }

    public static String getPendingAppId(Context context) {
        return getPrefs(context).getString(KEY_APP_ID, "");
    }

    private void handleWechatResponse(int errCode, String code) {
        if (pendingCallbackId == null) return;
        if (errCode == BaseResp.ErrCode.ERR_OK && code != null && !code.trim().isEmpty()) {
            JSObject result = new JSObject();
            result.put("code", code);
            finishPendingCall(result, null, null);
            clearStoredResult(getContext());
            return;
        }

        PluginCall call = bridge.getSavedCall(pendingCallbackId);
        String callbackId = pendingCallbackId;
        clearPendingCallState();
        clearStoredResult(getContext());
        if (call != null) {
            rejectForWechatError(call, errCode);
            bridge.releaseCall(callbackId);
        }
    }

    private void rejectForWechatError(PluginCall call, int errCode) {
        if (errCode == BaseResp.ErrCode.ERR_USER_CANCEL) {
            call.reject("已取消微信授权", "USER_CANCELLED");
        } else if (errCode == BaseResp.ErrCode.ERR_AUTH_DENIED) {
            call.reject("微信授权未通过，请重新授权", "AUTH_DENIED");
        } else if (errCode == Integer.MIN_VALUE) {
            call.reject("微信授权状态校验失败，请重新授权", "STATE_MISMATCH");
        } else {
            call.reject("微信授权失败，请稍后重试", "WECHAT_ERROR_" + errCode);
        }
    }

    private void finishPendingCall(JSObject result, String errorMessage, String errorCode) {
        String callbackId = pendingCallbackId;
        PluginCall call = callbackId == null ? null : bridge.getSavedCall(callbackId);
        clearPendingCallState();
        if (call == null) return;
        if (errorMessage != null) call.reject(errorMessage, errorCode);
        else call.resolve(result);
        bridge.releaseCall(callbackId);
    }

    private void clearPendingCallState() {
        cancelTimeout();
        pendingCallbackId = null;
    }

    private void scheduleTimeout() {
        timeoutRunnable = () -> {
            clearStoredResult(getContext());
            finishPendingCall(null, "微信授权等待超时，请重试", "AUTH_TIMEOUT");
        };
        mainHandler.postDelayed(timeoutRunnable, AUTH_TIMEOUT_MS);
    }

    private void cancelTimeout() {
        if (timeoutRunnable != null) {
            mainHandler.removeCallbacks(timeoutRunnable);
            timeoutRunnable = null;
        }
    }

    private static String randomState() {
        byte[] bytes = new byte[24];
        SECURE_RANDOM.nextBytes(bytes);
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) builder.append(String.format("%02x", value));
        return builder.toString();
    }

    private static SharedPreferences getPrefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static void clearStoredResult(Context context) {
        getPrefs(context).edit()
            .remove(KEY_APP_ID)
            .remove(KEY_PENDING_STATE)
            .remove(KEY_PENDING_AT)
            .remove(KEY_RESULT_STATE)
            .remove(KEY_RESULT_CODE)
            .remove(KEY_RESULT_ERR_CODE)
            .remove(KEY_RESULT_AT)
            .apply();
    }
}
