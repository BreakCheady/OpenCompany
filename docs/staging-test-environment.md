# OpenCompany-Test: vollständige Schemaübernahme

**Ziel:** Spielschema (Tabellen, Funktionen, Trigger, Policies, Views, Indizes) von Supabase-Produktivprojekt `vprlmimcppdurywmgqat` nach **OpenCompany-Test** `gqzydkqugwecuwkztfdr` übertragen. **Keine** Live-Spielerdaten, Auth-Benutzer, gespeicherten Geheimnisse oder Produktionskonfigurationen kopieren.

## Voraussetzungen
1. In GitHub Repository → Settings → Secrets and variables → Actions zwei **Repository- oder Environment-Secrets** hinterlegen:
   - `OPENCOMPANY_PROD_DB_URL`: **nur für Export** geeignete PostgreSQL-Connection-URL des Produktionsprojekts (erforderlich sind Leserechte auf das Schema).
   - `OPENCOMPANY_TEST_DB_URL`: PostgreSQL-Connection-URL des separaten Testprojekts (mit DDL-Rechten).
2. GitHub Actions Environment `staging` verwenden; optional mit erforderlicher Freigabe schützen.
3. GitHub Actions → `Prepare OpenCompany test database schema` → Run workflow → Bestätigung `COPY_SCHEMA_ONLY`.

**Sicherheit:** Die Workflow-Datei vergleicht Quell- und Ziel-Hostnamen mit den erwarteten Projekt-IDs. Weder die Passwörter noch der Dump werden als Artefakt hochgeladen. Der Dump liegt nur vorübergehend auf dem GitHub-Runner.

## Erwartete Einschränkungen
- PostgreSQL-Schema-Dump für `public` und `private` umfasst nicht automatisch Supabase-Auth, Storage-Buckets, Realtime-Konfiguration, Vault-/Cron-Secrets oder Edge Functions.
- Erweiterungen und Abhängigkeiten können die Wiederherstellung zunächst scheitern lassen. Bei Fehlern keine Freigabe behaupten; die Fehlermeldungen aus dem Workflow prüfen.
- Falls die Testdatenbank bereits Spielobjekte enthält, ist eine Wiederholung ohne vorherige kontrollierte Bereinigung nicht idempotent. Testobjekte im separaten Schema `loadtest` sind unabhängig.
- Nach erfolgreichem Restore **erst** ein isoliertes Testdaten-Setup und authentifizierte Tests ausführen. Keine echten Spieleridentitäten kopieren.
- Den Workflow niemals mit vertauschten URLs ausführen.

## Prüfkriterien
- Objektzahlen, Funktionssignaturen und RLS/GRANTs für `public` und `private` vergleichen.
- Referenzdaten wie Produkttypen, Materialkatalog und Gebäudearten getrennt und datenschutzkonform initialisieren.
- Anschließend getrennte Testkonten erzeugen, Multiplayer- und Lasttest-Skripte ausführen.

**Nicht als vollständig testbereit bezeichnen**, bis alle Schritte einschließlich Referenzdaten und Auth-Testnutzer erfolgreich geprüft wurden.
