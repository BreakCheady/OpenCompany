# Produktionsjob-Kostenkalibrierung (12.10.2026)

Die **nur lesende** Abfrage `docs/economy-job-cost-calibration.sql` vergleicht die gespeicherten Stückkosten und die Cash-Kosten je produzierter Einheit auf Ebene **Produkt × Qualität × Gebäudetyp**. Gebäudeparameter dienen als Referenz, nicht als automatisch zusätzlich zu zahlender Kostenblock.

## Gegen die Produktionsdatenbank validiert
- 110 historische Jobs mit positivem `finished_unit_cost`, verteilt auf 7 Produkt-/Qualitäts-/Gebäudegruppen und 5 Produkttypen.
- 0 Jobs mit ungültigen Mengen- oder Zeitnennern in dieser Auswahl.
- 0 nicht zugeordneten Produktionsgebäude.
- 0 Fälle, in denen Cash-Kosten die gespeicherten Stückkosten um mehr als 0,01 $ überschreiten.
- Die zunächst beobachteten 9 vermeintlichen Überschreitungen betrafen Forschungseinheit Q1 und entstanden durch Rundungsgenauigkeit; mit Cent-Toleranz entfallen sie.

## Validierte historische Mittelwerte (Jobgewichtet)
| Produkt | Qualität | Jobs | Cash/Stück | Gespeicherte Stückkosten |
|---|---|---:|---:|---:|
| Displaymodul | Q1 | 3 | 22,00 $ | 97,27 $ |
| Elektronikmodul | Q1 | 16 | 25,50 $ | 75,93 $ |
| Elektronikmodul | Q2 | 11 | 22,00 $ | 52,00 $ |
| Elektronikmodul | Q3 | 47 | 22,32 $ | 46,07 $ |
| Forschungseinheit | Q1 | 21 | 25,17 $ | 25,17 $ |
| Laptop | Q1 | 4 | 22,00 $ | 281,27 $ |
| Prozessor | Q1 | 8 | 22,00 $ | 62,82 $ |

Die Job-Mittelwerte sind **kein** Beweis dafür, dass höherwertige Produkte generell günstiger sind; Stichproben haben unterschiedliche Unternehmens- und Produktionsbedingungen. Aktuelle Baukosten, Mitarbeitergehälter und Umlagen dürfen nicht ohne Prüfung der tatsächlichen Verbuchungslogik zu `finished_unit_cost` addiert werden, um Doppelzählung zu verhindern.

## Folgeschritte
1. Produktionsbuchungsfunktion und `start_snapshot` auf tatsächlich enthaltene Kostenelemente untersuchen.
2. Normalisiertes Produktionsszenario für alle Produkte und Qualitätsstufen entwickeln, inkl. nicht beobachteter Kombinationen; fehlende Quellen als unbewertbar markieren.
3. Gebäudefixkosten, Mitarbeiter und Absatzkanal erst nach Abgleich der Verrechnungsregeln integrieren.
4. Vor jeder Balancingänderung Testdatenbank, Plausibilitätsgrenzen und Regressionstests nutzen.

**Produktive Preise, Rezepte, Jobs und Bestände unverändert.**
