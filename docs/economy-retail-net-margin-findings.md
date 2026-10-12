# Retail-Deckungsbeitrag und Preisgrenzen – Audit 12.10.2026

Die produktive DB enthält 87 Einzelhandelsaufträge; 0 davon haben bisher `total_value=0`. Für jeden Auftrag liefert `docs/economy-retail-net-margin-audit.sql` den dokumentierten Netto-Referenzdeckungsbeitrag nach Lager-Einstandsbasis und gespeicherten Verkaufsbetriebskosten. Fehlende historische Snapshots werden als INCOMPLETE markiert, nicht mit Null bewertet.

## Reproduzierbarer Vertragskonflikt der produktiven Funktionen
`private.start_retail_sale_on_building_v2_impl` lehnt Verkaufspreise nur bei `price < min` bzw. `price > max` ab und lässt exakt `min`/`max` zu. `private.retail_effective_unit_revenue_company` liefert bei `price <= min` bzw. `price >= max` dagegen 0 effektiven Erlös. Die Annahme eines Grenzwertpreises kann daher Aufträge ohne Verkaufserlös erzeugen. Behebung: Eingabeprüfung der Startfunktion auf dieselbe offene Spanne (strikt > min und < max) anpassen, plus serverseitigen Guard `effective_unit > 0`. Erst nach gesichertem Funktions-Regressionstest ausrollen.

## Keine rückwirkenden Veränderungen
Die SQL-Auswertung ist read-only. Keine Bestände, Guthaben, Preise oder Transaktionen wurden verändert. 94 Produkte und 115 vorhandene Q1–Q4-Kombinationen sind im derzeitigen Datenbestand vorhanden; hypothetische Q5-Varianten sind noch nicht als echte Produkte nachgewiesen.

## Einschränkungen
Der Snapshotabgleich belegt noch keinen Gewinn nach allen Markt-, Transport-, Vertrags-, Steuer- und Kapitalkosten. Ein Preisbalancing benötigt getrennte Kanal-Audits und Vorher-Nachher-Regressionstests.
