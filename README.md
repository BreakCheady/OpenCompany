# OpenCompany MVP

Browserbasierter Multiplayer-MVP für OpenCompany mit GitHub Pages + Supabase/PostgreSQL.

## Enthalten

- Login / Registrierung über Supabase Auth
- Unternehmensgründung
- Startprodukt und Lager
- Mitarbeiter einstellen
- Produktion mit Kosten und Lagerzugang
- Marktorders und Käufe zwischen Firmen
- Finanztransaktionen
- Aktienklasse und Gründungsbeteiligung
- Row Level Security und serverseitige PostgreSQL-RPC-Funktionen

## 1. Supabase-Projekt anlegen

1. Auf https://supabase.com ein neues Projekt erstellen.
2. Im SQL Editor den kompletten Inhalt von `supabase/schema.sql` ausführen.
3. In **Project Settings → API** folgende Werte kopieren:
   - Project URL
   - anon / public key
4. In `js/config.js` eintragen:

```js
window.OPENCOMPANY_CONFIG = {
  SUPABASE_URL: "https://DEIN-PROJEKT.supabase.co",
  SUPABASE_ANON_KEY: "DEIN_ANON_KEY"
};
```

Wichtig: Der `anon` Key darf im Frontend stehen. Niemals den `service_role` Key in GitHub oder Browser-Code eintragen.

## 2. Auth konfigurieren

Für einen schnellen Test kannst du in Supabase unter **Authentication → Providers → Email** die E-Mail-Bestätigung deaktivieren. Für einen öffentlichen Betrieb sollte sie aktiviert sein.

Unter **Authentication → URL Configuration** später deine GitHub-Pages-URL als Site URL eintragen, z. B.:

`https://DEINNAME.github.io/opencompany/`

## 3. Lokal testen

Ein einfacher lokaler Webserver reicht:

```bash
python3 -m http.server 8080
```

Dann `http://localhost:8080` öffnen.

## 4. Mit GitHub Pages veröffentlichen

1. Neues GitHub-Repository erstellen, z. B. `opencompany`.
2. Alle Dateien dieses Ordners hochladen.
3. Repository → **Settings → Pages**.
4. **Deploy from a branch** wählen.
5. Branch `main`, Ordner `/ (root)` auswählen.
6. Speichern.

Danach stellt GitHub die öffentliche URL bereit.

## Sicherheitsmodell

Kritische Spielaktionen werden nicht direkt per `INSERT`/`UPDATE` aus dem Browser ausgeführt. Das Frontend ruft PostgreSQL-Funktionen auf:

- `bootstrap_company`
- `hire_employee`
- `produce_product`
- `place_sell_order`
- `buy_market_order`

Diese Funktionen prüfen Besitzrechte und führen Geld-/Lageränderungen innerhalb der Datenbank aus. RLS verhindert direkte Schreibzugriffe auf die Tabellen.

## Nächste sinnvolle Ausbaustufen

- echtes Orderbuch für Kauf- und Verkaufsorders
- Produktionsrezepte und Rohstoffe
- Gebäude/Fabriken
- Gehaltsabrechnung pro Spieltag
- Verträge
- Aktienhandel / IPO
- Realtime-Marktupdates
- Admin-/Moderationsebene
- Edge Functions oder eigenes Backend für komplexere Spielzyklen
