# Wirtschafts-Szenariosimulation – 12.10.2026

## In Produktion lesend ausgeführt
- **94** Produktarten, Q1-Referenzrezepturen.
- **3** Rohstoffpreisszenarien: 75 %, 100 %, 125 % der Material-Grundpreise.
- **3** Kostenphasenszenarien: Faktoren 0,85; 1,00; 1,20.
- **846** Produktszenarien, davon **367** mit modellierten Kosten oberhalb des hinterlegten Katalogverkaufspreises; **479** ohne einen solchen rechnerischen Konflikt.
- Rohstoffe besitzen 32 Stammdatensätze, alle mit positiven Grundpreisen. Die Rohstoff-SQL gibt pro aktivem Rohstoff drei Szenarien aus.

## Grenzen, die vor Balanceänderungen geprüft werden müssen
Diese Referenz nutzt die Q1-Rezeptkette, Rohstoff-Grundpreise und Arbeitskosten, inklusive Betriebskostenformel für Gebäudelevel 1. Die Szenarien spiegeln **nicht** tatsächliche Einkaufs-/Lagerkosten, Einkaufspreisvolatilität, Spezialisation, Manager, Outputmengen/Rundungen, Produktionsqualität Q2–Q5, Maschinenzustand, Vertriebserlös, Absatzmengen oder Nettoeinkommen ab. Die 367 Fälle sind *Prüfmarkierungen*, keine tatsächlichen negativen Kundenverkäufe.

Das verbundene Testprojekt OpenCompany-Test enthält derzeit kein `public.products`. Eine isolierte End-to-End-Ausführung von Produktions- und Verkaufsfunktionen ist deswegen nicht abgeschlossen. Kein Eingriff in produktive Preise, Bestände oder Nutzerkonten wurde vorgenommen.

## Dateien
- `docs/economy-q1-scenario-matrix.sql` – reproduzierbare Produktkostensensitivität
- `docs/economy-raw-material-scenarios.sql` – Rohstoffpreissensitivität

**Freigabekriterium für abschließendes Balancing:** Testdatenbank inklusive Schema und konsistenter Fixtures bereitstellen, tatsächliche Funktionsaufrufe für Qualitätsstufen und Vertriebskanäle isoliert testen, negative Netto-Deckungsbeiträge korrigieren und Regressionstests bestehen.
