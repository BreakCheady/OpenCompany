# Produktqualitäts- und Rohstoff-Szenarioaudit (12.10.2026)

Die lesende SQL-Datei `docs/economy-all-instantiated-quality-scenarios.sql` wurde als Modell in der produktiven OpenCompany-Datenbank geprüft.

- 94 Produktnamen, 115 vorhandene Produkt-/Qualitätskombinationen (Q1–Q4, noch kein vorhandenes Q5).
- 3 Rohstoffpreisfaktoren (0,75 / 1,00 / 1,25), 3 Produktionskostenfaktoren (0,85 / 1,00 / 1,20).
- 1.035 modellierte Kosten-/Listenpreisfälle, davon 411 mit Kosten über Katalogpreis und 624 ohne diesen Referenzkonflikt.
- Die Datei ist ausschließlich lesend und führt keine Produktionsjobs, Transaktionen oder Preisanpassungen aus.

## Wichtige Abgrenzung
Dieses Szenariomodell ersetzt nicht die serverseitige Produktionsfunktion. Die Produkt-/Qualitätskombinationen repräsentieren ausgewählte vorhandene Produktzeilen; die Rezepte sind unternehmensbezogen und werden rekursiv expandiert. Rohstoff-Grundpreise sind keine tatsächlichen Lager-Einstandskosten. Es fehlen insbesondere Gebäudezustand, Maschinenmodus, Produktionsmengen-/Rundungseffekte, Manager-/Spezialisierung, Beschaffung, reale Nettoumsätze und Gebühren pro Absatzkanal. Die Betriebskosten sind als Gebäudelevel-1-Modell enthalten.

Das vorhandene Supabase-Projekt `OpenCompany-Test` besitzt zurzeit **0 Tabellen im public-Schema**. Daher können Produktions- und Verkaufsfunktionen dort nicht isoliert mit produktionsgleicher Struktur getestet werden. Bis dahin keine produktiven Finanz- oder Preismutationen.

## Erforderliche Freigabe
Die vollständige Optimierung braucht zuerst ein reproduzierbares Testdatenbank-Schema mit sicheren Fixtures, anschließend produktive Funktionsäquivalenztests über Rohstoffbeschaffung, Vorproduktfertigung, Q1–Q5, Verkäufe und tatsächliche Nettomargen. Wirtschaftliche Anpassungen sind erst nach Bestehen der Regressionstests freizugeben.
