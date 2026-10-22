# Limit-Kaufaufträge – Implementierungsvertrag

Status: Architekturentwurf; noch **nicht** auf Produktion aktiviert.

## Nutzerspezifikation
- Auftrag kann bei leerem Orderbuch erstellt werden.
- Ware per Material-ID bzw. kanonischer Produktidentität; Qualitätsmenge z.B. Q4+Q5.
- Gesamtzielmenge über alle Qualitäten zusammen; ein maximaler Stückpreis.
- Bei neuen Sell-Orders sofortige automatische Teil-Ausführung zu deren tatsächlichem Preis (nicht Limitpreis).
- Eine Bestandsabnahme ist pro Kauf atomar, Restmenge bleibt offen.
- Je Qualität separat aggregierte Push-Benachrichtigungen mit mengengewichtetem Ausführungspreis, Kosten und verbleibender Gesamtmenge.
- Beispiel: 5000 × 100 OC$ = 500000 OC$; exklusive explizit gesondert ausgewiesener Gebühren.

## Umsetzungssicherheit
1. Neue `market_limit_buy_orders` und `market_limit_buy_fills` inkl. Status, Buyer, Material/Product Identity, Qualitätsauswahl, Ziel/Restmenge, Preisgrenze, Deckung und exakter Fill-Abrechnung. Bestehende `market_orders` nicht unverändert als Limit-Order zweckentfremden.
2. Orderanlage prüft `assert_company_owner`, valide Ganzzahlen, positive Preise, gültige Qualitäten und vorhandene liquide Mittel. Offene Frage: Geld vollständig reservieren oder pro Match prüfen und bei Unterdeckung pausieren. Eine Reservierungslogik darf nie mehrfach Geld belasten.
3. Matching auf **Backend-Seite** nach Commit-relevanten Sell-Order-Änderungen, ohne Client-Polling, und zusätzlich beim Erstellen der Limit-Order gegen vorhandene Angebote. Sofort bedeutet transaktional/ereignisgetrieben, nicht periodischer Cron-Tick.
4. Vorhandene `buy_market_order_impl`-/`buy_selected_market_orders_impl`-Abrechnung wiederverwenden, soweit kompatibel; keine doppelte manuelle Lager-, Gebühren- oder XP-Buchung. Sortierung: niedrigster Preis, danach Erstellzeit; Qualität nur innerhalb der erlaubten Menge.
5. Kritischer Schutz: selbstständige Käufe untersagen; rows per `FOR UPDATE` sperren, Menge und Geld jeweils genau einmal abbuchen. Nach jedem Fill Restmenge atomar reduzieren. Idempotenz bei erneuter Ereignisverarbeitung.
6. Produktidentität über die Firmen-spezifischen `products.id` hinweg auflösen (nicht nur ein lokales Produkt-UUID matchen); Qualitätsstufen getrennt behandeln.
7. Fill-Ereignisse persistent speichern. Outbox für Push nach erfolgreichem Kauf committen, zuverlässiger Dispatcher mit Wiederholungs-/Deduplizierungslogik. Aggregate je Auftrag+Qualität+Ausführungsfenster; Durchschnitt = sum(menge*ausführungspreis)/sum(menge). Nur tatsächliche abgeschlossene Käufe melden.
8. Voraktivierung: Test ohne Angebot; Q4/Q5-Gesamtlimit; Mischpreise und VWAP; Preis exakt am Limit; Preis über Limit; Restmenge; simultane Käufer; kein Geld; abgebrochene Order; Push-Duplikate; Produktions- und NPC-Angebotswege.
9. Kein Live-Cutover bevor Markt-/Geld- und Lager-Invarianten nachprüfbar sind. Website und Android-App bleiben gemeinsam nutzbar.

## Offene Produktparameter
- Guthabenreservierung: Ja/Nein, Standardempfehlung vollständige Reservierung einschließlich höchstmöglicher Gebühren, mit Rückgabe ungenutzter Beträge bei Löschung.
- Auftragslaufzeit: Gültig bis Stornierung oder befristet (z.B. 7/30 Tage).
- Behandlung unterschiedlicher Qualitäten: im Auftrag gemeinsame Restmenge oder eigenes Kontingent pro Qualitätsstufe (Beispiel spricht für gemeinsame Restmenge).
- Push-Gruppierungsfenster für simultane Transaktionen, z.B. eine Meldung je Qualität innerhalb einer zusammenhängenden Matching-Runde.
