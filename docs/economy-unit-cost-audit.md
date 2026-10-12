# Produktionskosten-Audit (12.10.2026)

## Geprüfte Daten
32 aktive Rohstoffe, 94 Katalogprodukte, 210 Rezept-Eingaben. 93 Produkte haben Rezepte. Bei 92 Produkten ist der Katalog-Produktionskostenwert null, der nicht mit tatsächlichen Produktionsvollkosten gleichzusetzen ist.

Es gibt 110 historische Produktionsjobs mit positivem Stückkostenwert, aber nur für fünf unterschiedliche Produkte. Alle 32 Rohstoffe haben aktuell NPC-Q1-Verkaufspreise von etwa 40–46 Prozent ihres hinterlegten Grundkostenwerts. Für diverse textile Produktionsketten überschreiten die börsengehandelten Vorproduktkosten den Referenzverkaufspreis.

Die vollständige lesende SQL-Kostenanalyse ist unter `docs/economy-unit-cost-audit.sql` abgelegt. Ihre Kostenvergleiche sind Momentaufnahmen; Qualität, Eigenproduktion, Gebäude, Löhne und Absatzkanal müssen für eine verlässliche Vollkostenmatrix noch getrennt geprüft werden.

**Keine produktiven Wirtschaftswerte wurden geändert.**

## Rezeptintegritaet
Live-Auswertung: 210 Rezeptpositionen, 93 verschiedene Zielprodukte, keine nicht-positiven Mengen, keine fehlenden Zutatenreferenzen, keine Zyklen in den Produktabhaengigkeiten. Die maximale Produktabhaengigkeitstiefe betraegt drei Stufen. Die rekursive Vollkostenberechnung ist damit strukturell moeglich; sie ist noch nicht implementiert.
