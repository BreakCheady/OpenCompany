# OpenCompany – TWA build with GitHub Actions

This package prepares a browser-only CI build for the OpenCompany Trusted Web Activity.

## What it does

- Runs manually from GitHub Actions or automatically when PWA/TWA files change on `main`.
- Uses the official Bubblewrap container, so no local Node.js, JDK or Android SDK installation is required.
- Reads the live PWA manifest from `https://opencompanygame.com/`.
- Generates an Android TWA for package ID `com.opencompany.game`.
- Builds an unsigned APK and AAB.
- Uploads both files as a GitHub Actions artifact named `opencompany-twa-unsigned`.

## Files to copy into the repository

- `.github/workflows/build-twa.yml`
- `.github/scripts/configure-twa.mjs`
- `.gitignore`

Do not copy this setup document unless you want it in the repository.

## Run in the browser

1. Open the OpenCompany repository on GitHub.
2. Add the files above.
3. Open **Actions**.
4. Select **Build OpenCompany TWA**.
5. Choose **Run workflow**.
6. After the run finishes, open it and download the `opencompany-twa-unsigned` artifact.

## Important

The first version intentionally builds unsigned artifacts. Do not upload the unsigned AAB to Google Play.

For the production Play Store build, create an upload signing key and store:
- the keystore as a Base64 GitHub Secret,
- the keystore password as a GitHub Secret,
- the key password as a GitHub Secret.

Then the workflow can be extended to produce the signed AAB and the SHA-256 fingerprint needed for `/.well-known/assetlinks.json`.

The package ID is intentionally fixed to:

`com.opencompany.game`

Do not change it after publishing the app in Google Play.
