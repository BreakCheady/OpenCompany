# OpenCompany: Website-/App-Trennung – Migrationsplan

Stand: 2026-10-18. **Die Produktivseite und ihre bestehenden Supabase-Rechte bleiben unverändert, bis Ende-zu-Ende-Tests abgeschlossen sind.**

## Ist-Zustand

- `https://opencompanygame.com/` enthält das aktuelle Spiel.
- Die installierte Android-App (`com.opencompany.game`) ist eine Trusted Web Activity, die genau diese URL im Browser darstellt.
- Web-Frontend und TWA verwenden dieselbe Supabase-Auth-/Datenbankanbindung. Ein TWA-Start ist serverseitig derzeit **kein** Sicherheitsnachweis.
- `/app-info/` ist eine neue, rein statische Vorschau der späteren öffentlichen Download-/Infoseite.
- Signierte APKs werden durch GitHub Actions erstellt und unter `https://github.com/BreakCheady/OpenCompany/releases/download/android-latest/OpenCompany.apk` veröffentlicht.

## Zielbild

1. **Öffentliche Website:** Spielbeschreibung, Neuigkeiten, APK-Download, Kontakt und rechtliche Hinweise; kein Spielbetrieb und keine ungeschützten Spiel-APIs.
2. **Installierte Android-App:** eigener, von der Website unabhängiger Einstieg. Kein öffentlich zugänglicher Spiel-HTML-Endpunkt als alleiniger Zugangsschutz.
3. **Backend:** Authentifizierung plus verifizierte und kurzlebige App-Berechtigung auf **allen** Spiel-Endpunkten. App-Identität muss serverseitig nachgewiesen werden.

## Notwendige Implementierungsschritte

### 1. Native App-Shell und Integritätsprüfung

- Zuerst die Lieferstrategie für die Spieloberfläche festlegen (gebündelte Assets im APK/AAB oder abgesicherter eigener Web-Endpunkt). Eine bloße TWA/User-Agent-Erkennung reicht nicht.
- App-seitige Challenge-Anforderung und kryptografisch gebundene Integritätsattestierung implementieren.
- Für Google-Play-Veröffentlichungen: Play-Integrity-API und Bereitstellung der zulässigen Paket-/Zertifikatsidentität prüfen. **Vor** Play-Verfügbarkeit gesonderte belastbare Verteilungs-/Attestierungsstrategie festlegen.
- Backend verifiziert Attestation und einmalige Challenge, meldet ungültige oder wiederholte Nachweise ab und stellt kurzlebige App-Zugriffsberechtigungen aus.

### 2. Supabase-Datenpfade vollständig absichern

- Inventar aller Tabellen, Views, RPCs, Storage-Buckets, Realtime-Abonnements und Edge Functions anlegen.
- Für jede Operation das App-Berechtigungskonzept serverseitig erzwingen (insbesondere RLS/SQL-RPCs; `SECURITY DEFINER` separat auditieren).
- Supabase-Auth-Login und öffentliche `anon`- bzw. `authenticated`-Rolle **allein** dürfen dann nicht zu Spielzugriff führen.
- Ausnahmen für öffentliche Seiten/Informationen ausdrücklich dokumentieren.
- Kurzlebige Token dürfen nicht einfach durch modifizierbares Client-JavaScript oder HTTP-Header simuliert werden können.

### 3. Tests und Umschalten

- App-Login, längere Spielsessions, Updates, Offline-/Verbindungsfehler und Kontowechsel auf echten Android-Geräten testen.
- Negativtests: normales Web, direkte Supabase-REST-/RPC-Aufrufe, abgelaufene Tokens, ungültige Signatur, modifizierte APK, fremdes Paket und Replay.
- Erst nach Abnahme öffentlichen Root-Einstieg `/` auf Informations-/Downloadseite umstellen. Die TWA darf dann **nicht** mehr die öffentliche Root-URL als Spiel-Einstieg benötigen.
- Notfall-Rollback und Admin-Zugriff vor der Aktivierung definieren.

## Erste read-only Bestandsaufnahme der Produktivdatenbank (2026-10-18)

Gezählt im Supabase-Projekt `vprlmimcppdurywmgqat`:

- 61 Tabellen im Schema `public`; alle 61 mit aktiviertem RLS.
- 66 bestehende RLS-Richtlinien.
- 116 Funktionen im Schema `public`, darunter 47 `SECURITY DEFINER`-Funktionen.

Diese Zahlen **sagen nichts darüber aus**, ob vorhandene Policies Zugriffe allein aus dem Webbrowser erlauben. Die 47 erweiterten Funktionen und die tatsächlichen Zugriffsrollen/GRANTs müssen einzeln analysiert werden. Es wurden bei dieser Bestandsaufnahme keine Policies oder Daten geändert.


## Migrationswerkzeug und technische Entscheidung

Die Datei `android/tools/audit-frontend-access.mjs` erstellt ein **lesendes, reproduzierbares**
Inventar der im Frontend ausdrücklich benannten Supabase-Aufrufe:

```sh
node android/tools/audit-frontend-access.mjs > frontend-access-audit.json
```

Das Ergebnis umfasst RPC-Aufrufe und `.from()`-Referenzen aus `app.js`,
`management.js` und `guidance.js`. Es ist **kein** vollständiger Autorisierungsnachweis:
dynamische Namen, Storage, Realtime, SQL-interne Aufrufe und weitere Clients
benötigen getrennte Prüfungen.

**Architekturentscheidung für die nächste Implementierungsphase:**
- Die derzeitige TWA bleibt der produktive, funktionierende Client.
- Eine installierte TWA bzw. ihr User-Agent liefert keinen vertrauenswürdigen
  Nachweis gegenüber Supabase.
- Ein ausschließlich im JavaScript eingeblendeter Zugangscode oder ein per
  Client gesetzter HTTP-Header wird nicht als App-Berechtigung akzeptiert.
- Vor dem Wechsel der Android-Startaktivität brauchen wir eine testbare native
  Integritätskomponente, einen verifizierenden Backend-Dienst und eine Strategie
  für die Verteilung außerhalb des Play Stores.
- Vorhandene `anon`- und `authenticated`-Berechtigungen werden bis zum
  getesteten Umschaltpunkt nicht entzogen.

## Passive Android-Identitätsdiagnostik (Version 0.1.4)

Die Klasse `android/app/src/main/java/com/opencompany/game/security/AppIdentity.java`
kann den installierten Paketnamen und den SHA-256-Fingerabdruck des lokalen
Signaturzertifikats ermitteln. Sie wird derzeit **nicht** vom Spieleinstieg
aufgerufen und verändert keine Autorisierung.

Ein lokaler Fingerabdruck ist **kein** kryptografischer Beleg für den
Server, dass der Aufruf aus einer unveränderten Original-App stammt:
modifizierte Clients könnten Werte fälschen. Auch die Zertifikatsprüfung
allein schützt keinen Supabase-Endpunkt.

Nächster Schritt ist eine plattformgestützte, serverseitig validierte
Integritätsprüfung mit Challenge, Replay-Schutz und gebundener Sitzung.
Für APK-Verteilung außerhalb Google Play muss vor Aktivierung der
unterstützte Vertrauensnachweis geklärt werden.

## Isolierte Attestierungsrichtlinie (noch nicht aktiviert)

Unter `android/security/attestation-policy.mjs` liegt jetzt eine **nicht deployte**,
standardmäßig restriktive Prüfregel mit negativen Tests in
`android/security/attestation-policy.test.mjs`.

Lokaler Aufruf: `node --test android/security/attestation-policy.test.mjs`.
Sie prüft Merkmale eines **bereits durch einen vertrauenswürdigen Dienst
verifizierten** Integritätsurteils: Paketkennung, Signaturfingerabdruck,
Challenge, Ablauf, Wiederverwendung und App-/Gerätestatus.

**Sicherheitsgrenze:** Diese JavaScript-Funktion validiert **keine**
Play-Integrity-Tokens, deren Signatur oder Google-Antwort. Sie darf nicht
mit einer vom Client selbst gesendeten JSON-`verdict` aufgerufen und nie
allein für die Freigabe von Supabase-Daten verwendet werden.

Die APK wird derzeit außerhalb Google Play bereitgestellt.
Das verlangte `PLAY_RECOGNIZED`-Urteil könnte für diese Distribution
nicht erfüllt werden. Es gibt daher **absichtlich keine Aktivierung**
und weiterhin kein App-Zugriffstoken. Vor dem Einsatz müssen wir
den Verteilungsweg (einschließlich Play-App-Signing-Schlüssel)
festlegen und einen unabhängig verifizierenden Backend-Dienst aufbauen.

## Neue isolierte Supabase-Testumgebung (2026-10-18)

- Projektname: **OpenCompany-Security-Test**
- Projekt-ID: `htykwmeavqhmukgvkuho`
- Region: `eu-west-1`; bei der Erstellung angezeigter Aufpreis: 0 / Monat.
- Initialstatus: `ACTIVE_HEALTHY`. Keine öffentlichen Anwendungstabellen angelegt.
- Edge Function `app-integrity-preview`: Version 1, Status `ACTIVE`, `verify_jwt=true`.
- Der Endpunkt gibt bei POST nur `503` mit
  `verified=false` und `gameAccessGranted=false` zurück.
- Keine Verbindung zu Produktionsdaten oder Spielberechtigungen.
- Einrichtung und Bereitstellung wurden über die Supabase-Verwaltung verifiziert.
- **HTTP-End-to-End-Tests mit gültigem JWT sind noch offen.** Ein erfolgreicher Deploy
  beweist keine vollständige Funktion oder App-Autorisierung.
- Für die nächsten Schritte: Testbenutzer, isolierte Challenge-Speicherung,
  echte Plattform-Verifikation, negativer Replay-Test, API/RLS-Autorisierung
  und vollständige Spielzugriffsprüfung vor einem produktiven Cutover.

## Staging-Challenge-Backend (2026-10-18)

Im **ausschließlich getrennten** Projekt `htykwmeavqhmukgvkuho` wurden angelegt:

- Schema `app_security` mit RLS-geschützter Tabelle `challenges`.
- Ablauf nach 120 Sekunden und Einmalverwendung über atomisches `UPDATE ... WHERE consumed_at IS NULL`.
- RPCs `issue_test_challenge` und `consume_test_challenge`: Ausführung nur für `service_role`, nicht für `anon` oder `authenticated`.
- Aktiv bereitgestellte Edge Function `app-challenge-test` mit `verify_jwt=true`, die zusätzlich ein JWT gegen Supabase Auth prüft, einen zufälligen Nonce erzeugt und seinen SHA-256-Hash speichert.
- Keine Berechtigung für produktives Gameplay; `gameAccessGranted=false`.

Die Datenbankprüfung ergab: `first_accepted=true`, `replay_accepted=false` für dieselbe Challenge. Die temporäre Test-Hilfsfunktion wurde anschließend gelöscht. Rollenprüfung: `anon=false`, `authenticated=false`, `service_role=true` für die Ausstellung.

**Noch offen:** HTTP-End-to-End-Prüfung mit gültigem Staging-JWT; der reine Deploymentstatus bestätigt keine erfolgreiche Anfrage. Ebenfalls offen: Ratenbegrenzung und Aufräumen abgelaufener Challenges, echter Plattformnachweis, sicherer Session-Austausch und die durchgängige Autorisierung der Spiel-RPCs/RLS. **Kein Produktions-Cutover.**

## Rollout-Status

- [x] Separater Info-/Download-Seitenentwurf unter `/app-info/`; bestehendes Spiel unter `/` unverändert
- [x] Technische Risiken und Sicherheitsvoraussetzungen dokumentiert
- [ ] Supabase-Oberflächeninventar, RLS- und SECURITY-DEFINER-Audit
- [ ] Native sichere Spieleinstiegs- und Attestierungsarchitektur
- [ ] Testbetrieb mit serverseitiger App-Berechtigung
- [ ] Web-/API-Negativtests, Release- und Fallbacktests
- [ ] Öffentliches Root erst nach Freigabe umstellen

**Warnung:** Änderungen an einer öffentlichen Web-URL allein schützen weder Daten noch Spielökonomie. App-Exklusivität erfordert durchgängig serverseitige Autorisierung.
