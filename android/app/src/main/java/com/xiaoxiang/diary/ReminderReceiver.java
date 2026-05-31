package com.xiaoxiang.diary;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            rescheduleSavedReminder(context);
            return;
        }

        if (!notificationsAllowed(context)) return;

        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        XiangNotificationsPlugin.showNotification(
            context,
            XiangNotificationsPlugin.REMINDER_REQUEST_CODE,
            title == null ? "小象日志" : title,
            body == null ? "该写今天的日记啦" : body
        );
        rescheduleSavedReminder(context);
    }

    private void rescheduleSavedReminder(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(XiangNotificationsPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(XiangNotificationsPlugin.KEY_REMINDER_ENABLED, false)) return;

        int hour = prefs.getInt(XiangNotificationsPlugin.KEY_REMINDER_HOUR, 21);
        int minute = prefs.getInt(XiangNotificationsPlugin.KEY_REMINDER_MINUTE, 0);
        String title = prefs.getString(XiangNotificationsPlugin.KEY_REMINDER_TITLE, "小象日志");
        String body = prefs.getString(XiangNotificationsPlugin.KEY_REMINDER_BODY, "该写今天的日记啦");
        XiangNotificationsPlugin.scheduleDailyReminder(context, hour, minute, title, body);
    }

    private boolean notificationsAllowed(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            boolean granted = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
            if (!granted) return false;
        }

        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }
}
