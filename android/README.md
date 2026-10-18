# OpenCompany Android test app
This is a Trusted Web Activity (TWA) launcher for https://opencompanygame.com/.
Build using the GitHub Actions **Android APK** workflow. Download the artifact OpenCompany-Android-Test-APK from its successful run.

This is a debug-signed TEST build, not a production release. Chrome or another TWA browser is required. Without domain certificate verification via Digital Asset Links, the app will open in a Custom Tab instead of full-screen verified TWA.

Before Play Store release: choose final package ID, create and securely back up a permanent upload signing key, build signed release AAB, register Google Play App Signing fingerprint in /.well-known/assetlinks.json, check login, notifications, updates, policies, Play Store listing, data safety and testing. Do not commit signing keys.
