# Produktions-/Qualitätsabdeckung – Audit nach V 0.10.322

Die SQL-Datei `docs/economy-production-coverage.sql` ist rein lesend und wurde am 12.10.2026 gegen die produktive OpenCompany-Datenbank ausgeführt.

## Verifizierte Bestandsaufnahme
- 94 unterschiedliche Produktnamen.
- 1.356 unternehmensbezogene Produktdatensätze.
- 115 im Datenbestand vorhandene einzigartige Kombinationen aus Produktname und Qualität: Q1=94, Q2=19, Q3=1, Q4=1; Q5=0.
- 990 Rohmaterial-Rezeptzeilen und 1.320 Vorprodukt-Rezeptzeilen.
- Der historische Job-Audit aus PR #78 belegt keine flächendeckende Preismarge über alle Produkte und Absatzwege.

## Interpretation
- `NO_OBSERVED_JOB` bedeutet *unbekannte tatsächliche Stückkosten*, nicht null Herstellungskosten.
- `CATALOG_RETAIL_BELOW_SOME_OBSERVED_COST` zeigt einen Risikofall schon vor Gebühren oder sonstigen Vertriebskosten, **aber keine automatisch bewiesene Nettoverlusttransaktion**.
- `CATALOG_RETAIL_ABOVE_OBSERVED_COST` belegt keine rentable Verkaufstransaktion; tatsächliche Erlöse, Verkaufskanal, Gebühren und Absatzmengen müssen zusätzlich betrachtet werden.
- `no_recipe_rows` zählt *unternehmensbezogene* Zeilen ohne verknüpfte Rezepte. Ein positiver Wert ist nicht automatisch ein global fehlendes Produktrezept.
- 470 hypothetische Produkt-/Qualitätskombinationen sind nicht mit 470 bereits vorhandenen Katalogdatensätzen gleichzusetzen.

## Für eine verbindliche Wirtschaftsbalance noch offen
Eine reproduzierbare Q1–Q5-Simulation pro Gebäudelevel, Maschinenzustand, Produktionsmodus, Wirtschaftslage und Input-Einstandskosten; außerdem vollständige Nettoerlösmodelle für jeden Verkaufsweg. Erst nach diesen Checks darf ein globaler NPC-Preis- oder Rezeptpatch vorgenommen werden.

**Sicherheit:** Keine Änderungen an Produktivpreisen, Rezepten, Beständen, Spielern oder Transaktionen.
