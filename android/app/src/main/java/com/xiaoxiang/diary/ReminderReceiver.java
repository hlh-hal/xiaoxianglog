package com.xiaoxiang.diary;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!notificationsAllowed(context)) return;

        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        XiangNotificationsPlugin.showNotification(
            context,
            XiangNotificationsPlugin.REMINDER_REQUEST_CODE,
            title == null ? "小象日志" : title,
            body == null ? "该写今天的日记啦" : body
        );
    }

    private boolean notificationsAllowed(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            boolean granted = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
            if (!granted) return false;
        }

        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }
}
