# OpenCompany

## Version 0.10.224 – Wirtschaftsphase und Nachfrage neu angeordnet

- Die aktuelle Wirtschaftsphase steht im Finanzen-Tab ganz oben, vor Anleihen und Krediten.
- Die Nachfrage nach Produktkategorie steht ganz oben in der Warenbörse und lässt sich über ihre Überschrift auf- und zuklappen. Sie ist zunächst zugeklappt; Aktualisierungen der Nachfragedaten behalten den geöffneten Zustand bei.
- Anzeige, Countdown, Hilfe und Nachfragedaten verwenden ihre bisherigen Elemente und Berechnungen.

## Version 0.10.223 – Chat-Zähler und vereinfachte Unternehmensführung

- Produktionsplaner entfernt, einschließlich Navigation, gespeicherter Planoberfläche und Verknüpfungen in Produktion, Enzyklopädie, Verträgen und Großaufträgen.
- Spezialisierungen und Branchenboni entfernt. Neue Produktionen, Handel, Forschung und Verträge verwenden die normalen Regeln. Frühere Daten und Finanzbewegungen bleiben erhalten; Auswahl und Ausbau sind serverseitig gesperrt.
- Der Chat-Button zeigt die Summe ungelesener empfangener Direktnachrichten (einschließlich Personal Assistent). Öffentliche Gruppen zählen ausschließlich neben dem jeweiligen Chatraum.
- Kontakte und Räume zeigen ihre eigene Anzahl ungelesener Nachrichten. Eigene und gelöschte Nachrichten zählen nicht. Beim Anzeigen einer Unterhaltung wird deren Lesestand dauerhaft gespeichert; das bloße Öffnen der Übersicht liest keine anderen Chats.
- Hintergrundaktualisierung über Realtime und eine Sicherheitsabfrage alle 15 Sekunden. Verdeckte Browser-Tabs und nicht geöffnete Unterhaltungen werden nicht als gelesen markiert. Neu eintreffende Nachrichten nach dem angezeigten Stand bleiben ungelesen.
- Der freiwillige Einstieg bleibt erhalten; seine Spezialisierungslektionen und Planerverweise wurden entfernt. Gebäudeleistung, Großaufträge und Wirtschaftsereignisse bleiben verfügbar.

Validierung: `node --check app.js`, `node --check guidance.js`, `node tests/chat-unread.cjs`, `node tests/progression.cjs` und `node tests/progression-ui.cjs`. Die Controllerprüfungen prüfen tatsächliche UI-Funktionen mit simulierten Daten, einschließlich paralleler Antworten, ausgeblendeter Tabs und Firmenwechsel. `tests/chat-unread.sql` prüft Lesestände, RLS, mehr als 100 Nachrichten, deaktivierte Boni und einen tatsächlichen Marktabschluss mit 5 % Gebühr; `tests/large-orders.sql` prüft die bestehenden Zuschlags-, Liefer- und Zeitregeln. Beide SQL-Suiten enden mit ROLLBACK. Eine visuelle Prüfung im angemeldeten Browser ist zusätzlich sinnvoll.

**Aktuelle Version: 0.10.224**

OpenCompany ist eine browserbasierte Multiplayer-Unternehmenssimulation mit **GitHub Pages** als Frontend und **Supabase/PostgreSQL** als Backend.

## Aktueller Funktionsumfang

- Registrierung, Login und Passwort-Wiederherstellung über Supabase Auth
- Unternehmensgründung, Umbenennung, Zurücksetzen und Account-Löschung
- Unternehmenslevel, Erfahrungspunkte und freischaltbare Spielbereiche
- Unternehmenswert und Unternehmensranking
- Gebäude mit Bauzeiten, Upgrades, Downgrades und Gebäudeplätzen
- Produktionssystem mit zeitbasierter Produktion und Teilabruf fertiger Mengen
- Rohstoffe, Produktionsrezepte und Vorprodukte
- Gemeinsames Lager für Materialien und Produkte
- Produktqualitäten und qualitätsabhängige Produktion, Handel und Forschung
- Produktforschung mit Forschungseinheiten und Patentwert
- Markt für Produkte und Rohstoffe
- NPC-Marktversorgung und regelmäßige Marktaktualisierungen
- Mehrfachauswahl und zentraler Kauf von Marktangeboten
- Stornierbare Marktorders
- Einzelhandel mit frei wählbaren Verkaufspreisen und zeitbasierten Verkäufen
- Chat mit Direktnachrichten, öffentlichen Räumen und persistenten Zählern für ungelesene Nachrichten
- Freiwilliger geführter Einstieg mit speicherbarem Fortschritt
- Direkte Verträge zwischen Spielerunternehmen
- Finanzbewegungen mit Tages-, Wochen- und Monatsauswertung
- Anleihen- und Kreditsystem zwischen Unternehmen
- NPC-Aktivität im Anleihenmarkt
- Automatische Zinsabrechnung
- Realtime- und Polling-Updates für relevante Unternehmensdaten
- Row Level Security (RLS) und serverseitige PostgreSQL-RPC-Funktionen

## Technischer Aufbau

Das Projekt besteht aus einem statischen Browser-Frontend und einem Supabase-Backend.

### Frontend

Die wichtigsten Dateien sind:

- `index.html` – Aufbau und Ansichten der Anwendung
- `style.css` – Layout, responsive Darstellung und Komponenten-Styling
- `app.js` – Spiellogik im Browser, Datenladen, Rendering und RPC-Aufrufe
- `config.js` – Supabase-Projektkonfiguration
- `opencompany-logo.png` – OpenCompany-Logo

- `guidance.js` – freiwilliger Einstieg anhand tatsächlicher Spielaktionen

Das Frontend verwendet `@supabase/supabase-js` direkt im Browser.

### Backend

Supabase stellt unter anderem bereit:

- PostgreSQL-Datenbank
- Authentifizierung
- Row Level Security
- PostgreSQL-RPC-Funktionen für kritische Spielaktionen
- Realtime-Funktionen
- geplante Datenbankjobs für wiederkehrende Spielprozesse

Kritische Spielaktionen werden serverseitig ausgeführt. Der Browser soll Geldbestände, Lagerbestände, Produktionsprozesse oder andere geschäftskritische Daten nicht direkt manipulieren.

## Zentrale Spielbereiche

### Unternehmen

Spieler besitzen ein Unternehmen mit unter anderem:

- Kontostand
- Unternehmenswert
- Unternehmenslevel
- Erfahrungspunkten
- Reputation
- Patentwert
- Gebäuden und Lagerbeständen

### Produktion

Produkte benötigen abhängig vom Rezept Materialien oder Vorprodukte. Produktionsleistung und verfügbare Kapazität hängen von den vorhandenen Produktionsgebäuden und deren Ausbaustufen ab.

Laufende Produktionsaufträge können zeitabhängig abgearbeitet und fertige Einheiten teilweise abgeholt werden.

### Gebäude

Gebäude bilden die Grundlage für Produktion, Einzelhandel und Forschung. Gebäude können errichtet, ausgebaut und zurückgestuft werden. Die Zahl verfügbarer Gebäudeplätze wächst mit dem Unternehmenslevel.

### Markt & Handel

Unternehmen können Produkte und Materialien über Marktorders handeln. Zusätzlich versorgen NPC-Unternehmen den Markt regelmäßig mit Angeboten.

Der Marktkauf unterstützt die Auswahl mehrerer Angebote und kann automatisch die günstigsten verfügbaren Positionen berücksichtigen.

### Einzelhandel

Produkte können über passende Verkaufsgebäude direkt im Handel verkauft werden. Verkaufspreis, Menge und Verkaufsdauer beeinflussen den Prozess.

### Verträge

Spielerunternehmen können direkte Kauf- und Verkaufsverträge miteinander abschließen. Verträge unterstützen Produkte, Materialien und Qualitätsstufen.

### Forschung

Forschungseinheiten können in Produkte investiert werden, um deren Qualität weiterzuentwickeln. Forschung trägt außerdem zum Patentwert des Unternehmens bei.

### Finanzen und Anleihen

Der Finanzbereich zeigt Einnahmen, Kosten und Ergebnis für unterschiedliche Zeiträume.

Das Anleihensystem ermöglicht Finanzierung zwischen Unternehmen. Dazu gehören unter anderem:

- Anleiheanfragen
- Investitionen anderer Unternehmen
- tägliche Verzinsung
- Rückzahlungen
- Sicherheiten- und Kreditgrenzen
- NPC-Teilnahme am Anleihenmarkt

## Supabase-Sicherheitsmodell

Die Anwendung verwendet RLS und serverseitige Funktionen, um kritische Änderungen zu schützen.

Beispiele für öffentliche RPC-Endpunkte sind unter anderem:

- `bootstrap_company`
- `build_building`
- `start_production_v2`
- `claim_production_output`
- `place_sell_order_quality`
- `buy_selected_market_orders`
- `create_contract_quality`
- `invest_product_research`
- `create_bond_request`
- `invest_in_bond_request`

Die eigentliche Geschäftslogik liegt weitgehend in geschützten Datenbankfunktionen.

> Der Supabase `service_role`-Key darf niemals im Browser oder im öffentlichen Repository gespeichert werden.

## Konfiguration

In `config.js` werden die öffentlichen Supabase-Zugangsdaten hinterlegt:

```js
window.OPENCOMPANY_CONFIG = {
  SUPABASE_URL: "https://DEIN-PROJEKT.supabase.co",
  SUPABASE_ANON_KEY: "DEIN_PUBLIC_KEY"
};
```

Der öffentliche Browser-Key darf im Frontend verwendet werden. Geheime Server-Schlüssel gehören nicht in das Repository.

## Lokal testen

Ein einfacher lokaler Webserver reicht aus:

```bash
python3 -m http.server 8080
```

Danach kann die Anwendung unter `http://localhost:8080` geöffnet werden.

## Deployment

Das Frontend kann direkt über GitHub Pages veröffentlicht werden.

1. Repository in GitHub öffnen.
2. Unter **Settings → Pages** die Veröffentlichung vom Branch `main` aktivieren.
3. Als Verzeichnis `/ (root)` verwenden.
4. In Supabase unter **Authentication → URL Configuration** die produktive Site-URL und die erlaubten Redirect-URLs konfigurieren.

## Versionsstand

Diese README beschreibt den Funktionsstand von **OpenCompany 0.10.34**.

Die Datenbankmigrationen und die sichtbare Anwendungsversion sollten bei Releases gemeinsam geprüft werden, damit Frontend, Backend und Dokumentation denselben Stand widerspiegeln.
