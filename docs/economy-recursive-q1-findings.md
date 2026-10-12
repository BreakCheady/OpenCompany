# Q1-Wirtschaftsreferenz, 12. Oktober 2026

Die lesende rekursive SQL-Auswertung `docs/economy-recursive-q1-reference.sql` wurde in der produktiven OpenCompany-Datenbank als erste Referenzrechnung geprüft.

- **94/94** Q1-Produktnamen mit einem rechnerischen Rohstoff-/Arbeitskosten-Referenzwert.
- **39/94** Q1-Produkte mit Katalogverkaufspreis unter diesem Referenzwert.
- Der Referenzwert nutzt `materials.base_cost`, die Gebäude-Arbeitskosten, Rezeptmengen und mehrstufige Vorproduktketten.
- Es ist **kein** Nachweis tatsächlicher Produktionskosten, tatsächlicher Marktpreise oder negativer Nettomargen. Betriebsaufschläge, Wirtschaftslage, Qualitätsabhängigkeiten, Lager-Einstandspreise, Vertriebskosten, Firmenboni und Beschaffungsstrategien sind nicht vollständig modelliert.
- In der separaten Supabase-Instanz OpenCompany-Test fehlt zurzeit die Tabelle `public.products`. Ein isolierter, produktionsgleicher Integrationstest ist dort vorerst **nicht möglich**.
- Deshalb ausdrücklich **keine** automatischen Preis-, Bestands- oder Rezeptänderungen in der produktiven Datenbank.

## Für finalen Balancing-Freigabestatus nötig

1. Testdatenbank mit dem tatsächlichen Schema und anonymisierten, konsistenten Fixtures ausstatten.
2. Tatsächliche serverseitige Produktionsfunktion in isolierten Transaktionen pro gültiger Produkt-/Qualitätskombination, Maschinenmodus, Gebäudelevel und Wirtschaftslage ausführen.
3. Verkaufsfunktionen mit tatsächlichen Nettoerlösen, Mengen und Gebühren prüfen.
4. Alle Verlustfälle einzeln mit Regressionstests korrigieren; erst dann Änderungen an der produktiven Ökonomie in Erwägung ziehen.

Diese PR schließt die reproduzierbare Q1-Referenzprüfung ab, nicht das Gesamtbalancing.
