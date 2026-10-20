package com.opencompany.game;

import android.app.AlertDialog;
import android.Manifest;
import android.os.Build;
import android.content.pm.PackageManager;
import com.google.firebase.messaging.FirebaseMessaging;
import java.security.SecureRandom;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
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

  private volatile String pairingCode;
  private volatile String pairingStatus = "Start";
  private boolean twaLaunched = false;
  @Override protected boolean shouldLaunchImmediately() { return false; }
  @Override protected Uri getLaunchingUrl() {
    Uri url=super.getLaunchingUrl();
    return pairingCode==null ? url : url.buildUpon().fragment("native-push/"+pairingCode).build();
  }
  private synchronized void launchOnce() {
    if(twaLaunched)return;
    twaLaunched=true;
    runOnUiThread(()->{if(!isFinishing()&&!isDestroyed()){launchTwa();if(!"Registrierung gesendet".equals(pairingStatus))new AlertDialog.Builder(this).setTitle("OpenCompany Push-Diagnose").setMessage(pairingStatus).setPositiveButton("OK",null).show();}});
  }
  private void startPairing() {
    new Handler(Looper.getMainLooper()).postDelayed(this::launchOnce,15000);
    FirebaseMessaging.getInstance().getToken().addOnCompleteListener(result->{
      if(!result.isSuccessful()||result.getResult()==null){pairingStatus="Firebase-Token nicht verfügbar";launchOnce();return;}
      String token=result.getResult();
      byte[] nonce=new byte[20];new SecureRandom().nextBytes(nonce);
      StringBuilder code=new StringBuilder();
      for(byte b:nonce)code.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
      new Thread(()->{
        try {
          HttpURLConnection conn=(HttpURLConnection)new URL("https://vprlmimcppdurywmgqat.supabase.co/functions/v1/native-push-pair").openConnection();
          conn.setRequestMethod("POST");conn.setDoOutput(true);
          conn.setConnectTimeout(6000);conn.setReadTimeout(6000);
          conn.setRequestProperty("Content-Type","application/json");
          JSONObject payload=new JSONObject().put("action","register").put("code",code.toString()).put("fcm_token",token);
          try(OutputStream out=conn.getOutputStream()){out.write(payload.toString().getBytes(StandardCharsets.UTF_8));}
          int responseCode=conn.getResponseCode();
          if(responseCode==200){pairingCode=code.toString();pairingStatus="Registrierung gesendet";}
          else pairingStatus="Supabase antwortet mit HTTP "+responseCode;
          conn.disconnect();
        }catch(Exception e){pairingStatus="Netzwerkfehler bei Registrierung";}
        launchOnce();
      }).start();
    });
  }
  @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results) {
    super.onRequestPermissionsResult(requestCode,permissions,results);
    if(requestCode==1201){
      if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)startPairing();
      else launchOnce();
    }
  }


  @Override protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    checkForUpdates();
    if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},1201);
    else startPairing();
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
