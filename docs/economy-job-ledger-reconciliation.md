# Abstimmung der echten Produktionskosten – 12.10.2026

## Produktionsfunktion (verifiziert)
Die produktive Funktion private.start_production_on_building_v2_impl berechnet die Kosten anhand tatsächlicher, beim Start verbrauchter Zutaten, Arbeitskosten je Einheit aus dem Gebäudetyp, Wirtschaftslagenfaktor, Betriebszuschlägen sowie Spezialierungs- und Effizienzfaktoren. Die Werte werden in production_jobs.production_cash_cost und production_jobs.finished_unit_cost gespeichert. Für die Bestandskosten werden konsumierte Mengen mit ihrem average_unit_cost multipliziert. Die historische Tabelle private.production_job_input_consumptions hält diese Entnahmen fest.

**Rekonstruierbare Abgleichsgleichung**

finished_unit_cost ~= (production_cash_cost + Summe(entnommene_Menge * gelagerter_Einstandspreis) * economyProductionCostFactor) / output_quantity.

Toleranz im Audit: 0,01 $ je Einheit. Die Formel folgt unmittelbar aus der Produktionsfunktion und zählt Cashkosten nicht nochmals als separate Lohn- und Betriebskosten.

## Direkte Produktivprüfung
- Insgesamt 110 Produktionsjobs mit positivem finished_unit_cost.
- 103 Jobs ab 17.09.2026: **0 Abweichungen** größer als 0,01 $ je Einheit.
- 6 ältere Jobs (13.–16.09.2026) bei Elektronikmodul Q1 weisen Differenzen von bis zu 54 $ je Einheit auf, und für diese fehlen Zutatenverbrauchszeilen.
- Ohne fehlende Verbrauchszeilen ist keine verlustfreie historische Rekonstruktion möglich. Diese sechs Datensätze dürfen nicht als belegter aktueller Rechenfehler eingestuft werden.

## Offener Rest vor einem globalen Wirtschaftsbalance-Patch
Die 103 Jobs decken nur einen kleinen Teil der 94 Produkte und fünf Qualitätsstufen ab. Eine verallgemeinerte kostenbasierte NPC-Bepreisung ist daher noch nicht ausreichend empirisch kalibriert. Als nächstes wären hypothetische Chargen durch dieselbe Produktionsfunktion in einer isolierten Testdatenbank zu simulieren: Gebäudetyp, Gebäudestufe, Produktionsmodus, Qualität Q1–Q5, Vorproduktbeschaffung, Wirtschaftslagen und tatsächliche Verkaufswege. Fehlende Beobachtungen nicht als kostenfrei behandeln.

## Sicherheit
Diese Prüfung verwendet nur lesende SQL-Abfragen. Keine Spielerkonten, Bestände, Produktionsjobs, Preise oder Rezepte werden verändert.
