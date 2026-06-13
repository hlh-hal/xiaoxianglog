package com.xiaoxiang.diary;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.URLUtil;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "XiangUpdater")
public class XiangUpdaterPlugin extends Plugin {
    private static final String APK_MIME_TYPE = "application/vnd.android.package-archive";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url", "");
        String fileName = call.getString("fileName", "xiaoxiang-log-latest.apk");

        if (url.trim().isEmpty()) {
            call.reject("url is required");
            return;
        }

        if (!URLUtil.isNetworkUrl(url)) {
            call.reject("Invalid APK download URL");
            return;
        }

        executor.execute(() -> {
            try {
                File apkFile = downloadApk(url, safeApkFileName(fileName));
                getActivity().runOnUiThread(() -> startInstall(call, apkFile));
            } catch (Exception error) {
                getActivity().runOnUiThread(() -> call.reject("APK download failed", error));
            }
        });
    }

    private File downloadApk(String urlString, String fileName) throws Exception {
        File updateDir = new File(getContext().getCacheDir(), "updates");
        if (!updateDir.exists() && !updateDir.mkdirs()) {
            throw new IllegalStateException("Could not create update cache directory");
        }

        File target = new File(updateDir, fileName);
        File temp = new File(updateDir, fileName + ".download");
        if (temp.exists() && !temp.delete()) {
            throw new IllegalStateException("Could not clear previous download");
        }

        HttpURLConnection connection = (HttpURLConnection) new URL(urlString).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(60000);
        connection.setRequestProperty("Accept", APK_MIME_TYPE);
        connection.connect();

        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            connection.disconnect();
            throw new IllegalStateException("APK download HTTP " + status);
        }

        try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temp)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            output.flush();
        } finally {
            connection.disconnect();
        }

        if (target.exists() && !target.delete()) {
            throw new IllegalStateException("Could not replace previous APK");
        }
        if (!temp.renameTo(target)) {
            throw new IllegalStateException("Could not finalize APK download");
        }

        return target;
    }

    private void startInstall(PluginCall call, File apkFile) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                .setData(Uri.parse("package:" + getContext().getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settingsIntent);

            JSObject result = new JSObject();
            result.put("status", "permission_required");
            result.put("path", apkFile.getAbsolutePath());
            result.put("message", "Install permission is required. Enable it, then tap update again.");
            call.resolve(result);
            return;
        }

        Uri apkUri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            apkFile
        );

        Intent installIntent = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(apkUri, APK_MIME_TYPE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        getContext().startActivity(installIntent);

        JSObject result = new JSObject();
        result.put("status", "install_started");
        result.put("path", apkFile.getAbsolutePath());
        call.resolve(result);
    }

    private String safeApkFileName(String fileName) {
        String name = fileName == null ? "" : fileName.replaceAll("[^A-Za-z0-9._-]", "");
        if (name.trim().isEmpty() || !name.endsWith(".apk")) {
            return "xiaoxiang-log-latest.apk";
        }
        return name;
    }
}
