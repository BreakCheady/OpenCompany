# Produktionsszenarien: Material + konfigurierte Stückarbeit (12.10.2026)

## Umfang
Die **ausschließlich lesende** SQL-Abfrage `docs/economy-production-scenarios.sql` erweitert die rekursive Rohstoffkostenanalyse um `public.building_types.labor_cost_per_unit`. Zu jedem Produktionsknoten wird dessen Mengenmultiplikator berücksichtigt. Zwei Szenarien werden getrennt ausgewertet: (A) sämtliche Vorprodukte selbst herstellen und Rohstoffe extern kaufen; (B) alle direkten Rezeptzutaten zu den niedrigsten aktiven NPC-Angebotspreisen kaufen, nur das Endprodukt herstellen. Preise werden ausschließlich bei gleicher angefragter Qualitätsstufe Q1–Q5 einbezogen.

## Gegen die Datenbank geprüft
- 94 Produkte × 5 Qualitätsstufen = 470 Zeilen
- 465 Zeilen `MODELED` und mit numerischen Szenariokosten
- 5 Zeilen `NO_RECIPE`: Forschungseinheit Q1–Q5
- 0 `MISSING_ASK`
- Rekursives Szenario einschließlich konfigurierter Stückarbeit: 17,80 $ bis 1.437,79 $

## Grenzen – keine verifizierten Vollkosten
`labor_cost_per_unit` ist ein konfigurierter Gebäudewert, **kein nachgewiesener tatsächlicher Lohnabfluss**. Die Werte dürfen nicht zusätzlich zu den gespeicherten `finished_unit_cost` realer Jobs verbucht werden: Doppelzählungsgefahr. Die SQL-Abfrage enthält keine tatsächlichen Firmenlöhne, Abschreibungen, Gebäude- und Lagermieten, Wartung, Produktions-Cash-Aufschläge, Qualitätsverluste oder Opportunitätskosten. Die modellierte Qualitätsidentität aller Rezeptbestandteile ist noch an der Produktionslogik zu validieren. Günstigste einzelne NPC-Ask-Preise berücksichtigen keine verfügbare Menge und sind keine garantierten Ausführungspreise. Die Spreads verwenden **Katalogreferenzpreise** und sind keine realisierten Deckungsbeiträge. Die `base_units_per_hour`- und `base_production_rate`-Felder werden nur sichtbar gemacht; keine unvalidierte Formelumrechnung erfolgt.

## Nächste Schritte
Die tatsächliche serverseitige Produktionsbuchung (einschließlich `start_snapshot`), Qualitätsregeln und Gehaltsverbuchung untersuchen; auf Testumgebung realistische Szenarien mit Mengen, Produktionslaufzeiten und Absatz testen. Erst anschließend nachgewiesene Vollkosten und Balancing-Korrekturen bestimmen.

**Keine Spielerdaten, Preise, Rezepte oder Produktionsjobs geändert.**
