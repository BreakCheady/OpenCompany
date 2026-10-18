# OpenCompany – Android

## Gegenwärtiger Stand
- Die installierte Testversion ist eine Trusted Web Activity (TWA) für https://opencompanygame.com/.
- Der Workflow **Android APK** erzeugt eine **Debug-APK**. Android signiert Debug-Builds möglicherweise mit unterschiedlichen Zertifikaten je Runner; diese Builds sind **kein verlässlicher Update-Kanal**.
- Die aktuelle Digital-Asset-Links-Datei `/.well-known/assetlinks.json` erlaubt den Fingerabdruck einer bestimmten Debug-APK. Für eine neue Release-Signatur muss ihr Fingerabdruck ergänzt werden.
- Die Website und das Supabase-Backend bleiben zunächst unverändert. Es gibt **noch keine wirksame App-exklusive Zugriffskontrolle**.

## Signierte Test-Releases und Play-Store-Bundle vorbereiten
Ein **einziger dauerhafter Schlüssel** muss vom Projektinhaber erstellt und außerhalb von GitHub sicher gesichert werden. Private Keystore-Dateien, Passwörter und Klartextschlüssel gehören **niemals ins Repository, in Actions-Logs oder in Chat-Nachrichten**.

Der manuell startbare GitHub-Workflow **Android signed release (manual)** erwartet folgende Repository-Action-Secrets:

- `OC_RELEASE_KEYSTORE_B64`: Base64-Inhalt der dauerhaften JKS/PKCS12-Keystore-Datei (ohne zusätzliche Zeilenumbrüche)
- `OC_RELEASE_STORE_PASSWORD`: Keystore-Passwort
- `OC_RELEASE_KEY_ALIAS`: Alias des Signaturschlüssels
- `OC_RELEASE_KEY_PASSWORD`: Passwort des Schlüssels

Ohne diese Werte stoppt der Workflow absichtlich. Er erstellt im Erfolgsfall eine signierte Release-APK und eine signierte AAB. Eine AAB ist nicht direkt auf dem Smartphone installierbar.

**Bei der ersten Release-APK ist wegen der bisherigen Debug-Signatur voraussichtlich eine Deinstallation der Debug-App erforderlich.** Vorher die Anmeldung und serverseitige Speicherung aller Daten prüfen. Für alle folgenden Versionen denselben Release-Schlüssel und eine erhöhte versionCode verwenden. Für Google Play App Signing wird später der im Play Console ausgewiesene **App-Signing**-Zertifikatfingerabdruck benötigt; er kann vom Upload-Key abweichen.

## Architektur der geplanten App-exklusiven Spielversion

Die TWA bleibt als funktionierende Testversion bestehen. Eine alleinige Sperre im Browser durch User-Agent, display-mode oder JavaScript kann umgangen werden und ist **keine** Zugriffskontrolle.

Geplanter sicherer Ablauf:
1. Die Android-Anwendung bekommt einen eigenen nativen Einstiegspunkt und einen App-Integritätsnachweis, der an einen angemeldeten Nutzer und eine einmalige Backend-Challenge gebunden wird.
2. Das Supabase-Backend überprüft den Nachweis auf einem vertrauenswürdigen Server, inklusive Paketname, gültigem Zertifikat, Challenge und Ablaufzeit.
3. Nur nach erfolgreicher serverseitiger Prüfung stellt der Server ein kurzlebiges App-Sitzungstoken aus.
4. **Alle** schreibenden und lesenden Spiel-Endpunkte und Datenbankrichtlinien werden schrittweise auf dieses Token umgestellt; der normale Supabase-Auth-Login allein genügt dann nicht mehr. Ausnahmen für öffentliche Downloads und Informationen werden ausdrücklich definiert.
5. Erst nach vollständigen Geräte-, Login-, Update-, Berechtigungs- und Negativtests wird `opencompanygame.com` zur Informations- und Downloadseite umgestellt.

**Wichtig:** Google Play Integrity und eine unverifizierte Debug-APK sind nicht gleichwertig. Vor Veröffentlichung im Play Store muss die verfügbare Integritätsprüfung und die Strategie für private Vorabtests geklärt werden. Bis zur Freigabe bleibt das Spiel per Website erreichbar, um keinen Lockout zu verursachen.

## Vor der Store-Veröffentlichung
- Offizielles App-Icon, Screenshots, Datenschutzerklärung, Kontakt, Spielbeschreibung
- Dauerhafter Release-Key mit Backup; reproduzierbare Versions- und Update-Strategie
- Release-APK und AAB kompilieren, installieren und testen
- App-Domain-Verknüpfung für den endgültigen Signaturfingerabdruck
- Login, Push-Benachrichtigungen, externe Links, Navigation und Zurück-Taste testen
- Play-Console-Einrichtung, Store-Eintrag, Data-Safety-Angaben und geforderte Tests
- App-exklusives Supabase-Zugriffskonzept verifizieren, **bevor** der Webzugang abgeschaltet wird
