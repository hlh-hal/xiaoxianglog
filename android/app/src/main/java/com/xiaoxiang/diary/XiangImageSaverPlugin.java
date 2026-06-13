package com.xiaoxiang.diary;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(
    name = "XiangImageSaver",
    permissions = {
        @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage")
    }
)
public class XiangImageSaverPlugin extends Plugin {
    private static final String ALBUM_DIR = "Xiaoxiang Log";

    @PluginMethod
    public void savePngBase64(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermissionCallback");
            return;
        }

        try {
            String base64 = call.getString("base64", "");
            String fileName = safePngFileName(call.getString("fileName", "xiaoxiang-log.png"));
            if (base64.trim().isEmpty()) {
                call.reject("base64 is required");
                return;
            }

            int commaIndex = base64.indexOf(',');
            String payload = commaIndex >= 0 ? base64.substring(commaIndex + 1) : base64;
            byte[] bytes = Base64.decode(payload, Base64.DEFAULT);
            if (bytes.length == 0) {
                call.reject("image data is empty");
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveWithMediaStore(call, fileName, bytes);
            } else {
                saveLegacy(call, fileName, bytes);
            }
        } catch (Exception error) {
            call.reject("Save image failed", error);
        }
    }

    @PermissionCallback
    private void storagePermissionCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) {
            savePngBase64(call);
        } else {
            call.reject("Storage permission denied");
        }
    }

    private void saveWithMediaStore(PluginCall call, String fileName, byte[] bytes) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + ALBUM_DIR);
        values.put(MediaStore.Images.Media.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            throw new IllegalStateException("Could not create image in MediaStore");
        }

        try {
            try (OutputStream output = resolver.openOutputStream(uri, "w")) {
                if (output == null) {
                    throw new IllegalStateException("Could not open image output stream");
                }
                output.write(bytes);
                output.flush();
            }

            values.clear();
            values.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(uri, values, null, null);

            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            result.put("size", bytes.length);
            call.resolve(result);
        } catch (Exception error) {
            resolver.delete(uri, null, null);
            throw error;
        }
    }

    private void saveLegacy(PluginCall call, String fileName, byte[] bytes) throws Exception {
        File picturesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
        File albumDir = new File(picturesDir, ALBUM_DIR);
        if (!albumDir.exists() && !albumDir.mkdirs()) {
            throw new IllegalStateException("Could not create image export directory");
        }

        File target = uniqueFile(albumDir, fileName);
        try (FileOutputStream output = new FileOutputStream(target)) {
            output.write(bytes);
            output.flush();
        }

        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DATA, target.getAbsolutePath());
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
        values.put(MediaStore.Images.Media.DISPLAY_NAME, target.getName());
        getContext().getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);

        JSObject result = new JSObject();
        result.put("path", target.getAbsolutePath());
        result.put("size", bytes.length);
        call.resolve(result);
    }

    private File uniqueFile(File directory, String fileName) {
        File target = new File(directory, fileName);
        if (!target.exists()) {
            return target;
        }

        String baseName = fileName.substring(0, fileName.length() - 4);
        for (int index = 1; index < 1000; index++) {
            File candidate = new File(directory, baseName + "-" + index + ".png");
            if (!candidate.exists()) {
                return candidate;
            }
        }

        return new File(directory, baseName + "-" + System.currentTimeMillis() + ".png");
    }

    private String safePngFileName(String fileName) {
        String name = fileName == null ? "" : fileName.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "").trim();
        if (name.isEmpty()) {
            name = "xiaoxiang-log.png";
        }
        if (!name.toLowerCase().endsWith(".png")) {
            name = name + ".png";
        }
        return name;
    }
}
