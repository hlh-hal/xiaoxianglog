package com.xiaoxiang.diary;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "LocalVault")
public class LocalVaultPlugin extends Plugin {
    private static final String PREFS_NAME = "xiaoxiang_local_vault";
    private static final String KEY_TREE_URI = "tree_uri";

    @PluginMethod
    public void chooseVaultDirectory(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "handleChooseVaultDirectory");
    }

    @ActivityCallback
    private void handleChooseVaultDirectory(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("用户取消了文件夹选择");
            return;
        }

        Uri treeUri = data.getData();
        int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
            getPrefs().edit().putString(KEY_TREE_URI, treeUri.toString()).apply();
            ensureVaultStructure();
            call.resolve(buildStatus(true));
        } catch (Exception error) {
            call.reject("无法保存本地文件夹授权", error);
        }
    }

    @PluginMethod
    public void getVaultStatus(PluginCall call) {
        call.resolve(buildStatus(false));
    }

    @PluginMethod
    public void writeTextFile(PluginCall call) {
        String path = call.getString("path");
        String content = call.getString("content", "");
        if (path == null || path.trim().isEmpty()) {
            call.reject("path is required");
            return;
        }

        try {
            DocumentFile file = getOrCreateFile(path, getMimeType(path, "text/plain"));
            writeBytes(file, content.getBytes(StandardCharsets.UTF_8));
            long size = verifiedSize(file, content.length() > 0, path);
            call.resolve(pathResult(path, size));
        } catch (Exception error) {
            call.reject("写入文本文件失败", error);
        }
    }

    @PluginMethod
    public void writeBase64File(PluginCall call) {
        String path = call.getString("path");
        String data = call.getString("base64");
        String mimeType = call.getString("mimeType", getMimeType(path, "application/octet-stream"));
        if (path == null || path.trim().isEmpty() || data == null) {
            call.reject("path and base64 are required");
            return;
        }

        try {
            String payload = data;
            int commaIndex = payload.indexOf(',');
            if (payload.startsWith("data:") && commaIndex >= 0) {
                payload = payload.substring(commaIndex + 1);
            }
            byte[] bytes = Base64.decode(payload, Base64.DEFAULT);
            DocumentFile file = getOrCreateFile(path, mimeType);
            writeBytes(file, bytes);
            long size = verifiedSize(file, bytes.length > 0, path);
            call.resolve(pathResult(path, size));
        } catch (Exception error) {
            call.reject("写入附件失败", error);
        }
    }

    @PluginMethod
    public void readTextFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) {
            call.reject("path is required");
            return;
        }

        try {
            DocumentFile file = findFile(path);
            if (file == null || !file.isFile()) {
                call.reject("文件不存在");
                return;
            }
            String content = new String(readBytes(file), StandardCharsets.UTF_8);
            JSObject result = pathResult(path);
            result.put("content", content);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("读取文件失败", error);
        }
    }

    @PluginMethod
    public void listMarkdownFiles(PluginCall call) {
        String rootPath = call.getString("root", "");
        try {
            DocumentFile root = rootPath.trim().isEmpty() ? requireVaultRoot() : findDirectory(rootPath, false);
            JSArray files = new JSArray();
            if (root != null && root.isDirectory()) {
                walkMarkdownFiles(root, normalizeDirectoryPath(rootPath), files);
            }
            JSObject result = new JSObject();
            result.put("files", files);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("列出 Markdown 文件失败", error);
        }
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) {
            call.reject("path is required");
            return;
        }

        try {
            DocumentFile file = findFile(path);
            boolean deleted = file == null || file.delete();
            JSObject result = pathResult(path);
            result.put("deleted", deleted);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("删除文件失败", error);
        }
    }

    @PluginMethod
    public void moveFile(PluginCall call) {
        String fromPath = call.getString("fromPath");
        String toPath = call.getString("toPath");
        if (fromPath == null || toPath == null || fromPath.trim().isEmpty() || toPath.trim().isEmpty()) {
            call.reject("fromPath and toPath are required");
            return;
        }

        try {
            DocumentFile source = findFile(fromPath);
            if (source == null || !source.isFile()) {
                call.reject("源文件不存在");
                return;
            }
            byte[] bytes = readBytes(source);
            DocumentFile target = getOrCreateFile(toPath, getMimeType(toPath, source.getType() == null ? "application/octet-stream" : source.getType()));
            writeBytes(target, bytes);
            verifiedSize(target, bytes.length > 0, toPath);
            source.delete();
            JSObject result = new JSObject();
            result.put("fromPath", fromPath);
            result.put("toPath", toPath);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("移动文件失败", error);
        }
    }

    private SharedPreferences getPrefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private DocumentFile requireVaultRoot() throws IOException {
        String uriString = getPrefs().getString(KEY_TREE_URI, null);
        if (uriString == null) {
            throw new IOException("尚未选择本地日志文件夹");
        }

        DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(uriString));
        if (root == null || !root.exists() || !root.isDirectory() || !root.canWrite()) {
            throw new IOException("本地日志文件夹不可用，请重新授权");
        }
        return root;
    }

    private void ensureVaultStructure() throws IOException {
        DocumentFile root = requireVaultRoot();
        findOrCreateDirectory(root, "用户日志");
        findOrCreateDirectory(root, "导出文件");
        DocumentFile attachments = findOrCreateDirectory(root, "附件");
        findOrCreateDirectory(attachments, "images");
        findOrCreateDirectory(root, "回收站");
        findOrCreateDirectory(root, ".xiaoxiang");
    }

    private JSObject buildStatus(boolean alreadyEnsured) {
        JSObject result = new JSObject();
        String uriString = getPrefs().getString(KEY_TREE_URI, null);
        result.put("supported", true);
        result.put("authorized", false);
        result.put("available", false);
        result.put("displayPath", "");
        result.put("treeUri", uriString == null ? "" : uriString);

        if (uriString == null) {
            return result;
        }

        try {
            if (!alreadyEnsured) {
                ensureVaultStructure();
            }
            Uri uri = Uri.parse(uriString);
            DocumentFile root = requireVaultRoot();
            result.put("authorized", true);
            result.put("available", true);
            result.put("displayPath", getReadableTreePath(uri, root.getName()));
        } catch (Exception ignored) {
            result.put("authorized", true);
        }
        return result;
    }

    private String getReadableTreePath(Uri uri, String fallbackName) {
        try {
            String treeId = DocumentsContract.getTreeDocumentId(uri);
            int colon = treeId.indexOf(':');
            if (colon >= 0 && colon < treeId.length() - 1) {
                return treeId.substring(colon + 1);
            }
            return treeId;
        } catch (Exception ignored) {
            return fallbackName == null ? "" : fallbackName;
        }
    }

    private DocumentFile getOrCreateFile(String path, String mimeType) throws IOException {
        String[] segments = cleanSegments(path, false);
        DocumentFile parent = requireVaultRoot();
        for (int i = 0; i < segments.length - 1; i++) {
            parent = findOrCreateDirectory(parent, segments[i]);
        }

        String fileName = segments[segments.length - 1];
        DocumentFile existing = findChild(parent, fileName);
        if (existing != null) {
            if (existing.isDirectory()) {
                throw new IOException("目标路径是目录");
            }
            return existing;
        }

        DocumentFile created = parent.createFile(mimeType, fileName);
        if (created == null) {
            throw new IOException("无法创建文件: " + path);
        }
        return created;
    }

    private DocumentFile findFile(String path) throws IOException {
        String[] segments = cleanSegments(path, false);
        DocumentFile current = requireVaultRoot();
        for (String segment : segments) {
            current = findChild(current, segment);
            if (current == null) {
                return null;
            }
        }
        return current;
    }

    private DocumentFile findDirectory(String path, boolean create) throws IOException {
        String[] segments = cleanSegments(path, true);
        DocumentFile current = requireVaultRoot();
        for (String segment : segments) {
            current = create ? findOrCreateDirectory(current, segment) : findChild(current, segment);
            if (current == null || !current.isDirectory()) {
                return null;
            }
        }
        return current;
    }

    private DocumentFile findOrCreateDirectory(DocumentFile parent, String name) throws IOException {
        DocumentFile existing = findChild(parent, name);
        if (existing != null) {
            if (!existing.isDirectory()) {
                throw new IOException("路径已存在但不是目录: " + name);
            }
            return existing;
        }
        DocumentFile created = parent.createDirectory(name);
        if (created == null) {
            throw new IOException("无法创建目录: " + name);
        }
        return created;
    }

    private DocumentFile findChild(DocumentFile parent, String name) {
        for (DocumentFile child : parent.listFiles()) {
            if (name.equals(child.getName())) {
                return child;
            }
        }
        return null;
    }

    private void writeBytes(DocumentFile file, byte[] bytes) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        try (OutputStream output = resolver.openOutputStream(file.getUri(), "wt")) {
            if (output == null) {
                throw new IOException("无法打开输出流");
            }
            output.write(bytes);
            output.flush();
        }
    }

    private long verifiedSize(DocumentFile file, boolean shouldHaveContent, String path) throws IOException {
        long size = readBytes(file).length;
        if (shouldHaveContent && size == 0) {
            file.delete();
            throw new IOException("写入失败，文件为空: " + path);
        }
        return size;
    }

    private byte[] readBytes(DocumentFile file) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        try (InputStream input = resolver.openInputStream(file.getUri())) {
            if (input == null) {
                throw new IOException("无法打开输入流");
            }
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int read;
            while ((read = input.read(chunk)) != -1) {
                buffer.write(chunk, 0, read);
            }
            return buffer.toByteArray();
        }
    }

    private void walkMarkdownFiles(DocumentFile directory, String relativeRoot, JSArray result) {
        for (DocumentFile child : directory.listFiles()) {
            String childPath = relativeRoot.isEmpty() ? child.getName() : relativeRoot + "/" + child.getName();
            if (child.isDirectory()) {
                walkMarkdownFiles(child, childPath, result);
            } else if (child.isFile() && child.getName() != null && child.getName().toLowerCase().endsWith(".md")) {
                JSObject item = new JSObject();
                item.put("path", childPath);
                item.put("name", child.getName());
                item.put("lastModified", child.lastModified());
                item.put("size", child.length());
                result.put(item);
            }
        }
    }

    private String[] cleanSegments(String path, boolean allowEmpty) {
        String normalized = path == null ? "" : path.replace('\\', '/').replaceAll("^/+", "").trim();
        if (normalized.isEmpty()) {
            if (allowEmpty) {
                return new String[0];
            }
            throw new IllegalArgumentException("path is required");
        }

        String[] rawSegments = normalized.split("/");
        int count = 0;
        for (String segment : rawSegments) {
            if (!segment.trim().isEmpty()) {
                count++;
            }
        }

        String[] segments = new String[count];
        int index = 0;
        for (String raw : rawSegments) {
            String segment = raw.trim();
            if (segment.isEmpty()) {
                continue;
            }
            if (".".equals(segment) || "..".equals(segment) || segment.contains(":")) {
                throw new IllegalArgumentException("invalid path segment: " + segment);
            }
            segments[index++] = segment;
        }
        return segments;
    }

    private String normalizeDirectoryPath(String path) {
        String normalized = path == null ? "" : path.replace('\\', '/').replaceAll("^/+", "").replaceAll("/+$", "").trim();
        return normalized;
    }

    private String getMimeType(String path, String fallback) {
        if (path == null) {
            return fallback;
        }
        String lower = path.toLowerCase();
        if (lower.endsWith(".md")) return "text/markdown";
        if (lower.endsWith(".txt")) return "text/plain";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        return fallback;
    }

    private JSObject pathResult(String path) {
        JSObject result = new JSObject();
        result.put("path", path);
        return result;
    }

    private JSObject pathResult(String path, long size) {
        JSObject result = pathResult(path);
        result.put("size", size);
        return result;
    }
}
