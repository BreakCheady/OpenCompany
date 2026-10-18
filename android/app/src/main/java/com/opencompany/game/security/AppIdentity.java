package com.opencompany.game.security;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * Local diagnostic identity of the installed Android package.
 *
 * IMPORTANT: local package/certificate checks do not prove app authenticity
 * to a server. This class MUST NOT unlock Supabase or game endpoints.
 */
public final class AppIdentity {
  private AppIdentity() {}

  public static final String EXPECTED_PACKAGE = "com.opencompany.game";

  public static boolean hasExpectedPackage(Context context) {
    return EXPECTED_PACKAGE.equals(context.getPackageName());
  }

  /** Returns the SHA-256 fingerprint of the locally observed signing certificate. */
  public static String signingCertificateSha256(Context context) throws Exception {
    PackageManager manager = context.getPackageManager();
    String packageName = context.getPackageName();
    Signature signature;
    if (Build.VERSION.SDK_INT >= 28) {
      PackageInfo info = manager.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES);
      if (info.signingInfo == null) throw new SecurityException("Missing signing information");
      Signature[] signatures = info.signingInfo.hasMultipleSigners()
          ? info.signingInfo.getApkContentsSigners()
          : info.signingInfo.getSigningCertificateHistory();
      if (signatures == null || signatures.length == 0) throw new SecurityException("Missing certificate");
      signature = signatures[signatures.length - 1];
    } else {
      @SuppressWarnings("deprecation")
      PackageInfo info = manager.getPackageInfo(packageName, PackageManager.GET_SIGNATURES);
      if (info.signatures == null || info.signatures.length == 0) throw new SecurityException("Missing certificate");
      signature = info.signatures[0];
    }
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(signature.toByteArray());
    StringBuilder output = new StringBuilder();
    for (byte b : digest) output.append(String.format(Locale.US, "%02X", b & 0xff));
    return output.toString();
  }
}
