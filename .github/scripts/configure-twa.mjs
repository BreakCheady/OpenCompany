import fs from "node:fs";
import path from "node:path";

const file = process.argv[2];
if (!file) {
  throw new Error("Usage: node configure-twa.mjs <twa-manifest.json>");
}

const host = process.env.TWA_HOST || "opencompanygame.com";
const versionName = process.env.TWA_VERSION_NAME || "1.0.0";
const versionCode = Number(process.env.TWA_VERSION_CODE || "1");
const assetVersion = process.env.TWA_ASSET_VERSION || "0.10.160";

const manifest = {
  packageId: process.env.TWA_PACKAGE_ID || "com.opencompany.game",
  host,
  name: process.env.TWA_APP_NAME || "OpenCompany",
  launcherName: process.env.TWA_LAUNCHER_NAME || "OpenCompany",
  display: "standalone",
  themeColor: "#0d2d55",
  themeColorDark: "#0d2d55",
  navigationColor: "#0d2d55",
  navigationColorDark: "#0d2d55",
  navigationDividerColor: "#0d2d55",
  navigationDividerColorDark: "#0d2d55",
  backgroundColor: "#f4f7fb",
  enableNotifications: true,
  startUrl: process.env.TWA_START_URL || "/",
  iconUrl: `https://${host}/icon-512.png?v=${assetVersion}`,
  maskableIconUrl: `https://${host}/icon-maskable-512.png?v=${assetVersion}`,
  splashScreenFadeOutDuration: 300,
  signingKey: {
    path: "android-keystore",
    alias: "opencompany"
  },
  appVersionName: versionName,
  appVersionCode: versionCode,
  shortcuts: [],
  generatorApp: "bubblewrap-cli",
  webManifestUrl: `https://${host}/manifest.webmanifest?v=${assetVersion}`,
  fallbackType: "customtabs",
  features: {},
  alphaDependencies: { enabled: false },
  enableSiteSettingsShortcut: true,
  isChromeOSOnly: false,
  isMetaQuest: false,
  minSdkVersion: 19,
  orientation: "default",
  fingerprints: [],
  additionalTrustedOrigins: [],
  retainedBundles: [],
  protocolHandlers: [],
  fileHandlers: [],
  launchHandlerClientMode: "",
  appVersion: versionName
};

fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");

console.log(`Created ${file}`);
console.log(`Package ID: ${manifest.packageId}`);
console.log(`Host: ${manifest.host}`);
console.log(`Version: ${manifest.appVersionName} (${manifest.appVersionCode})`);
console.log(`Icon: ${manifest.iconUrl}`);
console.log(`Maskable icon: ${manifest.maskableIconUrl}`);
