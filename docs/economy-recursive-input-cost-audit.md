# Rekursive Eingangskostenanalyse (12.10.2026)

## Zweck und Reproduzierbarkeit
Die SQL-Abfrage in `docs/economy-recursive-input-cost-audit.sql` erzeugt eine **lesende** Matrix für alle 94 Katalogprodukte und Q1 bis Q5. Die Abfrage wurde gegen die OpenCompany-Produktionsdatenbank ausgeführt und liefert 470 Zeilen.

## Szenarien
- **Alle Vorprodukte selbst produzieren:** Das Rezept wird rekursiv bis auf Rohstoffe aufgelöst. Rohstoffe werden mit dem jeweils günstigsten offenen NPC-Verkaufsangebot derselben Qualitätsstufe bewertet. Die Mengen aller Pfade werden berücksichtigt.
- **Alle direkten Vorprodukte einkaufen:** Jede unmittelbare Rezeptposition wird zum günstigsten offenen NPC-Verkaufsangebot derselben Qualitätsstufe bewertet; keine Rekursion für zugekaufte Produkte.

Beide Szenarien sind **reine Eingangskostenmodelle, keine Vollkostenrechnung**. Q1–Q5 bedeuten hier Angebotsqualitäten; die tatsächliche Qualitätsvererbung aus der Produktionslogik ist noch zu validieren. Der niedrigste Angebotspreis ist kein gesicherter Ausführungspreis für die benötigte Gesamtmenge; Liquidität und Angebotstiefe sind nicht erfasst. Mischstrategien (einzelne Vorprodukte kaufen, andere produzieren) fehlen noch.

## Validierung
- 470 Produkt-/Qualitätszeilen (94 × 5)
- 465 rekursiv und 465 direkt vollständig bepreist
- 5 Zeilen ohne Rezept: Forschungseinheit Q1–Q5; kein Nullpreis angenommen
- 0 Fälle mit fehlendem NPC-Rohstoffangebot in einer vorhandenen Rezeptkette
- Inputkosten aus rekursivem Materialeinkauf in der getesteten Momentaufnahme: 1,80 $ bis 501,79 $

## Nicht enthalten / nächste Prüfstufe
Rezeptgebundene Produktionslaufzeit, Produktions-Cash-Kosten, Gebäude-Fixkosten und Auslastung, Löhne und Produktivität, Qualitätsanpassungen und -verluste, Transaktionsgebühren, Lagerkosten, Angebotsvolumen, Nachfrage und erzielbare Verkaufspreise. Historische Produktionsjobdaten dienen zur Kalibrierung und müssen mit passenden Qualitätsstufen verglichen werden. Für die Forschungseinheit ist ein eigenes Kostenmodell erforderlich.

**Kein Eingriff in Preise, Rezepte, Bestände oder Produktivdaten.**
