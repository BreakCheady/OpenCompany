package com.opencompany.game;

import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.content.Intent;
import com.google.androidbrowserhelper.trusted.LauncherActivity;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Trusted Web Activity with opt-in Android APK update downloads. */
public class MainActivity extends LauncherActivity {
  private static final String MANIFEST_URL =
      "https://github.com/BreakCheady/OpenCompany/releases/download/android-latest/opencompany-update.json";
  private static final String APK_URL_PREFIX =
      "https://github.com/BreakCheady/OpenCompany/releases/download/android-latest/";
  private static final long CHECK_INTERVAL_MS = 12L * 60L * 60L * 1000L;
  private boolean checkRunning = false;

  @Override protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    checkForUpdates();
  }

  @Override protected void onResume() {
    super.onResume();
    checkForUpdates();
  }

  private void checkForUpdates() {
    SharedPreferences prefs = getSharedPreferences("oc_updates", MODE_PRIVATE);
    long now = System.currentTimeMillis();
    if (checkRunning || now - prefs.getLong("last_check", 0) < CHECK_INTERVAL_MS) return;
    checkRunning = true;
    new Thread(() -> {
      try {
        HttpURLConnection conn = (HttpURLConnection) new URL(MANIFEST_URL).openConnection();
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(8000);
        conn.setRequestProperty("Accept", "application/json");
        try {
          if (conn.getResponseCode() != 200) return;
          StringBuilder text = new StringBuilder();
          try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
              if (text.length() + line.length() > 8192) return;
              text.append(line);
            }
          }
          JSONObject info = new JSONObject(text.toString());
          int latestCode = info.getInt("versionCode");
          String version = info.getString("versionName");
          String apk = info.getString("apkUrl");
          if (!apk.startsWith(APK_URL_PREFIX) || !apk.endsWith("/OpenCompany.apk")) return;
          prefs.edit().putLong("last_check", System.currentTimeMillis()).apply();
          if (latestCode <= BuildConfig.VERSION_CODE ||
              latestCode <= prefs.getInt("last_downloaded_version", 0)) return;
          new Handler(Looper.getMainLooper()).post(() -> {
            if (isFinishing() || isDestroyed()) return;
            new AlertDialog.Builder(this)
                .setTitle("OpenCompany-Update verfügbar")
                .setMessage("Version " + version + " ist verfügbar. Die APK wird über Android heruntergeladen. Die Installation musst du anschließend bestätigen.")
                .setNegativeButton("Später", (dialog, which) -> {})
                .setPositiveButton("Herunterladen", (dialog, which) -> downloadUpdate(apk, latestCode))
                .show();
          });
        } finally {
          conn.disconnect();
        }
      } catch (Exception ignored) {
        // Do not interrupt gameplay if updates are unavailable.
      } finally {
        checkRunning = false;
      }
    }).start();
  }

  private void downloadUpdate(String apkUrl, int versionCode) {
    try {
      DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
      request.setTitle("OpenCompany-Update");
      request.setDescription("Tippe nach dem Download auf die APK, um das Update zu installieren.");
      request.setMimeType("application/vnd.android.package-archive");
      request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
      request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,
          "OpenCompany-update-" + versionCode + ".apk");
      DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
      if (manager == null) return;
      manager.enqueue(request);
      getSharedPreferences("oc_updates", MODE_PRIVATE).edit()
          .putInt("last_downloaded_version", versionCode).apply();
      new AlertDialog.Builder(this)
          .setTitle("Download gestartet")
          .setMessage("Nach Abschluss findest du die APK in deinen Downloads bzw. in der Download-Benachrichtigung. Tippe darauf und bestätige die Installation.")
          .setPositiveButton("OK", null)
          .show();
    } catch (Exception ignored) {
      new AlertDialog.Builder(this)
          .setMessage("Der Download konnte nicht gestartet werden. Bitte versuche es später erneut.")
          .setPositiveButton("OK", null)
          .show();
    }
  }
}
