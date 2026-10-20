package com.opencompany.game;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Native FCM receiver. Account/device binding must be completed before server delivery.
 * Never logs, transmits or exposes the FCM token to an unauthenticated web origin.
 */
public final class OpenCompanyMessagingService extends FirebaseMessagingService {
  private static final String CHANNEL_ID = "opencompany_game";

  @Override public void onNewToken(String token) {
    super.onNewToken(token);
    getSharedPreferences("oc_fcm", MODE_PRIVATE).edit().putString("pending_token", token).apply();
  }

  @Override public void onMessageReceived(RemoteMessage message) {
    super.onMessageReceived(message);
    String title = message.getNotification() == null ? "OpenCompany" : message.getNotification().getTitle();
    String body = message.getNotification() == null ? null : message.getNotification().getBody();
    if (title == null || title.isEmpty()) title = "OpenCompany";
    if (body == null || body.isEmpty()) return;

    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager == null) return;
    if (Build.VERSION.SDK_INT >= 26) {
      manager.createNotificationChannel(
          new NotificationChannel(CHANNEL_ID, "OpenCompany", NotificationManager.IMPORTANCE_DEFAULT));
    }
    Intent launch = new Intent(this, MainActivity.class);
    launch.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    PendingIntent open = PendingIntent.getActivity(this, 0, launch,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    Notification.Builder builder = Build.VERSION.SDK_INT >= 26
        ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
    builder.setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle(title)
        .setContentText(body)
        .setAutoCancel(true)
        .setContentIntent(open);
    manager.notify((int)(System.currentTimeMillis() & 0x7fffffff), builder.build());
  }
}
