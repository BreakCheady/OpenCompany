# OpenCompany Q1–Q5 – regelbasiertes Wirtschaftsbalancing (13.10.2026)

## Ziel und Abgrenzung
Dieses Modell ersetzt für NPC-Angebote die bisherige historische Preisbasis durch deterministische Stückkosten aus dem aktuellen Produktionsregelwerk. Alte Produktionsjobs, Lager-Einstandspreise und historische Warenbörsenabschlüsse sind **keine Eingaben** des neuen Preisalgorithmus. Bestehende Spielerbestände und abgeschlossene Transaktionen bleiben unberührt.

## Kostenmodell
- 94 Produktnamen, je Q1–Q5: 470 Rezeptkostenmodelle.
- Rekursive Rezeptauflösung mit maximal 8 Stufen, ohne Zyklen.
- Rohstoffe werden anhand `materials.base_cost` und `private.quality_multiplier` bewertet.
- Produkt-Qn verlangt Zutaten mindestens Q(n-1), wie in der produktiven Produktionsfunktion vorgesehen.
- Produktbezogene Lohn-, Forschungskosten und Betriebsaufschläge werden bei jeder Fertigungsstufe berücksichtigt; der aktuelle `private.economy_production_cost_factor()` wirkt auf die Kosten.
- Basis für Stundenwerte: die implementierte `base_production_rate` je Produkt und `private.building_level_multiplier` (L1=1, L2=2, L3=3,5, L4=5,5, L5=8). Der produktive Maschinen-/Manager-/Spezialisierungs- und Ausgabe-Faktor kann laufzeitabhängig variieren; die Hauptsimulation verwendet eine einheitliche neutrale Konfiguration.

## Preiskurve und Gebühren
Statt einem hohen multiplikativen Q5-Bonus wird der gewünschte Erlösaufschlag an den Q1-Referenzkosten ausgerichtet:

```
q1ProfitTarget(q) = cost(Q1) * 0.14 * (1 + 0.06*(q-1))
minProfit(q) = max(q1ProfitTarget(q), cost(Qq)*0.08)
newNpcQuote(q) = ceil_to_cent((cost(Qq)+minProfit(q))/0.95)
```

Der Nenner 0,95 berücksichtigt die Standard-Marktgebühr von 5 %. Der Mindestgewinn von 8 % der Kosten ist eine Untergrenze für später eventuell deutlich teurere Qualitätsrezepte. Die tatsächlichen `market_fee`-Spezialisierungen können von 5 % abweichen.

## Prüfergebnisse
- 94 Produktarten × 5 Qualitäten × 5 Gebäudestufen = **2.350** modellierte Profit-pro-Stunde-Fälle; **0** unprofitabel.
- 32 Rohstoffarten × 5 Qualitäten = **160** Preisszenarien; **0** unprofitabel.
- Q5/Q1-Verhältnis des Gewinns je Produktionsstunde bei gleicher Gebäude- und übriger Ausstattung: **1,238–1,242** für die bestehenden 94 Produktrezepte. **0** der 470 Produkt/Gebäude-Paare überschreiten 1,26.
- Maximaler modellierter Q5/Q1-Stückkostenfaktor auf Grundlage der Rezepte: **1,113**.
- Produktiv sind **2.520 aktive NPC-Verkaufsangebote** auf die neue Formel aktualisiert worden; **0** weichen von der Formel ab.
- Für NPC-Ankäufe wird der neue Referenzpreis zusätzlich zur bisherigen Obergrenze berücksichtigt. Die Kaufbereitschaft ist kein garantiertes Kaufvolumen; NPC-Liquidität und Nachfrage bleiben relevant.

## Regel-Lebenszyklus
`private.enforce_balanced_npc_quality_quote` ist ein BEFORE-Trigger an `public.market_orders` und setzt für jede neue oder geänderte aktive NPC-Verkaufsorder den modellierten Preis. Spieler-Verkaufsangebote werden **nicht** zwangsweise umgeschrieben, damit freie Preisgestaltung erhalten bleibt. Bereits ausgeführte Markttransaktionen und Kontobuchungen werden nicht rückwirkend verändert.

## Grenzen
Die Rechnung ist eine regelbasierte, neutral konfigurierte Simulation, keine echte Produktion unter jedem Maschinenzustand oder jeder Spieler-Spezialisierung. Sie beweist wirtschaftliche Vergleichbarkeit der fünf Qualitäten auf Basis der vorhandenen Rezepte und Produktionsraten; sie garantiert weder einen Käufer noch positive historische Spieler-Margen.
