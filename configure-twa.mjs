import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  throw new Error("Usage: node configure-twa.mjs <twa-manifest.json>");
}

const manifest = JSON.parse(fs.readFileSync(file, "utf8"));

manifest.packageId = process.env.TWA_PACKAGE_ID || "com.opencompany.game";
manifest.host = process.env.TWA_HOST || "opencompanygame.com";
manifest.name = process.env.TWA_APP_NAME || "OpenCompany";
manifest.launcherName = process.env.TWA_LAUNCHER_NAME || "OpenCompany";
manifest.startUrl = process.env.TWA_START_URL || "/";
manifest.appVersion = process.env.TWA_VERSION_NAME || "1.0.0";
manifest.appVersionCode = Number(process.env.TWA_VERSION_CODE || "1");

manifest.display = "standalone";
manifest.orientation = "any";
manifest.themeColor = "#0d2d55";
manifest.backgroundColor = "#f4f7fb";
manifest.navigationColor = "#0d2d55";
manifest.navigationDividerColor = "#0d2d55";
manifest.enableNotifications = true;
manifest.fallbackType = "customtabs";
manifest.enableSiteSettingsShortcut = true;
manifest.isChromeOSOnly = false;
manifest.isMetaQuest = false;
manifest.minSdkVersion = manifest.minSdkVersion || 19;

manifest.webManifestUrl =
  `https://${manifest.host}/manifest.webmanifest`;

manifest.iconUrl =
  `https://${manifest.host}/icon-512.png?v=0.10.159`;

manifest.maskableIconUrl =
  `https://${manifest.host}/icon-maskable-512.png?v=0.10.159`;

manifest.signingKey = {
  path: "android-keystore",
  alias: "opencompany"
};

manifest.features = manifest.features || {};
manifest.features.playBilling = { enabled: false };

fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Configured ${file}`);
console.log(`Package ID: ${manifest.packageId}`);
console.log(`Host: ${manifest.host}`);
console.log(`Version: ${manifest.appVersion} (${manifest.appVersionCode})`);
