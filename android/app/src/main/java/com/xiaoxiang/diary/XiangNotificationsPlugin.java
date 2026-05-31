package com.xiaoxiang.diary;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.Calendar;

@CapacitorPlugin(
    name = "XiangNotifications",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class XiangNotificationsPlugin extends Plugin {
    static final String CHANNEL_ID = "xiaoxiang_reminders_v2";
    static final String CHANNEL_NAME = "小象日志提醒";
    static final String PREFS_NAME = "xiaoxiang_notifications";
    static final String KEY_REMINDER_ENABLED = "reminder_enabled";
    static final String KEY_REMINDER_HOUR = "reminder_hour";
    static final String KEY_REMINDER_MINUTE = "reminder_minute";
    static final String KEY_REMINDER_TITLE = "reminder_title";
    static final String KEY_REMINDER_BODY = "reminder_body";
    static final int REMINDER_REQUEST_CODE = 7101;

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        call.resolve(permissionResult());
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || hasNotificationPermission()) {
            call.resolve(permissionResult());
            return;
        }

        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        call.resolve(permissionResult());
    }

    @PluginMethod
    public void showNotification(PluginCall call) {
        if (!notificationsAllowed()) {
            call.reject("通知权限未开启");
            return;
        }

        String title = call.getString("title", "小象日志");
        String body = call.getString("body", "");
        int id = call.getInt("id", (int) (System.currentTimeMillis() % Integer.MAX_VALUE));
        showNotification(getContext(), id, title, body);
        call.resolve();
    }

    @PluginMethod
    public void scheduleDailyReminder(PluginCall call) {
        if (!notificationsAllowed()) {
            call.reject("通知权限未开启");
            return;
        }

        int hour = call.getInt("hour", 21);
        int minute = call.getInt("minute", 0);
        String title = call.getString("title", "小象日志");
        String body = call.getString("body", "该写今天的日记啦");

        scheduleDailyReminder(getContext(), hour, minute, title, body);
        getPrefs()
            .edit()
            .putBoolean(KEY_REMINDER_ENABLED, true)
            .putInt(KEY_REMINDER_HOUR, hour)
            .putInt(KEY_REMINDER_MINUTE, minute)
            .putString(KEY_REMINDER_TITLE, title)
            .putString(KEY_REMINDER_BODY, body)
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void cancelDailyReminder(PluginCall call) {
        cancelDailyReminder(getContext());
        getPrefs().edit().putBoolean(KEY_REMINDER_ENABLED, false).apply();
        call.resolve();
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    private JSObject permissionResult() {
        JSObject result = new JSObject();
        result.put("display", notificationsAllowed() ? "granted" : "denied");
        return result;
    }

    private SharedPreferences getPrefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true;
        }

        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean notificationsAllowed() {
        return hasNotificationPermission() && NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }

    static void showNotification(Context context, int id, String title, String body) {
        ensureChannel(context);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_HIGH);

        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent != null) {
            PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                id,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            builder.setContentIntent(contentIntent);
        }

        NotificationManagerCompat.from(context).notify(id, builder.build());
    }

    static void scheduleDailyReminder(Context context, int hour, int minute, String title, String body) {
        Intent intent = new Intent(context, ReminderReceiver.class)
            .putExtra("title", title)
            .putExtra("body", body);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            REMINDER_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Calendar triggerAt = Calendar.getInstance();
        triggerAt.set(Calendar.HOUR_OF_DAY, hour);
        triggerAt.set(Calendar.MINUTE, minute);
        triggerAt.set(Calendar.SECOND, 0);
        triggerAt.set(Calendar.MILLISECOND, 0);
        if (triggerAt.getTimeInMillis() <= System.currentTimeMillis()) {
            triggerAt.add(Calendar.DAY_OF_YEAR, 1);
        }

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            alarmManager.cancel(pendingIntent);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt.getTimeInMillis(), pendingIntent);
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt.getTimeInMillis(), pendingIntent);
            }
        }
    }

    static void cancelDailyReminder(Context context) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            REMINDER_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (pendingIntent == null) return;

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            alarmManager.cancel(pendingIntent);
        }
        pendingIntent.cancel();
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("每日写日记提醒和互动通知");
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }
}
