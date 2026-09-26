const config = window.OPENCOMPANY_CONFIG || {};
const configured = config.SUPABASE_URL && config.SUPABASE_ANON_KEY && !config.SUPABASE_URL.includes('YOUR_');
const setupNotice = document.getElementById('setupNotice');
if (!configured) setupNotice.classList.remove('hidden');

const APP_URL = 'https://breakcheady.github.io/OpenCompany/';
const sessionAuthStorage = {
  getItem(key) {
    try { return window.sessionStorage.getItem(key); }
    catch (_) { return null; }
  },
  setItem(key, value) {
    try { window.sessionStorage.setItem(key, value); }
    catch (_) {}
  },
  removeItem(key) {
    try { window.sessionStorage.removeItem(key); }
    catch (_) {}
  }
};

const sb = configured ? window.supabase.createClient(
  config.SUPABASE_URL,
  config.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      storage: sessionAuthStorage,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
) : null;


let currentLanguage = (() => {
  try {
    return window.localStorage.getItem('opencompany_language') === 'en' ? 'en' : 'de';
  } catch (_) {
    return 'de';
  }
})();

const I18N_EN = {
  'Dashboard':'Dashboard','Gebäude':'Buildings','Lager':'Storage','Warenbörse':'Marketplace',
  'Verträge':'Contracts','Kosten':'Costs','Erlöse':'Revenue','Finanzen':'Finances','Zeit':'Time','Partner':'Partner','Handelswert':'Trade value','Gebühr':'Fee','Beschreibung':'Description','Betrag':'Amount','Level':'Level','Unternehmen':'Company','Ware':'Item','Marktgebühr':'Market fee','Marktkauf':'Market purchase','Marktverkauf':'Market sale','Forschung':'Research','Einstellungen':'Settings',
  'Abmelden':'Log out','Nicht angemeldet':'Not signed in','OpenCompany – spielbare Unternehmenssimulation':'OpenCompany – playable business simulation',
  'Supabase noch nicht konfiguriert.':'Supabase is not configured yet.','Prüfe':'Check',
  'Login / Registrierung':'Login / Registration','Anmelden':'Log in','E-Mail':'Email','Passwort':'Password',
  'Passwort vergessen?':'Forgot password?','Registrieren':'Register','Account erstellen':'Create account',
  'Rangliste':'Leaderboard','Top 100 Unternehmen nach Unternehmenswert.':'Top 100 companies by company value.',
  'Rangliste wird geladen …':'Loading leaderboard …','Neues Passwort festlegen':'Set new password',
  'Neues Passwort':'New password','Passwort wiederholen':'Repeat password','Passwort speichern':'Save password',
  'Unternehmen':'Company','Kontostand':'Cash balance','Belegschaft':'Workforce','Unternehmenswert':'Company value',
  'Lagerwert':'Inventory value','Patentwert':'Patent value','Schulden':'Debt','Gebäudewert':'Building value',
  'Lagerkapazität':'Storage capacity','Überbestand':'Overflow','Warnungen':'Warnings','Max. inkl. Überbestand':'Max. incl. overflow',
  'Tägliche Lagerhaltung':'Daily storage cost','Tägliche Überbestandsgebühr':'Daily overflow fee',
  'Bereits gebaut':'Already built','Lagergebäude':'Warehouse','Einheiten':'units','Lager öffnen':'Open storage','Kapazität':'Capacity','Auslastung':'Utilization','7-Tage-Verlauf':'7-day history','Entwicklung der letzten 7 Tage':'Development over the last 7 days','Aktueller Wert':'Current value','Verlauf wird geladen …':'Loading history …','Keine Verlaufsdaten verfügbar.':'No history data available.',
  'Firmenstatus':'Company status','Letzte Finanzbewegungen':'Latest financial transactions',
  'Bauen':'Build','Errichte neue Gebäude für Produktion, Handel und Forschung.':'Construct new buildings for production, retail and research.',
  'Gebäude bauen':'Build building','Wähle eine Kategorie und errichte ein neues Gebäude.':'Choose a category and construct a new building.',
  'Kategorie':'Category','Alle':'All','Produktion':'Production','Verkauf':'Retail','Handel':'Retail',
  'Wähle ein konkretes Gebäude aus. Produktion und Handelsverkauf werden direkt diesem Gebäude zugeordnet.':'Select a specific building. Production and retail sales are assigned directly to this building.',
  'Gebäudeplätze':'Building slots','Produktionsauftrag':'Production order','Wähle oben ein Produktionsgebäude aus.':'Select a production building above.',
  'Produkt':'Product','Anzahl Einheiten':'Number of units','Produktion starten':'Start production','Produktionsrezept':'Production recipe',
  'Im Handel verkaufen':'Sell in retail','Wähle oben ein Verkaufsgebäude aus.':'Select a retail building above.',
  'Qualität':'Quality','Preis je Einheit':'Price per unit','Gesamtbetrag':'Total amount','Menge':'Quantity','Suche':'Search','Typ':'Type',
  'Rohstoffe':'Raw materials','Produkte':'Products','Zurücksetzen':'Reset','Am Markt verkaufen':'Sell on marketplace',
  'Art':'Type','Rohstoff':'Raw material','Gut':'Item','Order erstellen':'Create order','Offene Marktorders':'Open market orders',
  'Nächste Marktaktualisierung':'Next market update','Gesamtkosten':'Total cost','Kaufen':'Buy',
  'Vertrag vorschlagen':'Propose contract','Direkte Verträge zwischen Spielerunternehmen sind gebührenfrei.':'Direct contracts between player companies are fee-free.',
  'Ich möchte':'I want to','kaufen':'buy','verkaufen':'sell','Partner':'Partner','Partner suchen':'Search partner','Unternehmensname oder Unternehmens-ID':'Company name or company ID','Noch kein Partner ausgewählt':'No partner selected yet','Kein Unternehmen gefunden':'No company found','Gut-Typ':'Item type','Material':'Material',
  'Meine Verträge':'My contracts','Eingehende Verträge':'Incoming contracts','Ausgehende Verträge':'Outgoing contracts','Absender':'Sender','Empfänger':'Recipient','Kaufsumme':'Purchase total','Verkaufssumme':'Sale total','Ablehnen':'Reject','Produktforschung':'Product research','Forschungseinheiten im Lager':'Research units in storage',
  'Ø Einstandswert':'Ø acquisition value','Forschungseinheiten investieren':'Invest research units','Investieren':'Invest',
  'Anleihen & Kredite':'Bonds & loans','Finanzübersicht':'Financial overview','Tag':'Day','Woche':'Week','Monat':'Month',
  'Finanzbewegungen':'Financial transactions','Version':'Version','Account-Daten':'Account data','Ändern':'Change',
  'Neue E-Mail':'New email','Neues Passwort bestätigen':'Confirm new password','Speichern':'Save','Abbrechen':'Cancel',
  'Benachrichtigungen':'Notifications','Push-Benachrichtigungen auf diesem Gerät':'Push notifications on this device',
  'Aktiviert':'Enabled','Unternehmensverwaltung':'Company management','Unternehmensname':'Company name','Umbenennen':'Rename',
  'Diese Aktionen können nicht rückgängig gemacht werden.':'These actions cannot be undone.',
  'Unternehmen zurücksetzen':'Reset company','Unternehmen löschen':'Delete company','Unternehmen gründen':'Found company',
  'Startkapital: 100.000 OC$ inklusive Elektronikfabrik und Elektronikgeschäft.':'Starting capital: 100,000 OC$ including an electronics factory and electronics store.',
  'Firmenname':'Company name','Hinweis':'Notice','Bestätigung':'Confirmation','Eingabe':'Input','Bestätigen':'Confirm',
  'Sprache':'Language','Deutsch':'Deutsch','Englisch':'Englisch','Platz':'Rank','Gegründet':'Founded',
  'Status':'Status','Level':'Level','Erfahrung':'Experience','Name':'Name','Mitarbeiter':'Employees','Firma':'Company',
  'Gebühr':'Fee','Aktion':'Action','Auswählen':'Select','Ausgewählt':'Selected','Stornieren':'Cancel',
  'Noch keine Daten.':'No data yet.','Noch nicht gewertet':'Not ranked yet','Position auswählen':'Select position',
  'Nur gleicher Artikel':'Same item only','Frei':'Available','Im Bau / Ausbau':'Under construction / upgrade',
  'Produktion läuft':'Production running','Verkauf läuft':'Retail sale running','Auftrag öffnen':'Open order',
  'Verkauf öffnen':'Open sale','Im Handel verwenden':'Use for retail','Ausbauen':'Upgrade','Abreißen':'Demolish','Abstufen':'Downgrade',
  'Bau abbrechen':'Cancel construction','Auswählen':'Select','Produktionskosten fehlen':'Production costs missing','Verkauf nicht möglich':'Sale not possible',
  'Nicht genügend Bestand':'Insufficient inventory','Maximal 24 Std. Verkaufsdauer':'Maximum retail duration: 24 hours',
  'Keine Auswahl verfügbar':'No options available','Bitte wählen':'Please select','Keine passenden Bestände im Lager':'No matching stock in storage',
  'Keine passenden Produkte verfügbar':'No matching products available','Keine Qualität auf Lager':'No quality in storage',
  'Startkapital':'Starting capital','Marktverkauf':'Market sale','Handelsgewinn':'Retail profit',
  'Abbruchgebühr Handel':'Retail cancellation fee','Kauf':'Purchase','Erstattung Produktion':'Production refund',
  'Baukosten':'Construction costs','Gebäude-Erstattung':'Building refund','Forschungsinvestition':'Research investment',
  'Anleiheninvestment':'Bond investment','Kreditauszahlung':'Loan payout','Kredittilgung':'Loan repayment',
  'Tilgungseingang':'Principal repayment income','Zinsabgabe':'Interest paid','Zinserlös':'Interest income',
  'Zinserlös vom Staat':'Interest income from state','Zinsausfall':'Interest default',
  'Staatliche Kreditausfallentschädigung':'State loan default compensation','Insolvenzverfahren':'Insolvency procedure',
  'Online':'Online','Offline':'Offline','Forschungseinheit':'Research Unit',

  // Building names
  'Autofabrik':'Car Factory','Autohaus':'Car Dealership','Baufabrik':'Construction Factory','Baumarkt':'Home Improvement Store',
  'Chemiefabrik':'Chemical Factory','Chemiehandel':'Chemical Store','Elektronikfabrik':'Electronics Factory',
  'Elektronikgeschäft':'Electronics Store','Energietechnikfabrik':'Energy Technology Factory','Forschungsgebäude':'Research Building',
  'Lebensmittelfabrik':'Food Factory','Maschinenfabrik':'Machinery Factory','Modegeschäft':'Fashion Store',
  'Supermarkt':'Supermarket','Technikhandel':'Technology Store','Textilfabrik':'Textile Factory',

  // Materials
  'Aluminium':'Aluminum','Ammoniak':'Ammonia','Aromastoff':'Flavoring','Baumwolle':'Cotton','Chemikalien':'Chemicals',
  'Erdöl':'Crude Oil','Glas':'Glass','Hafer':'Oats','Kaffeebohnen':'Coffee Beans','Kakaobohnen':'Cocoa Beans',
  'Kalkstein':'Limestone','Kartoffeln':'Potatoes','Kautschuk':'Rubber','Kies':'Gravel','Kupfer':'Copper','Lithium':'Lithium',
  'Milch':'Milk','Orangen':'Oranges','Pflanzenöl':'Vegetable Oil','Phosphat':'Phosphate','Sand':'Sand','Silizium':'Silicon',
  'Stahl':'Steel','Tierhaut':'Animal Hide','Tomate':'Tomato','Ton':'Clay','Trockenfrüchte':'Dried Fruit','Wasser':'Water',
  'Weizen':'Wheat','Wirkstoff':'Active Ingredient','Wolle':'Wool','Zuckerrohr':'Sugar Cane',

  // Products
  'Akkupack':'Battery Pack','Anzug':'Suit','Autoreifen':'Car Tire','Badehose':'Swim Shorts','Basecap':'Baseball Cap',
  'Batterieelektrolyt':'Battery Electrolyte','Beton':'Concrete','Bluse':'Blouse','Bremssystem':'Brake System','Brot':'Bread',
  'Displaymodul':'Display Module','Drohne':'Drone','Düngemittel':'Fertilizer','Eiscreme':'Ice Cream','Elektro-LKW':'Electric Truck',
  'Elektroauto':'Electric Car','Elektrofahrrad':'Electric Bicycle','Elektromotor':'Electric Motor','Elektronikmodul':'Electronics Module',
  'Elektroverteiler':'Electrical Distribution Unit','Energydrink':'Energy Drink','Fahrzeugbatterie':'Vehicle Battery',
  'Fahrzeugsteuergerät':'Vehicle Control Unit','Fenster':'Window','Fruchtsaft':'Fruit Juice','Funktionsstoff':'Performance Fabric',
  'Garn':'Yarn','Getriebe':'Transmission','Gummi':'Rubber','Gürtel':'Belt','Handschuhe':'Gloves','Industrie-Roboter':'Industrial Robot',
  'Industriekleber':'Industrial Adhesive','Joghurt':'Yogurt','Kaffee':'Coffee','Karosserie':'Car Body','Kartoffelchips':'Potato Chips',
  'Käse':'Cheese','Kleid':'Dress','Kleinwagen':'Compact Car','Kühlauflieger':'Refrigerated Trailer','Kunstfaser':'Synthetic Fiber',
  'Kunststoffgranulat':'Plastic Granulate','Kupferrohr':'Copper Pipe','Ladesäule':'Charging Station','Leder':'Leather',
  'Lederschuhe':'Leather Shoes','Ledertasche':'Leather Bag','Lieferwagen':'Delivery Van','LKW':'Truck',
  'LKW-Auflieger':'Truck Trailer','LKW-Rahmen':'Truck Frame','Mehl':'Flour','Motorrad':'Motorcycle','Müsli':'Muesli',
  'Pflanzenschutzmittel':'Crop Protection Agent','Prozessor':'Processor','Reinigungsmittel':'Cleaning Agent','Reisebus':'Coach',
  'Rock':'Skirt','Rucksack':'Backpack','Schal':'Scarf','Schokolade':'Chocolate','Silikon':'Silicone','Solarmodul':'Solar Module',
  'Solarzelle':'Solar Cell','Sporthose':'Sports Pants','Sportshirt':'Sports Shirt','Sportwagen':'Sports Car','Stadtbus':'City Bus',
  'Stahlrohr':'Steel Pipe','Stahlträger':'Steel Beam','Stoff':'Fabric','Tiefkühlpizza':'Frozen Pizza','Traktor':'Tractor',
  'Transportcontainer':'Shipping Container','Verbrennungsmotor':'Combustion Engine','Winterjacke':'Winter Jacket',
  'Wollstoff':'Wool Fabric','Zement':'Cement','Ziegelstein':'Brick','Zucker':'Sugar'
};


Object.assign(I18N_EN, {
  'Ausbau auf Level':'Upgrade to level',
  'Gebäude im Bau':'Building under construction',
  'Ende':'Ends',
  'Uhr':'',
  // Language selector itself
  'Deutsch':'German',
  'Englisch':'English',

  // Static HTML text not covered in the first pass
  'Du kannst eine Stückzahl, eine Dauer wie':'You can enter a quantity, a duration such as',
  'oder eine Zielzeit wie':'or a target time such as',
  'eingeben. Der Verkauf läuft im oben ausgewählten Verkaufsgebäude.':'The sale runs in the retail building selected above.',
  'Du kannst Produkte und Rohstoffe aus deinem Lager anbieten. Bei erfolgreichen Marktverkäufen werden 5% Marktgebühr vom Verkaufserlös abgezogen.':
    'You can offer products and raw materials from your storage. A 5% market fee is deducted from successful market sales.',
  'Zurücksetzen behält Account und Firmenname, löscht aber den Spielfortschritt und setzt das Startkapital auf 100.000 OC$ und stellt eine Elektronikfabrik sowie ein Elektronikgeschäft bereit. Löschen entfernt zusätzlich den Account.':
    'Reset keeps your account and company name, but deletes game progress, restores starting capital to 100,000 OC$, and provides an electronics factory and electronics store. Deleting also removes the account.',

  // Loading/errors/status
  'Unbekannter Fehler':'Unknown error',
  'Präsenz konnte nicht aktualisiert werden:':'Presence could not be updated:',
  'Kontostand-Realtime nicht verfügbar – Sicherheitsabfrage bleibt aktiv.':'Real-time balance updates unavailable – fallback polling remains active.',
  'NPC-Markt-Tick:':'NPC market tick:',
  'Keine E-Mail hinterlegt':'No email address stored',
  'Es wurden keine Änderungen vorgenommen.':'No changes were made.',
  'Die beiden Passwörter stimmen nicht überein.':'The two passwords do not match.',
  'Die Passwörter stimmen nicht überein.':'The passwords do not match.',
  'Das neue Passwort muss mindestens 6 Zeichen lang sein.':'The new password must be at least 6 characters long.',
  'Account-Daten werden geändert …':'Updating account data …',
  'Änderung gespeichert. Falls E-Mail-Bestätigung aktiviert ist, bestätige bitte die neue Adresse über die zugesandte E-Mail.':
    'Changes saved. If email confirmation is enabled, please confirm the new address using the email sent to you.',
  'Passwort erfolgreich geändert.':'Password changed successfully.',
  'Account-Daten konnten nicht geändert werden.':'Account data could not be changed.',
  'Dieser Browser unterstützt keine Push-Benachrichtigungen.':'This browser does not support push notifications.',
  'Benachrichtigungen sind im Browser blockiert.':'Notifications are blocked in the browser.',
  'Benachrichtigungen wurden nicht aktiviert.':'Notifications were not enabled.',
  'Push-Konfiguration konnte nicht geladen werden.':'Push configuration could not be loaded.',
  'Push-Benachrichtigungen sind auf diesem Gerät aktiv.':'Push notifications are enabled on this device.',
  'Push-Benachrichtigungen sind auf diesem Gerät deaktiviert.':'Push notifications are disabled on this device.',
  'Push-Benachrichtigungen sind auf diesem Gerät nicht aktiviert.':'Push notifications are not enabled on this device.',
  'Passwort zurücksetzen':'Reset password',
  'Tägliche XP:':'Daily XP:',
  'Gebäudebau:':'Building construction:',
  'Produktionsabschluss:':'Production completion:',
  'Handelsabschluss:':'Retail completion:',

  // Data-load labels/errors
  'Produkte':'Products','Alle Produkte':'All products','Produktlager':'Product storage','Materialien':'Materials',
  'Materiallager':'Material storage','Rezepte':'Recipes','Gebäudetypen':'Building types','Produktionen':'Productions',
  'Handelsverkäufe':'Retail sales','Marktorders':'Market orders','Marktkäufe':'Market purchases',
  'Firmenverzeichnis':'Company directory','Kreditschulden':'Loan debt','Anleihen':'Bonds',
  'Unternehmenswert-Verlauf':'Company value history','Unternehmensranking':'Company ranking',

  // Production
  'Einheiten':'Units','Benötigtes Gebäude':'Required building','Keines':'None','Benötigt':'Required',
  'Mindestqualität Inputs':'Minimum input quality','Gebäudelevel':'Building level','Produktionsrate':'Production rate',
  'Produktionsmenge':'Production quantity','Produktionsdauer':'Production duration',
  'Beschaffungskosten Warenbörse':'Marketplace procurement costs','Marktpreise':'Market prices',
  'Grund-Produktionskosten':'Base production costs','Produktionskosten gesamt':'Total production costs',
  'Produktion abbrechen':'Cancel production','Benötigtes Gebäude fehlt.':'Required building is missing.',
  'Es muss mindestens 1 Einheit produziert werden können.':'At least 1 unit must be producible.',
  'Die gewählte Menge überschreitet die maximale Produktionsdauer von 24 Stunden.':'The selected quantity exceeds the maximum production duration of 24 hours.',
  'Nicht genügend Material für diese Produktionsmenge.':'Not enough material for this production quantity.',
  'Keine Plätze':'No slots','Dieses Gebäude hat bereits einen laufenden Produktionsauftrag.':'This building already has an active production order.',
  'Dieses Gebäude ist frei. Wähle ein Produkt und starte die Produktion.':'This building is available. Select a product and start production.',
  'Kaufen':'Buy',

  // Buildings
  'Fertigstellung läuft …':'Completing …','Gebäudebau konnte nicht aktualisiert werden:':'Building construction could not be updated:',
  'In dieser Kategorie sind noch keine Gebäude vorhanden.':'There are no buildings in this category yet.',
  'Bau abbrechen':'Cancel construction','Schließen':'Close','Bereit':'Ready',

  // Retail
  'Dieses Geschäft hat bereits einen laufenden Verkaufsauftrag.':'This store already has an active retail order.',
  'Dieses Geschäft ist frei. Wähle Produkt, Preis und Menge.':'This store is available. Select product, price and quantity.',
  'Keine Handelsprodukte verfügbar':'No retail products available',
  'Verkauf abbrechen':'Cancel sale','Benötigtes Gebäude fehlt':'Required building missing',
  'Nur ganze Einheiten':'Whole units only','Verkaufsgebäude':'Retail building','Gebäudestatus':'Building status',
  'Verkaufsrate':'Sales rate','Verfügbarer Bestand':'Available stock','Ausgewählte Menge':'Selected quantity',
  'Gewählter Verkaufspreis':'Selected retail price','Preisbedingte Nachfrage':'Price-driven demand',
  'Verkaufsdauer':'Sale duration','Erwarteter Erlös':'Expected revenue','Abbruchgebühr':'Cancellation fee',
  'Verkaufsrechner':'Retail calculator','Gebäudelevel':'Building level','Produkt auswählen':'Select product',
  'Menge / Stunden / Uhrzeit':'Quantity / hours / time','Verkaufspreis':'Sale price',
  'Nachfrage':'Demand','Effektive Verkaufsrate':'Effective sales rate','Basis-Verkaufsrate':'Base sales rate',
  'Referenzpreis':'Reference price','Erwarteter Umsatz':'Expected revenue',
  'Wert':'value','Einheit':'unit',

  // Market
  'Mehrfachauswahl ist nur für denselben Artikel in derselben Qualität möglich.':'Multiple selection is only possible for the same item at the same quality.',
  'Preis':'Price','Max.':'Max.','Erfüllt':'Fulfilled','Storniert':'Cancelled',
  'Die maximale Verkaufsdauer beträgt 24 Stunden.':'The maximum sale duration is 24 hours.',
  'Verkaufsorder wirklich stornieren?':'Really cancel this sell order?',
  'Bitte wähle mindestens eine Marktposition aus.':'Please select at least one market position.',
  'Bitte gib eine gültige Menge ein.':'Please enter a valid quantity.',
  'Es dürfen nur Positionen desselben Artikels ausgewählt werden.':'Only positions for the same item may be selected.',
  'Kein passender Lagerbestand für eine Marktorder vorhanden.':'No matching inventory is available for a market order.',
  'Keine Rohstoffe im Lager':'No raw materials in storage','Keine Produkte im Lager':'No products in storage',

  // Contracts
  'Verkäufer':'Seller','Käufer':'Buyer','Vorgeschlagen':'Proposed','Angenommen':'Accepted','Erfüllen':'Fulfill',
  'Abgelehnt':'Rejected','Es gibt noch kein anderes Spielerunternehmen für einen Vertrag.':'There is no other player company available for a contract yet.',
  'Für diesen Verkauf ist kein passender Lagerbestand vorhanden.':'No matching inventory is available for this sale.',
  'Bitte wähle ein Gut aus.':'Please select an item.',

  // Finance / bonds
  'Aktueller Monat':'Current month','Aktuelle Woche':'Current week','Anleihedaten konnten nicht geladen werden.':'Bond data could not be loaded.',
  'Finanziert':'Funded','Zins':'Interest','Noch offen':'Outstanding','Kreditgeber':'Lender',
  'Ursprünglich':'Original','Kreditnehmer':'Borrower','Zinserlöse':'Interest income',
  'Bitte mindestens 1 Anleihe und mindestens 0,50% Tageszins angeben.':'Please enter at least 1 bond and at least 0.50% daily interest.',
  'Bitte einen Betrag größer als 0 OC$ eingeben.':'Please enter an amount greater than 0 OC$.',
  'Bitte einen Tilgungsbetrag größer als 0 OC$ eingeben.':'Please enter a repayment amount greater than 0 OC$.',
  'Nächste Stufe':'Next level',
  'Anleihen werden auf Unternehmenslevel 10 freigeschaltet.':'Bonds unlock at company level 10.',
  'Zinsausfall':'Interest default',

  // Rename/account/reset/delete
  'Neuen Unternehmensnamen eingeben:':'Enter a new company name:',
  'Kein Produkt verfügbar':'No product available',
  'Unternehmensnamen ändern':'Change company name',
  'Produkt suchen':'Search product','Produktname oder Kategorie':'Product name or category','Keine Produkte gefunden.':'No products found.','Ausgewählt':'Selected','z. B. Smartphone oder Elektronik':'e.g. smartphone or electronics',
  'Enzyklopädie':'Encyclopedia','Begriff oder Spielmechanik suchen':'Search term or game mechanic',
  'Keine Artikel gefunden.':'No articles found.','Zum Spielbereich':'Go to game area',
  'Verwandte Themen':'Related topics','Alle':'All','Grundlagen':'Basics','Gebäude':'Buildings',
  'Produktion':'Production','Lager':'Storage','Warenbörse':'Marketplace','Forschung':'Research',
  'Verträge':'Contracts','Finanzen':'Finance','Handel':'Commerce',
  'Erste Schritte':'Getting started','Unternehmenslevel & XP':'Company level & XP',
  'Unternehmenswert':'Company value','Rangliste':'Leaderboard','Gebäudelevel':'Building levels',
  'Produktionsrezepte':'Production recipes','Produktionskosten':'Production costs',
  'Qualitätsstufen':'Quality levels','Lagergebäude':'Warehouse','Lagerhaltungskosten':'Storage costs',
  'Überbestand':'Overflow stock','Lagerwert':'Storage value','Ø Einstandskosten':'Average unit cost',
  'Rohstoffe':'Raw materials','Marktorders':'Market orders','Marktgebühr':'Market fee',
  'Preisfindung & Richtpreise':'Pricing & guide prices','NPC-Markt':'NPC market',
  'Order-Historie':'Order history','Produktforschung':'Product research',
  'Forschungseinheiten':'Research units','Patentwert':'Patent value','Direktverträge':'Direct contracts',
  'Vertragsablauf':'Contract flow','Finanzbewegungen':'Financial transactions',
  'Anleihen & Kredite':'Bonds & loans','Anleihezinsen':'Bond interest','Zinsausfall':'Interest default',
  'Einzelhandel':'Retail','Kurz erklärt':'In short','So funktioniert es':'How it works','Beispiel':'Example','Wichtig':'Important','Produkte':'Products','Automatisch':'Automatic','Favoriten':'Favorites','Zuletzt gelesen':'Recently read','Zu Favoriten hinzufügen':'Add to favorites','Aus Favoriten entfernen':'Remove from favorites','Link kopieren':'Copy link','Link zum Enzyklopädie-Artikel wurde kopiert.':'Encyclopedia article link copied.','Link zum Enzyklopädie-Artikel:':'Encyclopedia article link:',
  'OC-Boost':'OC-Boost','Zum Shop':'Open shop','OC-Boost-Shop':'OC-Boost Shop',
  'Dein Guthaben':'Your balance','OCB heute':'OCB today','Favoriten':'Favorites',
  'Tägliche Anmeldung':'Daily login','Erste Produktion des Tages':'First production of the day',
  'Erster Handelsverkauf des Tages':'First retail sale of the day','Kaufen':'Buy',
  'Bau beschleunigen':'Speed up construction','OCB erhalten':'Get OCB',
  'OC-Boost (OCB)':'OC-Boost (OCB)',


  'Account erstellt. Bitte ggf. E-Mail bestätigen.':'Account created. Please confirm your email if required.',
  'Bitte zuerst E-Mail eingeben.':'Please enter your email first.',
  'Passwort-Link wurde versendet.':'Password reset link has been sent.',
  'Letzte Bestätigung: Unternehmensfortschritt jetzt vollständig zurücksetzen?':'Final confirmation: completely reset company progress now?',
  'Unternehmen wurde zurückgesetzt. Du startest wieder mit 100.000 OC$.':'Company has been reset. You start again with 100,000 OC$.',
  'Zur Bestätigung bitte LÖSCHEN eingeben:':'Type DELETE to confirm:',
  'LÖSCHEN':'DELETE',
  'Löschen abgebrochen. Bestätigung war nicht korrekt.':'Deletion cancelled. Confirmation was incorrect.',
  'Das unfertige Gebäude wird entfernt.':'The unfinished building will be removed.',
  'abreißen':'demolish',

  // Password toggle
  'Passwort verbergen':'Hide password','Passwort anzeigen':'Show password',

  // Generic time/status wording
  'Sekunden':'seconds','Minuten':'minutes','Stunden':'hours','Tage':'days',
  'pro Einheit':'per unit','Tageszins':'daily interest'
});


Object.assign(I18N_EN, {
  'Account-ID':'Account ID',
  'Unternehmens-ID':'Company ID',
  'Dieser Unternehmensname wurde bereits verwendet':'This company name has already been used',
  'Produktionskosten':'Production costs',
  'Einstandskosten':'Acquisition costs',
  'Erlös':'Revenue',
  'Verfügbarer Bestand':'Available stock',

  'Bereits verkauft':'Already sold',
  'Referenzpreis':'Reference price',
  'Im Handel verwenden':'Use for retail',
  'Keine Plätze':'No slots',


  'Stück':'pcs',
  'Beschaffungskosten':'Procurement costs',
  'Personalkosten':'Personnel costs',
  'Sonstige Kosten':'Other costs',
  'Auftrag':'Order',
  'Bestand beim Start':'Starting stock',
  'Wertbonus':'Value bonus',
  'Ø Kosten':'Ø costs',
  'Geplante Investition':'Planned investment',
  'Patentwertsteigerung':'Patent value increase',
  'Zeitraum':'Period',
  'Einnahmen / Gewinne':'Income / profits',
  'Vorprodukt':'Intermediate product',
  'Nicht gebaut':'Not built',
  'Voll finanziert':'Fully funded',
  'Automatisch getilgt':'Automatically repaid',
  'Getilgt':'Repaid',
  'Ausgefallen':'Defaulted',
  'Beendet':'Closed',
  'Offen':'Open',
  'Anzahl':'Count',
  'Rest':'Remaining',
  'Wert':'Value',
  'kg':'kg',
  'Liter':'liters',
  'l':'l',
  'm²':'m²',
  'm³':'m³',


  'Wertbonus':'Value bonus',
  'Ø Kosten':'Ø costs',
  'Bestand beim Start':'Starting stock',
  'Zeitraum':'Period',
  'Einnahmen / Gewinne':'Income / profits',
  'Geplante Investition':'Planned investment',
  'Patentwertsteigerung':'Patent value increase',
  'Vorprodukt':'Intermediate product',
  'Annehmen':'Accept',
  'Offen':'Open',
  'Beendet':'Closed',
  'Aktiv':'Active',
  'Getilgt':'Repaid',
  'Automatisch getilgt':'Automatically repaid',
  'Ausgefallen':'Defaulted',
  'Anzahl':'Count',
  'Baukosten':'Construction costs',
  'Rest':'Remaining',
  'Wert':'Value',

  'Betrag':'Amount',
  'Beschreibung':'Description',
  'Zeit':'Time',
  'Einstand':'Acquisition cost',
  'Einnahmen':'Income',
  'Ausgaben':'Expenses',
  'Gewinn / Verlust':'Profit / loss',
  'Gewinn/Verlust':'Profit / loss',
  'Sonstige Kosten':'Other costs',
  'Ein- und Auszahlungen':'Cash movements',
  'Gewinn- und Verlustrechnung':'Profit and loss statement',
  'Betriebserträge':'Operating revenue',
  'Betriebsausgaben':'Operating expenses',
  'Betriebsergebnis':'Operating result',
  'Investitionen':'Investments',
  'Investitionsergebnis':'Investment result',
  'Finanzergebnis':'Financial result',
  'Gesamtergebnis':'Net result',
  'Warenbörse – Verkäufe':'Marketplace sales',
  'Einzelhandel – Verkäufe':'Retail sales',
  'Vertragsverkäufe':'Contract sales',
  'Zwangsauktionen':'Forced auctions',
  'Produktionskosten':'Production costs',
  'Markteinkäufe':'Market purchases',
  'Vertragskäufe':'Contract purchases',
  'Marktgebühren':'Market fees',
  'Storno-/Abbruchgebühren':'Cancellation fees',
  'Forschungskosten':'Research costs',
  'Patentwert-Gewinne':'Patent value gains',
  'Sonstige Betriebskosten':'Other operating costs',
  'Gebäudeerstattungen':'Building refunds',
  'Zinserträge':'Interest income',
  'Zinsaufwand':'Interest expense',
  'Kapitalbewegungen':'Capital movements',
  'nicht ergebniswirksam':'not included in profit/loss',
  'Anleiheerlöse':'Bond proceeds',
  'Anleiheinvestitionen':'Bond investments',
  'Tilgungen':'Repayments',
  'Gründungskapital':'Founding capital',
  'Verkäufe':'Sales',
  'Handel':'Trading',
  'Finanzierung':'Financing',
  'Sonstiges':'Other',
  'Restmenge':'Remaining quantity',
  'Einstandswert':'Acquisition value',
  'Gesamtwert':'Total value',
  'Bestand':'Stock',
  'Kaufpreis':'Purchase price',
  // Remaining production/building labels
  'Bau':'Construction',
  'Im Bau':'Under construction',
  'Nicht gebaut':'Not built',
  'Bauzeit':'Construction time',
  'Produktqualität':'Product quality',
  'Produkt-Basisrate':'Product base rate',
  'Produkt-Basisverkaufsrate':'Product base sales rate',
  'Verkaufspreis':'Sale price',
  'Einsammelbarer Erlös':'Collectable revenue',
  'Erwarteter Erlös (offen)':'Expected revenue (outstanding)',
  'Keine Rohstoffe benötigt. Forschungseinheiten benötigen ausschließlich Geld: 12 OC$ Grundkosten + 14 OC$ Personalkosten pro Einheit.':
    'No raw materials required. Research units require cash only: 12 OC$ base cost + 14 OC$ personnel cost per unit.',
  'Es befinden sich keine Produkte für den Handelsverkauf im Lager.':'There are no products in storage for retail sale.',

  // Finance
  'Gebühren':'Fees',
  'Marktkäufe':'Market purchases',
  'Zinsen':'Interest',
  'Kreditlimit (99%)':'Credit limit (99%)',
  'Offene Kreditsumme':'Outstanding loan amount',
  'Noch verfügbar':'Still available',
  '1 Anleihe = 5.000 OC$. Mindestzins 0,50% täglich. Das Kreditlimit entspricht 99% des Gebäudewerts, abgerundet auf 5.000 OC$.':
    '1 bond = 5,000 OC$. Minimum interest rate 0.50% daily. The credit limit equals 99% of the building value, rounded down to 5,000 OC$.',
  'Täglicher Zinssatz':'Daily interest rate',
  'Kredit anfragen':'Request loan',
  'Meine Kreditanfragen':'My loan requests',
  'Anfrage':'Request',
  'Rest':'Remaining',
  'Erstellt':'Created',
  'Investition':'Investment',
  'Meine aufgenommenen Kredite':'My borrowed loans',
  'Restschuld':'Remaining debt',
  'Erhalten / Ziel':'Received / target',
  'Tilgbar ab':'Repayable from',
  'Tilgung':'Repayment',
  'Investiert':'Invested',
  'Restforderung':'Remaining receivable',

  // Research
  'Aktuelle Qualität':'Current quality',
  'Noch benötigt':'Still required',
  'Gewählter Orderpreis':'Selected order price',
  'Bruttoerlös':'Gross revenue',
  'Marktgebühr (5%)':'Market fee (5%)',
  'Nettoerlös':'Net revenue',

  // Categories
  'Elektronik':'Electronics',
  'Maschinen':'Machinery',
  'Automobil':'Automotive',
  'Chemie':'Chemicals',
  'Textil':'Textiles',
  'Lebensmittel':'Food',
  'Energietechnik':'Energy technology',
  'Sonstige':'Other',

  // Misc.
  'Voll finanziert':'Fully funded',
  'Wird täglich um 01:00 Uhr neu berechnet':'Recalculated daily at 01:00',
  'Öffentliche Rangliste:':'Public leaderboard:',
  'Inaktivitäts-Logout:':'Inactivity logout:'
});

const I18N_EN_REPLACEMENTS = [
  ['Bereits verkauft','Already sold'],
  ['Referenzpreis','Reference price'],
  ['Im Handel verwenden','Use for retail'],
  ['Keine Plätze','No slots'],

  ['% Wert','% value'],
  ['Beschaffungskosten','Procurement costs'],
  ['Personalkosten','Personnel costs'],
  ['Sonstige Kosten','Other costs'],
  ['Bestand beim Start','Starting stock'],
  ['Geplante Investition','Planned investment'],
  ['Patentwertsteigerung','Patent value increase'],
  ['Wertbonus','Value bonus'],
  ['Ø Kosten','Ø costs'],
  ['Vorprodukt','Intermediate product'],
  ['Nicht gebaut','Not built'],
  ['Voll finanziert','Fully funded'],
  ['Automatisch getilgt','Automatically repaid'],
  ['Getilgt','Repaid'],
  ['Ausgefallen','Defaulted'],
  ['Beendet','Closed'],
  ['Offen','Open'],
  ['Stück','pcs'],

  ['% Wert','% value'],
  [' · Produktion',' · Production'],
  [' · Verkauf',' · Retail'],
  [' · Forschung',' · Research'],
  ['Bestand beim Start','Starting stock'],
  ['Einnahmen / Gewinne','Income / profits'],
  ['Geplante Investition','Planned investment'],
  ['Patentwertsteigerung','Patent value increase'],
  ['Wertbonus','Value bonus'],
  ['Ø Kosten','Ø costs'],
  ['Vorprodukt','Intermediate product'],
  ['Nicht gebaut','Not built'],
  ['Voll finanziert','Fully funded'],
  ['Automatisch getilgt','Automatically repaid'],
  ['Getilgt','Repaid'],
  ['Ausgefallen','Defaulted'],
  ['Beendet','Closed'],
  ['Offen','Open'],

  ['Keine Rohstoffe benötigt. Forschungseinheiten benötigen ausschließlich Geld:',
   'No raw materials required. Research units require cash only:'],
  [' Grundkosten + ',' base cost + '],
  [' Personalkosten pro Einheit.',' personnel cost per unit.'],
  [' Einheiten – fertig am ',' units – finishes on '],
  [' Einheiten / Std.',' units / hr'],
  [' Einheiten',' units'],
  [' / Einheit',' / unit'],
  [' Uhr',''],
  [' verfügbar',' available'],
  [' Verkauf läuft',' sale active'],
  [' Handelsverkauf',' retail sale'],
  [' · Produktion',' · Production'],
  [' · Handelsverkauf',' · Retail sale'],
  ['Kosten: ','Cost: '],
  ['. Bauzeit: ','. Construction time: '],
  ['Bau abgebrochen. Erstattung: ','Construction cancelled. Refund: '],
  ['Produkt-Basisrate','Product base rate'],
  ['Produkt-Basisverkaufsrate','Product base sales rate'],
  ['Produktqualität','Product quality'],
  ['Aktuelle Qualität','Current quality'],
  ['Noch benötigt','Still required'],
  [' Forschungseinheiten',' research units'],
  ['Täglicher Zinssatz','Daily interest rate'],
  ['Mindestzins','Minimum interest rate'],
  [' täglich',' daily'],
  ['Gebäudewerts','building value'],
  ['Offene Kreditsumme','Outstanding loan amount'],
  ['Noch verfügbar','Still available'],
  ['Meine Kreditanfragen','My loan requests'],
  ['Meine aufgenommenen Kredite','My borrowed loans'],
  ['Kreditlimit','Credit limit'],
  ['Restschuld','Remaining debt'],
  ['Restforderung','Remaining receivable'],
  ['Tilgbar ab','Repayable from'],
  ['Gewählter Orderpreis','Selected order price'],
  ['Bruttoerlös','Gross revenue'],
  ['Nettoerlös','Net revenue'],
  ['Marktgebühr','Market fee'],
  ['Keine Qualität auf Lager','No quality in storage'],
  ['Kein passender Lagerbestand für eine Marktorder vorhanden.',
   'No matching inventory is available for a market order.'],
  ['Keine Rohstoffe im Lager','No raw materials in storage'],
  ['Keine Produkte im Lager','No products in storage'],
  ['Noch nicht gewertet','Not ranked yet'],
  ['Noch keine Daten.','No data yet.'],
  ['Anleihedaten konnten nicht geladen werden.','Bond data could not be loaded.'],
  ['Nicht gebaut','Not built'],
  ['Im Bau','Under construction'],
  ['Bauzeit','Construction time'],
  ['Voll finanziert','Fully funded'],

  ['Unternehmensdaten konnten nicht geladen werden.','Company data could not be loaded.'],
  ['Spieldaten konnten nicht vollständig geladen werden.','Game data could not be loaded completely.'],
  [' wird auf Unternehmenslevel ',' unlocks at company level '],
  [' freigeschaltet.','.' ],
  ['Benötigtes Gebäude','Required building'],
  ['Mindestqualität Inputs','Minimum input quality'],
  ['Gebäudelevel','Building level'],
  ['Produktionsrate','Production rate'],
  ['Produktionsmenge','Production quantity'],
  ['Produktionsdauer','Production duration'],
  ['Grund-Produktionskosten','Base production costs'],
  ['Produktionskosten gesamt','Total production costs'],
  ['Abbruch möglich:','Cancellation possible:'],
  ['der Produktionskosten','of production costs'],
  ['und 90% der Materialien werden erstattet.','and 90% of materials will be refunded.'],
  ['Bereit:','Ready:'],
  [' Einheiten in ',' units in '],
  [' Std. für ',' hrs for '],
  [' Einheiten offen',' units remaining'],
  ['Verkauf läuft','Sale active'],
  [' verfügbar',' available'],
  ['Verkaufsgebäude','Retail building'],
  ['Gebäudestatus','Building status'],
  ['Verkaufsrate','Sales rate'],
  ['Verfügbarer Bestand','Available stock'],
  ['Ausgewählte Menge','Selected quantity'],
  ['Gewählter Verkaufspreis','Selected retail price'],
  ['Preisbedingte Nachfrage','Price-driven demand'],
  ['Verkaufsdauer','Sale duration'],
  ['Erwarteter Erlös','Expected revenue'],
  ['Abbruchgebühr','Cancellation fee'],
  [' pro Einheit',' per unit'],
  ['Nur gleicher Artikel','Same item only'],
  ['Zinsausfall:','Interest default:'],
  [' von 3 Tagen.',' of 3 days.'],
  ['Nach dem dritten aufeinanderfolgenden Ausfall wird das Unternehmen zurückgesetzt.',
   'After the third consecutive default, the company will be reset.'],
  ['Dein verfügbarer Kreditspielraum beträgt aktuell ','Your currently available borrowing capacity is '],
  [' Anleihe',' bond'],
  [' Anleihen',' bonds'],
  [' über ',' for '],
  [' zu ',' at '],
  [' Tageszins anfragen?',' daily interest?'],
  [' für diese Anleihe bereitstellen? Der Betrag wird sofort von deinem Kontostand abgebucht.',
   ' for this bond? The amount will be deducted from your cash balance immediately.'],
  [' auf diesen Kreditanteil tilgen?',' repay on this loan share?'],
  [' Forschungseinheiten',' research units'],
  ['Der Firmenname kann wieder ab ','The company name can be changed again from '],
  [' geändert werden.','.' ],
  ['Unternehmensnamen wirklich in „','Really change company name to “'],
  ['“ ändern? Danach ist eine weitere Änderung 14 Tage lang gesperrt.',
   '”? After that, another change is locked for 14 days.'],
  ['Namensänderung wieder ab ','Name change available again from '],
  ['Aktuell gibt es keine passende Marktorder für ','There is currently no matching market order for '],
  ['Aktuell ist keine Menge von ','There is currently no quantity of '],
  [' am Markt verfügbar.',' available on the market.'],
  ['Es fehlen ','Missing '],
  ['Am Markt sind aktuell ','Currently available on the market: '],
  ['Diese Menge für ca. ','Buy this quantity for about '],
  ['Fehlende ','Missing '],
  [' für ca. ',' for about '],
  [' kaufen?',' buy?'],
  [' auf Level ',' to level '],
  [' aufstufen?',' upgrade?'],
  ['Voraussichtlich fertig am ','Expected completion: '],
  ['Während des Ausbaus ist das Gebäude nicht nutzbar.',
   'The building cannot be used during the upgrade.'],
  ['Mitarbeiter und vorhandene Gebäudekapazität nach Fertigstellung:',
   'Employees and existing building capacity after completion:'],
  ['den Ausbau von ','the upgrade of '],
  [' abbrechen',' cancel'],
  ['Das Gebäude bleibt auf Level ','The building remains at level '],
  ['Du erhältst ','You receive '],
  [' zurück (95% der Kosten dieser Baustufe).',' back (95% of the cost of this construction level).'],
  ['Das Gebäude wird vollständig entfernt. Erstattung:',
   'The building will be removed completely. Refund:'],
  ['(95% der Baukosten).','(95% of construction costs).'],
  ['Die letzte Aufstufung wird zurückgenommen. Erstattung:',
   'The last upgrade will be reverted. Refund:'],
  ['(95% der Kosten dieser Stufe).','(95% of the cost of this level).'],
  ['Verkauf wirklich abbrechen? Noch nicht verkaufte Ware wird zurück ins Lager gelegt. Abbruchgebühr:',
   'Really cancel the sale? Unsold goods will be returned to storage. Cancellation fee:'],
  ['(20% des erwarteten Erlöses).','(20% of expected revenue).'],
  ['Die ausgewählten Positionen enthalten zusammen nur ','The selected positions contain only '],
  [' ausgewählten Marktposition(en) für insgesamt ',' selected market position(s) for a total of '],
  ['Durchschnittspreis:','Average price:'],
  [' pro Einheit.',' per unit.'],
  [' in „',' in “'],
  [' investieren?',' invest?'],
  [' hat Qualität Q',' has reached quality Q'],
  [' erreicht.','.' ],
  [' wurden in ',' were invested in '],
  [' investiert.','.' ],
  ['Push-Benachrichtigungen konnten nicht geändert werden:',
   'Push notification settings could not be changed:'],
  ['Unternehmen wirklich zurücksetzen?','Really reset the company?'],
  ['Alle Gebäude, Lagerbestände, laufenden Produktionen, Marktaktivitäten und Finanzdaten werden gelöscht.',
   'All buildings, inventory, running production, market activity and financial data will be deleted.'],
  ['Firmenname und Account bleiben erhalten.','Company name and account remain.'],
  ['Startkapital danach:','Starting capital afterwards:'],
  ['Unternehmen wirklich löschen?','Really delete the company?'],
  ['Danach musst du dich neu registrieren.','You will need to register again afterwards.'],

  ['Unternehmen gegründet.','Company founded.'],
  ['Angemeldet.','Logged in.'],
  ['Account erstellt.','Account created.'],
  ['Noch keine','No'],
  ['Einheiten offen','units remaining'],
  ['Std.','hrs'],
  ['Min.','min'],
  ['Ende ','Ends '],
  ['Im Bau · ','Under construction · '],
  ['Gebäudeplätze','Building slots'],
  ['Mitarbeiter','employees'],
  ['Tagesveränderung','Daily change'],
  ['Berechnung um 01:00 Uhr','Calculated at 01:00'],
  ['Nächste Namensänderung möglich ab ','Next name change available from '],
  ['Der Unternehmensname kann geändert werden. Danach gilt erneut eine Sperre von 14 Tagen.',
   'The company name can be changed. A new 14-day lock then applies.'],
  ['Rangliste konnte nicht geladen werden.','Leaderboard could not be loaded.'],
  ['Noch keine Ranglistendaten verfügbar.','No leaderboard data available yet.'],
  ['Stand: ','As of: '],
  ['Sitzung nach 60 Minuten Inaktivität beendet.','Session ended after 60 minutes of inactivity.']
];

const originalTextNodes = new WeakMap();
const originalAttributes = new WeakMap();
let languageMutationObserver = null;
let languageMutationGuard = false;

function uiLocale() {
  return currentLanguage === 'en' ? 'en-US' : 'de-DE';
}

function translateUiCore(value) {
  const text = String(value ?? '');
  if (currentLanguage !== 'en') return text;
  if (Object.prototype.hasOwnProperty.call(I18N_EN, text)) return I18N_EN[text];
  let translated = text;
  const replacements = [...I18N_EN_REPLACEMENTS].sort((a, b) => b[0].length - a[0].length);
  for (const [de, en] of replacements) translated = translated.split(de).join(en);
  return translated;
}

function translateUiString(value) {
  const source = String(value ?? '');
  const match = source.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return translateUiCore(source);
  return `${match[1]}${translateUiCore(match[2])}${match[3]}`;
}

function translateTextNode(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE) return;
  if (node.parentElement?.closest('script,style')) return;

  const current = node.nodeValue || '';
  const stored = originalTextNodes.get(node);

  if (currentLanguage === 'de') {
    if (stored !== undefined && current !== stored) node.nodeValue = stored;
    return;
  }

  let original = stored;
  if (original === undefined || current !== translateUiString(original)) {
    original = current;
    originalTextNodes.set(node, original);
  }

  const translated = translateUiString(original);
  if (current !== translated) node.nodeValue = translated;
}

function translateElementAttributes(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
  const attrs = ['placeholder','title','aria-label'];
  let originals = originalAttributes.get(element);
  if (!originals) {
    originals = {};
    originalAttributes.set(element, originals);
  }

  for (const attr of attrs) {
    if (!element.hasAttribute(attr)) continue;
    const current = element.getAttribute(attr) || '';

    if (currentLanguage === 'de') {
      if (Object.prototype.hasOwnProperty.call(originals, attr) && current !== originals[attr]) {
        element.setAttribute(attr, originals[attr]);
      }
      continue;
    }

    const previousOriginal = originals[attr];
    if (previousOriginal === undefined || current !== translateUiString(previousOriginal)) originals[attr] = current;
    const translated = translateUiString(originals[attr]);
    if (current !== translated) element.setAttribute(attr, translated);
  }
}

function applyLanguageToDom(root = document) {
  if (!root) return;
  languageMutationGuard = true;
  try {
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }

    const walkerRoot = root.nodeType === Node.DOCUMENT_NODE ? root.documentElement : root;
    if (!walkerRoot) return;

    if (walkerRoot.nodeType === Node.ELEMENT_NODE) translateElementAttributes(walkerRoot);

    const walker = document.createTreeWalker(
      walkerRoot,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT
    );
    let node = walker.currentNode;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
      else if (node.nodeType === Node.ELEMENT_NODE) translateElementAttributes(node);
      node = walker.nextNode();
    }
  } finally {
    languageMutationGuard = false;
  }
}

function syncLanguageControls() {
  ['authLanguageSelect','settingsLanguageSelect'].forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    if (select.value !== currentLanguage) select.value = currentLanguage;
    if (typeof syncCustomSelect === 'function') syncCustomSelect(select);
  });
}

function setLanguage(language, { persist = true, rerender = true } = {}) {
  currentLanguage = language === 'en' ? 'en' : 'de';
  document.documentElement.lang = currentLanguage;

  if (persist) {
    try { window.localStorage.setItem('opencompany_language', currentLanguage); }
    catch (_) {}
  }

  syncLanguageControls();
  applyLanguageToDom(document);

  if (rerender && state?.company && typeof renderAll === 'function') {
    renderAll();
    applyLanguageToDom(document.getElementById('gameView'));
  }
  if (rerender && !state?.session && typeof loadPublicLeaderboard === 'function') {
    loadPublicLeaderboard();
  }
}

function initializeLanguage() {
  document.documentElement.lang = currentLanguage;

  ['authLanguageSelect','settingsLanguageSelect'].forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    select.value = currentLanguage;
    select.addEventListener('change', () => setLanguage(select.value));
  });

  applyLanguageToDom(document);

  if (!languageMutationObserver) {
    languageMutationObserver = new MutationObserver(mutations => {
      if (languageMutationGuard) return;
      if (currentLanguage !== 'en') return;
      languageMutationGuard = true;
      try {
        for (const mutation of mutations) {
          if (mutation.type === 'characterData') translateTextNode(mutation.target);
          mutation.addedNodes?.forEach(node => applyLanguageToDom(node));
        }
      } finally {
        languageMutationGuard = false;
      }
    });
    languageMutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
}


const state = {
  session: null,
  accountCode: null,
  company: null,
  products: [],
  allProducts: [],
  inventory: [],
  materials: [],
  materialInventory: [],
  storageSearchFilter: '',
  storageTypeFilter: 'all',
  storageStatus: null,
  recipes: [],
  buildingTypes: [],
  buildings: [],
  productionJobs: [],
  retailSaleJobs: [],
  transactions: [],
  marketOrders: [],
  marketTrades: [],
  marketSearchFilter: '',
  marketTypeFilter: 'all',
  marketQualityFilter: 'all',
  marketView: 'catalog',
  marketSelectedItemKey: '',
  researchSearchFilter: '',
  researchSelectedProductId: null,
  encyclopediaSearch: '',
  encyclopediaCategory: 'Alle',
  encyclopediaSelectedArticleId: 'getting-started',
  ocbStatus: { balance: 0, today: { login:false, production:false, retail:false, earned:0, maximum:20 } },
  selectedMarketOrderIds: [],
  selectedBuildingId: null,
  selectedRetailBuildingId: null,
  buildingOverviewFilter: 'all',
  openDashboardAfterLogin: false,
  financePeriod: 'day',
  financePeriodOffset: 0,
  financeMovementFilter: 'all',
  contracts: [],
  companyDirectory: [],
  companyDebt: 0,
  companyValueChange: 0,
  valuationHistory: [],
  companyRanking: null,
  bondDashboard: null,
  recoveringPassword: false
};

let presenceTimer = null;
let productionRefreshTimer = null;
let productionClaimDisplayTimer = null;
let npcMarketCountdownTimer = null;
let companyValueRefreshTimer = null;
let buildingConstructionTimer = null;
let companyBalancePollTimer = null;
let companyBalanceChannel = null;
let publicLeaderboardTimer = null;
let inactivityLogoutTimer = null;
let lastUserActivityAt = 0;
let inactivityListenersInstalled = false;
let inactivityLogoutInProgress = false;
const INACTIVITY_LIMIT_MS = 60 * 60 * 1000;
const LAST_VIEW_STORAGE_PREFIX = 'opencompany_last_view_';

function lastViewStorageKey(userId = state.session?.user?.id) {
  return userId ? `${LAST_VIEW_STORAGE_PREFIX}${userId}` : '';
}

function saveLastView(view) {
  const key = lastViewStorageKey();
  if (!key || !view) return;
  try {
    localStorage.setItem(key, view);
  } catch (_) {}
}

function loadLastView() {
  const key = lastViewStorageKey();
  if (!key) return '';
  try {
    return localStorage.getItem(key) || '';
  } catch (_) {
    return '';
  }
}

function clearLastView(userId = state.session?.user?.id) {
  const key = lastViewStorageKey(userId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch (_) {}
}


const money = n => `${new Intl.NumberFormat(uiLocale(), {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(Number(n || 0))} OC$`;

const dashboardCashMoney = n => `${new Intl.NumberFormat(uiLocale(), {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(Number(n || 0))} OC$`;
const num = n => new Intl.NumberFormat(uiLocale(), { maximumFractionDigits: 2 }).format(Number(n || 0));
const balanceMoney = n => `${new Intl.NumberFormat(uiLocale(), { maximumFractionDigits: 0 }).format(Number(n || 0))} OC$`;


// Zentrale Spielregeln für alle Frontend-Anzeigen und Berechnungen.
// Serverseitige Regeln werden weiterhin in Supabase erzwungen; diese Struktur
// ist die gemeinsame Quelle für die im Client dargestellten Regelwerte.
const GAME_RULES = Object.freeze({
  fees: Object.freeze({
    marketRate: 0.05,
    retailCancellationRate: 0.20,
    storageDailyRate: 0.05,
    storageOverflowRate: 0.20
  }),
  schedules: Object.freeze({
    companyValuation: '01:00',
    companyRanking: '01:30',
    storageDaily: '02:00',
    bondInterest: '03:00',
    npcMarketIntervalMinutes: 15
  }),
  unlockLevels: Object.freeze({
    contracts: 5,
    research: 5,
    bonds: 10
  }),
  quality: Object.freeze({
    valueBonusPerLevel: 0.05
  }),
  pricing: Object.freeze({
    playerRecommendedCostMultiplier: 2,
    retailAverageCostMultiplier: 2.50,
    retailMinAverageMultiplier: 0.75,
    retailMaxAverageMultiplier: 1.20,
    retailPeakBand: 0.05,
    marketMinCostMultiplier: 1.10,
    npcMaxCostMultiplier: 2.50
  }),
  ocb: Object.freeze({
    minutesPerBoost: 1,
    dailyLogin: 10,
    dailyProduction: 5,
    dailyRetail: 5,
    dailyMaximum: 20,
    packages: Object.freeze([
      Object.freeze({ amount:100, price:3.49 }),
      Object.freeze({ amount:450, price:6.49 }),
      Object.freeze({ amount:750, price:8.99 }),
      Object.freeze({ amount:1000, price:10.49 }),
      Object.freeze({ amount:1300, price:12.99 }),
      Object.freeze({ amount:1750, price:16.99 }),
      Object.freeze({ amount:2000, price:18.99 }),
      Object.freeze({ amount:2500, price:22.99 })
    ])
  })
});

const rulePercent = rate => Math.round(Number(rate || 0) * 100);
const ruleTime = key => GAME_RULES.schedules[key] || '–';
const qualityMultiplier = quality =>
  1 + Math.max(0, Number(quality || 1) - 1) * GAME_RULES.quality.valueBonusPerLevel;
const retailAveragePrice = unitCost =>
  Math.round(Math.max(0, Number(unitCost || 0)) * GAME_RULES.pricing.retailAverageCostMultiplier * 100) / 100;
const retailMinPrice = unitCost =>
  Math.round(retailAveragePrice(unitCost) * GAME_RULES.pricing.retailMinAverageMultiplier * 100) / 100;
const retailMaxPrice = unitCost =>
  Math.round(retailAveragePrice(unitCost) * GAME_RULES.pricing.retailMaxAverageMultiplier * 100) / 100;
const retailProfitFactor = (unitCost, unitPrice) => {
  const average = retailAveragePrice(unitCost);
  const minimum = retailMinPrice(unitCost);
  const maximum = retailMaxPrice(unitCost);
  const peakLow = average * (1 - GAME_RULES.pricing.retailPeakBand);
  const peakHigh = average * (1 + GAME_RULES.pricing.retailPeakBand);
  const price = Number(unitPrice || 0);

  if (!(average > 0) || price <= minimum || price >= maximum) return 0;
  if (price < peakLow) return Math.max(0, Math.min(1, (price - minimum) / Math.max(0.000001, peakLow - minimum)));
  if (price <= peakHigh) return 1;
  return Math.max(0, Math.min(1, (maximum - price) / Math.max(0.000001, maximum - peakHigh)));
};
const retailEffectiveUnitRevenue = (unitCost, unitPrice) => {
  const price = Math.max(0, Number(unitPrice || 0));
  return price * retailProfitFactor(unitCost, price);
};

function transportContainerFreight(quantity) {
  const requested = Math.max(0, Number(quantity || 0));
  const container = state.products.find(product => product.name === 'Transportcontainer');
  if (!container || requested <= 0) {
    return { required: requested, available: 0, cost: 0, sufficient: requested <= 0 };
  }

  const lots = productInventoryLots(container.id)
    .filter(lot => Number(lot.quantity || 0) > 0)
    .sort((a,b) =>
      Number(a.quality_level || 1) - Number(b.quality_level || 1) ||
      String(a.id || '').localeCompare(String(b.id || ''))
    );

  const available = lots.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
  let remaining = requested;
  let cost = 0;

  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(lot.quantity || 0));
    cost += take * Number(lot.average_unit_cost || 0);
    remaining -= take;
  }

  return {
    required: requested,
    available,
    cost: Math.round(cost * 100) / 100,
    sufficient: available + 1e-9 >= requested
  };
}

const researchRequirement = quality => {
  const q = Math.max(1, Number(quality || 1));
  if (q <= 1) return 400;
  if (q === 2) return 1000;
  if (q === 3) return 2000;
  if (q === 4) return 3500;
  return 5000 + Math.max(0, q - 5) * 2000;
};
const productQuality = product => Math.max(1, Number(product?.quality_level || 1));
const minimumInputQuality = product => Math.max(1, productQuality(product) - 1);


const COMPANY_XP_TOTALS = [
  0,0,250,600,1050,1650,2450,3450,4700,6200,7950,9950,
  12450,15450,18950,22950,27450,32450,38450,45450,53450,
  62450,72450,83950,96950,111450,127450,145450,165450,
  187450,211450
];

function buildingSlotsForLevel(level) {
  return Math.min(16, 4 + 2 * Math.min(6, Math.floor(Math.max(0, Number(level || 0)) / 5)));
}

function xpProgressContext(company = state.company) {
  const level = Math.max(0, Math.min(30, Number(company?.company_level || 0)));
  const totalXp = Math.max(0, Number(company?.experience_points || 0));
  const currentBase = COMPANY_XP_TOTALS[level] || 0;
  const nextTotal = level >= 30 ? currentBase : COMPANY_XP_TOTALS[level + 1];
  const needed = Math.max(0, nextTotal - currentBase);
  const progress = level >= 30 ? needed : Math.max(0, totalXp - currentBase);
  return {
    level,
    totalXp,
    currentBase,
    nextTotal,
    needed,
    progress,
    percent: level >= 30 ? 100 : Math.max(0, Math.min(100, needed > 0 ? progress / needed * 100 : 0))
  };
}

function featureRequiredLevel(view) {
  return ({
    contracts: GAME_RULES.unlockLevels.contracts,
    research: GAME_RULES.unlockLevels.research,
    loans: GAME_RULES.unlockLevels.bonds
  })[view] || 0;
}

function featureUnlocked(view) {
  return Number(state.company?.company_level || 0) >= featureRequiredLevel(view);
}

function updateFeatureLocks() {
  document.querySelectorAll('.nav-item[data-view]').forEach(button => {
    const required = featureRequiredLevel(button.dataset.view);
    if (!required) return;
    const unlocked = featureUnlocked(button.dataset.view);
    button.classList.toggle('feature-locked', !unlocked);
    button.dataset.locked = unlocked ? 'false' : 'true';
    const baseLabel = button.dataset.baseLabel || button.textContent.replace(/\s*🔒.*$/, '');
    button.dataset.baseLabel = baseLabel;
    button.textContent = unlocked ? baseLabel : `${baseLabel} 🔒 L${required}`;
  });
}

function productInventoryLots(productId) {
  return state.inventory.filter(row => row.product_id === productId);
}
function materialInventoryLots(materialId) {
  return state.materialInventory.filter(row => row.material_id === materialId);
}
function inventoryLotSummary(rows, minQuality = 1) {
  const eligible = (rows || []).filter(row => Number(row.quality_level || 1) >= minQuality && Number(row.quantity || 0) > 0);
  const quantity = eligible.reduce((sum,row) => sum + Number(row.quantity || 0), 0);
  const value = eligible.reduce((sum,row) => sum + Number(row.quantity || 0) * Number(row.average_unit_cost || 0), 0);
  return { quantity, averageUnitCost: quantity > 0 ? value / quantity : 0, rows: eligible };
}
function productLot(productId, quality) {
  return state.inventory.find(row => row.product_id === productId && Number(row.quality_level || 1) === Number(quality || 1));
}
function availableProductQualities(productId) {
  return productInventoryLots(productId).filter(row => Number(row.quantity || 0) > 0).sort((a,b)=>Number(a.quality_level||1)-Number(b.quality_level||1));
}
function researchCategory(product) {
  const building = state.buildingTypes.find(bt => bt.id === product?.required_building_type_id);
  const name = building?.name || '';
  return ({
    'Elektronikfabrik':'Elektronik','Maschinenfabrik':'Maschinen','Autofabrik':'Automobil','Chemiefabrik':'Chemie',
    'Baufabrik':'Bau','Textilfabrik':'Textil','Lebensmittelfabrik':'Lebensmittel','Energietechnikfabrik':'Energietechnik',
    'Forschungsgebäude':'Forschung'
  })[name] || 'Sonstige';
}

function ownsProductProductionBuilding(product) {
  if (!product?.required_building_type_id) return false;
  return state.buildings.some(building => building.building_type_id === product.required_building_type_id);
}

function hasProductInventory(productId) {
  return productInventoryLots(productId).some(row => Number(row.quantity || 0) > 0);
}

function operationalProductVisible(product) {
  if (!product) return false;
  return hasProductInventory(product.id) || ownsProductProductionBuilding(product);
}

function operationalProducts() {
  return state.products.filter(operationalProductVisible);
}

function stockedProducts() {
  return state.products.filter(product => hasProductInventory(product.id));
}

function activeBuildingsOfType(buildingTypeId) {
  if (!buildingTypeId) return [];
  return state.buildings.filter(
    building => building.building_type_id === buildingTypeId && building.status === 'active'
  );
}

function buildingTypeHasFreeSlot(buildingTypeId, jobs) {
  const buildings = activeBuildingsOfType(buildingTypeId);
  if (!buildings.length) return false;

  return buildings.some(building =>
    !jobs.some(job => job.status === 'running' && job.building_id === building.id)
  );
}

function productionSelectableProducts() {
  const products = operationalProducts();
  const runningJobs = state.productionJobs.filter(job => job.status === 'running');
  const runningProductIds = new Set(runningJobs.map(job => job.product_id));

  return products.filter(product => {
    const buildingTypeId = product.required_building_type_id;
    const buildings = activeBuildingsOfType(buildingTypeId);

    // Bestehendes Verhalten beibehalten, wenn kein aktives Produktionsgebäude vorhanden ist.
    if (!buildings.length) return true;

    // Sobald mindestens ein Gebäude dieses Typs frei ist, sind wieder alle
    // grundsätzlich verfügbaren Produkte dieses Gebäudetyps auswählbar.
    if (buildingTypeHasFreeSlot(buildingTypeId, runningJobs)) return true;

    // Sind alle Gebäude dieses Typs belegt, nur die tatsächlich laufenden Produkte zeigen.
    return runningProductIds.has(product.id);
  });
}

function retailSelectableProducts() {
  const selectedBuilding = state.buildings.find(
    building => building.id === state.selectedRetailBuildingId && building.status === 'active'
  ) || null;

  if (selectedBuilding) {
    const runningJob = state.retailSaleJobs.find(
      job => job.building_id === selectedBuilding.id && job.status === 'running'
    ) || null;

    if (runningJob) {
      const runningProduct = state.products.find(product => product.id === runningJob.product_id);
      return runningProduct ? [runningProduct] : [];
    }

    return stockedProducts()
      .filter(product =>
        product.name !== 'Transportcontainer' &&
        product.required_retail_building_type_id === selectedBuilding.building_type_id
      )
      .sort((a,b) => a.name.localeCompare(b.name,uiLocale()));
  }

  return [];
}

function operationalProductIdentitySet() {
  return new Set(operationalProducts().map(product => `${product.name}::${product.category}`));
}

function friendlyDatabaseError(error) {
  const text = String(error?.message || error || '');
  if (
    text.includes('Dieser Unternehmensname wurde bereits verwendet') ||
    text.includes('companies_name_normalized_uidx') ||
    text.includes('duplicate key value violates unique constraint')
  ) {
    return translateUiString('Dieser Unternehmensname wurde bereits verwendet');
  }
  return text;
}

function msg(el, text, type='') { el.textContent = translateUiString(text); el.className = `status ${type}`; }


function openGameDialog({ title='Hinweis', message='', mode='alert', defaultValue='' } = {}) {
  const overlay = document.getElementById('gameDialogOverlay');
  const titleEl = document.getElementById('gameDialogTitle');
  const messageEl = document.getElementById('gameDialogMessage');
  const inputEl = document.getElementById('gameDialogInput');
  const cancelBtn = document.getElementById('gameDialogCancel');
  const confirmBtn = document.getElementById('gameDialogConfirm');

  if (!overlay || !titleEl || !messageEl || !inputEl || !cancelBtn || !confirmBtn) {
    return Promise.resolve(mode === 'confirm' ? false : mode === 'prompt' ? null : true);
  }

  titleEl.textContent = translateUiString(title);
  messageEl.textContent = translateUiString(String(message ?? ''));
  inputEl.classList.toggle('hidden', mode !== 'prompt');
  cancelBtn.classList.toggle('hidden', mode === 'alert');
  confirmBtn.textContent = mode === 'alert' ? 'OK' : translateUiString('Bestätigen');
  inputEl.value = mode === 'prompt' ? String(defaultValue ?? '') : '';

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('game-dialog-open');

  return new Promise(resolve => {
    const close = result => {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('game-dialog-open');
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      overlay.onclick = null;
      document.removeEventListener('keydown', onKeyDown);
      resolve(result);
    };

    const acceptDialog = () => close(mode === 'prompt' ? inputEl.value : true);
    const cancelDialog = () => close(mode === 'prompt' ? null : false);
    const onKeyDown = event => {
      if (event.key === 'Escape' && mode !== 'alert') cancelDialog();
      if (event.key === 'Enter' && (mode !== 'prompt' || document.activeElement === inputEl)) {
        event.preventDefault();
        acceptDialog();
      }
    };

    confirmBtn.onclick = acceptDialog;
    cancelBtn.onclick = cancelDialog;
    overlay.onclick = event => {
      if (event.target === overlay && mode !== 'alert') cancelDialog();
    };
    document.addEventListener('keydown', onKeyDown);
    setTimeout(() => (mode === 'prompt' ? inputEl : confirmBtn).focus(), 0);
  });
}

function gameAlert(message, title='Hinweis') {
  return openGameDialog({ title, message, mode:'alert' });
}

function gameConfirm(message, title='Bestätigung') {
  return openGameDialog({ title, message, mode:'confirm' });
}

function gamePrompt(message, defaultValue='', title='Eingabe') {
  return openGameDialog({ title, message, mode:'prompt', defaultValue });
}

function transactionLabel(type) {
  const label = ({
    founding_capital: 'Startkapital',
    market_sale: 'Marktverkauf',
    retail_sale: 'Handelsgewinn',
    retail_cancel_fee: 'Abbruchgebühr Handel',
    market_fee: 'Gebühr',
    market_buy: 'Kauf',
    production: 'Produktion',
    production_refund: 'Erstattung Produktion',
    construction: 'Baukosten',
    building_refund: 'Gebäude-Erstattung',
    research: 'Forschung',
    research_investment: 'Forschungsinvestition',
    bond_investment: 'Anleiheninvestment',
    bond_proceeds: 'Kreditauszahlung',
    bond_repayment: 'Kredittilgung',
    bond_principal_income: 'Tilgungseingang',
    bond_interest_paid: 'Zinsabgabe',
    bond_interest_income: 'Zinserlös',
    bond_interest_state: 'Zinserlös vom Staat',
    bond_interest_missed: 'Zinsausfall',
    bond_default_compensation: 'Staatliche Kreditausfallentschädigung',
    bond_default_reset: 'Insolvenzverfahren',
    storage_fee: 'Lagerhaltungskosten',
    storage_overflow_fee: 'Überbestandsgebühr',
    storage_forced_auction: 'Zwangsversteigerung Lager',
    storage_auction_fee: 'Gebühr Zwangsversteigerung',
    contract_buy: 'Vertragskauf',
    contract_sale: 'Vertragsverkauf',
    freight_cost: 'Frachtkosten'
  })[type] || type;
  return translateUiString(label);
}

function transactionAmountClass(type) {
  return [
    'market_fee','market_buy','production','construction','retail_cancel_fee','research',
    'bond_investment','bond_repayment','bond_interest_paid','storage_fee','storage_overflow_fee','storage_auction_fee',
    'contract_buy'
  ].includes(type) ? 'transaction-amount fee' : 'transaction-amount';
}


function buildingLevelMultiplier(level) {
  const lvl = Math.max(1, Number(level || 1));
  let factor = 1;
  if (lvl >= 2) factor *= 2;
  if (lvl >= 3) factor *= 1.95;
  if (lvl >= 4) factor *= 1.90;
  if (lvl >= 5) factor *= 1.85;
  if (lvl >= 6) factor *= Math.pow(1.0366, lvl - 5);
  return factor;
}

function buildingUpgradePercent(nextLevel) {
  if (nextLevel === 2) return 100;
  if (nextLevel === 3) return 95;
  if (nextLevel === 4) return 90;
  if (nextLevel === 5) return 85;
  if (nextLevel >= 6) return 3.66;
  return 0;
}

function buildingConstructionHours(targetLevel) {
  const level = Math.max(1, Number(targetLevel || 1));
  if (level <= 2) return 3;
  if (level === 3) return 5;
  if (level === 4) return 7;
  if (level === 5) return 10;
  return 10 + ((level - 5) * 5);
}

function formatBuildingConstructionTime(hours) {
  return `${num(hours)} Std.`;
}

function buildingConstructionFinishText(hours) {
  const finish = new Date(Date.now() + (Number(hours || 0) * 60 * 60 * 1000));
  return finish.toLocaleString(uiLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function buildingConstructionFinishDate(building) {
  if (!building?.construction_complete_at) return '–';
  return new Date(building.construction_complete_at).toLocaleString(uiLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}


function buildingRemainingMinutes(building) {
  if (!building?.construction_complete_at) return 0;
  return Math.max(
    0,
    Math.ceil((new Date(building.construction_complete_at).getTime() - Date.now()) / 60000)
  );
}

function currentOcbBalance() {
  return Math.max(0, Number(state.ocbStatus?.balance ?? state.company?.ocb_balance ?? 0));
}

function renderOcbShop() {
  const balance = currentOcbBalance();
  const today = state.ocbStatus?.today || {};
  const balanceEl = document.getElementById('ocbShopBalance');
  const totalEl = document.getElementById('ocbDailyTotal');
  const rewardsEl = document.getElementById('ocbDailyRewards');
  const packagesEl = document.getElementById('ocbShopPackages');

  if (balanceEl) balanceEl.textContent = `${num(balance)} OCB`;
  if (totalEl) totalEl.textContent = `${num(today.earned || 0)} / ${num(today.maximum || GAME_RULES.ocb.dailyMaximum)} OCB`;

  if (rewardsEl) {
    const rewards = [
      { done:!!today.login, label:'Tägliche Anmeldung', amount:GAME_RULES.ocb.dailyLogin },
      { done:!!today.production, label:'Erste Produktion des Tages', amount:GAME_RULES.ocb.dailyProduction },
      { done:!!today.retail, label:'Erster Handelsverkauf des Tages', amount:GAME_RULES.ocb.dailyRetail }
    ];
    rewardsEl.innerHTML = rewards.map(reward => `
      <div class="ocb-daily-reward ${reward.done ? 'done' : ''}">
        <span><span class="ocb-reward-check">${reward.done ? '✓' : '○'}</span> ${translateUiString(reward.label)}</span>
        <strong>+${reward.amount} OCB</strong>
      </div>
    `).join('');
  }

  if (packagesEl) {
    packagesEl.innerHTML = GAME_RULES.ocb.packages.map(pack => `
      <article class="ocb-shop-package">
        <strong>${num(pack.amount)} OCB</strong>
        <span class="ocb-shop-package-price">${pack.price.toLocaleString(uiLocale(), { minimumFractionDigits:2, maximumFractionDigits:2 })} €</span>
        <button type="button" class="ocb-buy-btn" onclick="startOcbPurchase(${pack.amount},${pack.price})">${translateUiString('Kaufen')}</button>
      </article>
    `).join('');
  }

  const dashboardValue = document.getElementById('statOcb');
  if (dashboardValue) dashboardValue.textContent = `⚡ ${num(balance)} OCB`;
}

window.openOcbShop = function() {
  renderOcbShop();
  const overlay = document.getElementById('ocbShopOverlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden','false');
};

window.closeOcbShop = function() {
  const overlay = document.getElementById('ocbShopOverlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden','true');
};

window.startOcbPurchase = async function(amount, price) {
  const valid = GAME_RULES.ocb.packages.some(pack =>
    Number(pack.amount) === Number(amount) && Number(pack.price) === Number(price)
  );
  if (!valid) return;

  await gameAlert(
    `Das Paket mit ${num(amount)} OCB für ${Number(price).toLocaleString(uiLocale(), { minimumFractionDigits:2, maximumFractionDigits:2 })} € ist vorbereitet. Für echte Käufe muss noch ein Zahlungsanbieter angebunden werden. OCB werden erst nach bestätigter serverseitiger Zahlung gutgeschrieben.`,
    'OC-Boost-Shop'
  );
};

window.speedUpBuildingWithOcb = async function(buildingId, minutes = null) {
  const building = state.buildings.find(item => item.id === buildingId);
  if (!building?.construction_complete_at) return;

  const remaining = buildingRemainingMinutes(building);
  if (remaining <= 0) {
    await refreshBuildingConstruction();
    return;
  }

  const requested = minutes == null ? remaining : Math.min(Math.max(1, Number(minutes || 0)), remaining);
  const cost = requested;
  const balance = currentOcbBalance();

  if (balance < cost) {
    await gameAlert(`Nicht genügend OC-Boosts. Benötigt: ${num(cost)} OCB, verfügbar: ${num(balance)} OCB.`);
    openOcbShop();
    return;
  }

  const actionText = requested >= remaining
    ? `Bau sofort für ${num(cost)} OCB fertigstellen?`
    : `Bauzeit um ${num(requested)} Minuten für ${num(cost)} OCB verkürzen?`;

  if (!await gameConfirm(actionText, 'OC-Boost einsetzen')) return;

  const { data, error } = await sb.rpc('speed_up_building', {
    p_company_id: state.company.id,
    p_building_id: buildingId,
    p_minutes: minutes == null ? null : requested
  });

  if (error) {
    await gameAlert(error.message);
    return;
  }

  if (state.ocbStatus) state.ocbStatus.balance = Number(data?.balance ?? Math.max(0,balance-cost));
  if (state.company) state.company.ocb_balance = Number(data?.balance ?? Math.max(0,balance-cost));
  await loadCompany();
};

function formatBuildingConstructionStatus(building) {
  if (!building?.construction_complete_at) return 'Im Bau';
  const target = new Date(building.construction_complete_at);
  const remainingMs = target.getTime() - Date.now();
  if (remainingMs <= 0) return 'Fertigstellung läuft …';

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `Im Bau · ${hours > 0 ? `${hours} Std. ` : ''}${minutes} Min.`;
}

async function refreshBuildingConstruction() {
  if (!sb || !state.company?.id || document.visibilityState === 'hidden') return;

  const { data, error } = await sb.rpc('complete_due_buildings', {
    p_company_id: state.company.id
  });

  if (error) {
    console.warn('Gebäudebau konnte nicht aktualisiert werden:', error.message);
    return;
  }

  if (Number(data || 0) > 0) {
    await loadGameData();
  } else if (state.buildings?.some(b => b.status === 'inactive' && b.construction_complete_at)) {
    renderBuildings();
  }
}


function renderTable(headers, rows) {
  if (!rows.length) return `<p class="muted">${translateUiString('Noch keine Daten.')}</p>`;
  return `<table><thead><tr>${headers.map(h=>`<th>${translateUiString(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}
function companyName(id) {
  if (id === state.company?.id) return state.company.name;
  return state.companyDirectory.find(c => c.id === id)?.name || '–';
}
function itemName(row) {
  return row.products?.name || row.materials?.name || '–';
}

function getCompanyLoadErrorBox() {
  let errorBox = document.getElementById('companyLoadError');
  if (!errorBox) {
    errorBox = document.createElement('section');
    errorBox.id = 'companyLoadError';
    errorBox.className = 'panel warning hidden';
    document.querySelector('.main-content').insertBefore(errorBox, document.getElementById('authView'));
  }
  return errorBox;
}
function clearCompanyLoadError() {
  const box = getCompanyLoadErrorBox();
  box.textContent = '';
  box.classList.add('hidden');
}
function showCompanyLoadError(error) {
  const box = getCompanyLoadErrorBox();
  box.textContent = `Unternehmensdaten konnten nicht geladen werden. ${error.message || 'Unbekannter Fehler'}`;
  box.classList.remove('hidden');
}
function getGameDataErrorBox() {
  let errorBox = document.getElementById('gameDataError');
  if (!errorBox) {
    errorBox = document.createElement('section');
    errorBox.id = 'gameDataError';
    errorBox.className = 'panel warning hidden';
    document.getElementById('gameView').prepend(errorBox);
  }
  return errorBox;
}
function clearGameDataError() {
  const box = getGameDataErrorBox();
  box.textContent = '';
  box.classList.add('hidden');
}
function showGameDataError(errors) {
  const box = getGameDataErrorBox();
  box.textContent = `Spieldaten konnten nicht vollständig geladen werden. ${errors.map(x => `${x.label}: ${x.error.message || 'Unbekannter Fehler'}`).join(' | ')}`;
  box.classList.remove('hidden');
}


async function touchPresence() {
  if (!sb || !state.company?.id || document.visibilityState === 'hidden') return;
  const { data, error } = await sb.rpc('touch_company_presence', { p_company_id: state.company.id });
  if (error) {
    console.warn('Präsenz konnte nicht aktualisiert werden:', error.message);
    return;
  }
  state.company.last_seen_at = data;
  renderCompanyStatus();
}

function companyValueChangeDisplay(currentValue, changeValue) {
  const current = Number(currentValue || 0);
  const change = Number(changeValue || 0);
  const previous = current - change;
  const percentage = previous !== 0 ? (change / Math.abs(previous)) * 100 : 0;

  const amountText = change > 0
    ? `+${money(change)}`
    : change < 0
      ? `-${money(Math.abs(change))}`
      : money(0);

  const percentageText = change > 0
    ? `+${percentage.toLocaleString(uiLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
    : change < 0
      ? `${percentage.toLocaleString(uiLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
      : '0,00%';

  return `${amountText} (${percentageText})`;
}

function valuationMetricValue(snapshot, metric) {
  if (!snapshot) return 0;
  if (metric === 'storage_value') {
    return Number(snapshot.material_value || 0) + Number(snapshot.product_value || 0);
  }
  return Number(snapshot[metric] || 0);
}

function dailyValuationMetricChange(metric) {
  const latest = state.valuationHistory?.[0] || null;
  const previous = state.valuationHistory?.[1] || null;
  if (!latest) return { current: 0, previous: 0, change: 0 };

  const current = valuationMetricValue(latest, metric);

  if (previous) {
    const previousValue = valuationMetricValue(previous, metric);
    return { current, previous: previousValue, change: current - previousValue };
  }

  if (metric === 'company_value' && latest.previous_company_value !== null && latest.previous_company_value !== undefined) {
    const previousValue = Number(latest.previous_company_value || 0);
    return { current, previous: previousValue, change: current - previousValue };
  }

  return { current, previous: current, change: 0 };
}

function setDashboardMetricChange(elementId, metric, invertGoodBad = false) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const delta = dailyValuationMetricChange(metric);
  const change = Number(delta.change || 0);
  element.textContent = companyValueChangeDisplay(delta.current, change);

  const colorChange = invertGoodBad ? -change : change;
  element.className = `company-value-change ${
    colorChange > 0
      ? 'company-value-change-positive'
      : colorChange < 0
        ? 'company-value-change-negative'
        : 'company-value-change-zero'
  }`;
}

function renderDashboardValuationChanges() {
  setDashboardMetricChange('statValueChange', 'company_value');
  setDashboardMetricChange('statPatentChange', 'patent_value');
  setDashboardMetricChange('statDebtChange', 'loan_debt', true);
}

async function refreshCompanyValueSnapshot() {
  if (!sb || !state.company?.id || document.visibilityState === 'hidden') return;
  const cid = state.company.id;
  const [companyResult, historyResult, rankingResult] = await Promise.all([
    sb.from('companies').select('company_value').eq('id',cid).single(),
    sb.from('company_valuation_history')
      .select('valuation_date,cash_balance,material_value,product_value,building_value,patent_value,loan_debt,company_value,previous_company_value,change_amount,calculated_at')
      .eq('company_id',cid)
      .order('valuation_date',{ascending:false})
      .limit(2),
    sb.rpc('get_company_ranking', { p_company_id: cid })
  ]);

  if (companyResult.error || historyResult.error || rankingResult.error) return;

  state.company.company_value = Number(companyResult.data?.company_value || state.company.company_value || 0);
  state.valuationHistory = historyResult.data || [];
  state.companyValueChange = Number(state.valuationHistory?.[0]?.change_amount || 0);
  state.companyRanking = rankingResult.data || null;

  const valueEl = document.getElementById('statValue');
  if (valueEl) valueEl.textContent = money(state.company.company_value);
  renderDashboardValuationChanges();
  renderCompanyRanking();
}

function updateCompanyBalanceUI(balance) {
  const cashValue = Number(balance || 0);
  if (state.company) state.company.cash_balance = cashValue;

  const statCash = document.getElementById('statCash');
  if (statCash) {
    statCash.textContent = dashboardCashMoney(cashValue);
    statCash.classList.toggle('negative-balance', cashValue < 0);
  }

  const companyCash = document.getElementById('companyCashBalance');
  if (companyCash) {
    companyCash.textContent = balanceMoney(cashValue);
    companyCash.classList.toggle('negative-balance', cashValue < 0);
  }
}

async function refreshCompanyBalance() {
  if (!sb || !state.company?.id || document.visibilityState === 'hidden') return;

  const { data, error } = await sb
    .from('companies')
    .select('cash_balance')
    .eq('id', state.company.id)
    .maybeSingle();

  if (error) {
    console.warn('Kontostand-Aktualisierung:', error.message);
    return;
  }

  if (data) updateCompanyBalanceUI(data.cash_balance);
}

function stopCompanyBalanceWatcher() {
  if (companyBalancePollTimer) clearInterval(companyBalancePollTimer);
  companyBalancePollTimer = null;

  if (companyBalanceChannel && sb) {
    sb.removeChannel(companyBalanceChannel);
  }
  companyBalanceChannel = null;
}

function startCompanyBalanceWatcher() {
  stopCompanyBalanceWatcher();
  if (!sb || !state.company?.id) return;

  const companyId = state.company.id;

  companyBalanceChannel = sb
    .channel(`company-balance-${companyId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'companies',
        filter: `id=eq.${companyId}`
      },
      payload => {
        if (payload?.new && Object.prototype.hasOwnProperty.call(payload.new, 'cash_balance')) {
          const previous = Number(state.company?.cash_balance || 0);
          const next = Number(payload.new.cash_balance || 0);
          if (next !== previous) updateCompanyBalanceUI(next);
        }
      }
    )
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Kontostand-Realtime nicht verfügbar – Sicherheitsabfrage bleibt aktiv.');
      }
    });

  refreshCompanyBalance();
  companyBalancePollTimer = setInterval(refreshCompanyBalance, 10000);
}

function startPresenceHeartbeat() {
  if (presenceTimer) clearInterval(presenceTimer);
  touchPresence();
  presenceTimer = setInterval(touchPresence, 60000);
  if (companyValueRefreshTimer) clearInterval(companyValueRefreshTimer);
  refreshCompanyValueSnapshot();
  companyValueRefreshTimer = setInterval(refreshCompanyValueSnapshot, 60000);

  if (buildingConstructionTimer) clearInterval(buildingConstructionTimer);
  buildingConstructionTimer = setInterval(refreshBuildingConstruction, 60000);
}

function stopPresenceHeartbeat() {
  if (presenceTimer) clearInterval(presenceTimer);
  presenceTimer = null;
  if (companyValueRefreshTimer) clearInterval(companyValueRefreshTimer);
  companyValueRefreshTimer = null;
  if (buildingConstructionTimer) clearInterval(buildingConstructionTimer);
  buildingConstructionTimer = null;
}

function nextMarketRefreshAt(now = new Date()) {
  const next = new Date(now);
  next.setSeconds(0, 0);
  const interval = GAME_RULES.schedules.npcMarketIntervalMinutes;
  const nextQuarter = (Math.floor(next.getMinutes() / interval) + 1) * interval;
  next.setMinutes(nextQuarter);
  return next;
}

function updateMarketRefreshTimer() {
  const el = document.getElementById('marketRefreshTimer');
  if (!el) return;

  const now = new Date();
  const next = nextMarketRefreshAt(now);
  const remainingSeconds = Math.max(0, Math.ceil((next.getTime() - now.getTime()) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const countdown = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const nextTime = next.toLocaleTimeString(uiLocale(), { hour:'2-digit', minute:'2-digit' });

  el.textContent = `${nextTime} Uhr · ${countdown} ${remainingSeconds < 60 ? 'Sekunden' : 'Minuten'}`;
}

function stopNpcMarketHeartbeat() {
  if (npcMarketCountdownTimer) clearInterval(npcMarketCountdownTimer);
  npcMarketCountdownTimer = null;
}

function startNpcMarketHeartbeat() {
  stopNpcMarketHeartbeat();
  updateMarketRefreshTimer();
  npcMarketCountdownTimer = setInterval(updateMarketRefreshTimer, 1000);
}

async function fetchPermanentTransportContainerMarketOrder() {
  if (!sb) return null;
  const container = state.allProducts.find(product => product.name === 'Transportcontainer');
  if (!container) return null;

  const { data, error } = await sb
    .from('market_orders')
    .select('*, products(name), materials(name)')
    .eq('product_id', container.id)
    .in('status', ['open','partially_filled'])
    .gt('remaining_quantity', 0)
    .order('created_at', { ascending:false })
    .limit(1);

  if (error) {
    console.error('Permanente Transportcontainer-Order konnte nicht geladen werden:', error);
    return null;
  }
  return data?.[0] || null;
}

function withPermanentTransportContainerOrder(orders, permanentOrder) {
  const rows = [...(orders || [])];
  if (!permanentOrder) return rows;
  const index = rows.findIndex(order => order.id === permanentOrder.id);
  if (index >= 0) rows[index] = permanentOrder;
  else rows.push(permanentOrder);
  return rows;
}

async function refreshMarketData() {
  if (!sb || !state.company?.id) return;

  const button = document.getElementById('marketManualRefreshBtn');
  if (button?.disabled) return;

  if (button) {
    button.disabled = true;
    button.classList.add('is-refreshing');
    button.setAttribute('aria-busy', 'true');
  }

  try {
    const [ordersResult, directoryResult] = await Promise.all([
      sb.from('market_orders')
        .select('*, products(name), materials(name)')
        .in('status',['open','partially_filled'])
        .order('created_at',{ascending:false})
        .limit(1000),
      sb.rpc('list_companies')
    ]);

    const errors = [
      ordersResult.error ? `Marktorders: ${ordersResult.error.message || 'Unbekannter Fehler'}` : null,
      directoryResult.error ? `Firmenverzeichnis: ${directoryResult.error.message || 'Unbekannter Fehler'}` : null
    ].filter(Boolean);

    if (errors.length) {
      await gameAlert(`Markt konnte nicht aktualisiert werden. ${errors.join(' | ')}`);
      return;
    }

    const permanentTransportOrder = await fetchPermanentTransportContainerMarketOrder();
    state.marketOrders = withPermanentTransportContainerOrder(ordersResult.data || [], permanentTransportOrder);
    state.companyDirectory = directoryResult.data || [];
    state.selectedMarketOrderIds = state.selectedMarketOrderIds.filter(id =>
      state.marketOrders.some(order => order.id === id)
    );

    renderMarket();
    updateMarketRefreshTimer();
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('is-refreshing');
      button.removeAttribute('aria-busy');
    }
  }
}

window.refreshMarketData = refreshMarketData;

function isCompanyOnline() {
  if (!state.company?.last_seen_at) return false;
  return Date.now() - new Date(state.company.last_seen_at).getTime() < 120000;
}

function renderCompanyRanking() {
  const rankingEl = document.getElementById('companyRankingValue');
  if (!rankingEl) return;

  const ranking = state.companyRanking;
  const rank = Number(ranking?.rank || 0);
  const total = Number(ranking?.total_companies || 0);
  const change = Number(ranking?.rank_change || 0);

  if (!rank) {
    rankingEl.innerHTML = '<span class="muted">Noch nicht gewertet</span>';
    return;
  }

  let movement = '<span class="ranking-change ranking-change-zero">–</span>';
  if (change > 0) {
    movement = `<span class="ranking-change ranking-change-up" title="${change} Platz${change === 1 ? '' : 'e'} gewonnen">▲ ${num(change)}</span>`;
  } else if (change < 0) {
    const lost = Math.abs(change);
    movement = `<span class="ranking-change ranking-change-down" title="${lost} Platz${lost === 1 ? '' : 'e'} verloren">▼ ${num(lost)}</span>`;
  }

  rankingEl.innerHTML = `<span class="ranking-place">#${num(rank)}</span>${movement}`;
}

function renderCompanyStatus() {
  const online = isCompanyOnline();
  document.querySelectorAll('.company-online-status').forEach(statusEl => {
    statusEl.textContent = online ? 'Online' : 'Offline';
    statusEl.className = `company-online-status presence-status ${online ? 'online' : 'offline'}`;
  });
}

function bindNavigation() {
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => btn.addEventListener('click', async () => {
    const view = btn.dataset.view;
    const requiredLevel = featureRequiredLevel(view);
    if (requiredLevel && !featureUnlocked(view)) {
      await gameAlert(`${btn.dataset.baseLabel || btn.textContent.replace(/\s*🔒.*$/, '')} wird auf Unternehmenslevel ${requiredLevel} freigeschaltet.`);
      return;
    }

    activateView(view);
    if (view === 'encyclopedia') {
      renderEncyclopedia();
      if (!location.hash.startsWith('#encyclopedia/')) {
        history.replaceState(null, '', '#encyclopedia');
      }
    } else {
      const targetHash = `#${view}`;
      if (location.hash !== targetHash) {
        history.replaceState(null, '', targetHash);
      }
    }
  }));
}
bindNavigation();

document.getElementById('ocbShopClose')?.addEventListener('click', closeOcbShop);
document.getElementById('ocbShopOverlay')?.addEventListener('click', event => {
  if (event.target.id === 'ocbShopOverlay') closeOcbShop();
});

document.getElementById('encyclopediaSearch')?.addEventListener('input', event => {
  state.encyclopediaSearch = event.target.value;
  renderEncyclopedia();
});

document.getElementById('encyclopediaCategories')?.addEventListener('click', event => {
  const button = event.target.closest('[data-encyclopedia-category]');
  if (!button) return;
  state.encyclopediaCategory = button.dataset.encyclopediaCategory || 'Alle';
  renderEncyclopedia();
});

document.getElementById('encyclopediaArticleList')?.addEventListener('click', event => {
  const button = event.target.closest('[data-encyclopedia-article]');
  if (!button) return;
  openEncyclopediaArticle(button.dataset.encyclopediaArticle);
});


const customSelectState = {
  openSelect: null,
  menu: null,
  focusedIndex: -1,
  observer: null
};

function customSelectLabel(select) {
  const option = select?.selectedOptions?.[0] || select?.options?.[select.selectedIndex] || null;
  return option?.textContent?.trim() || 'Bitte wählen';
}

function ensureCustomSelectMenu() {
  if (customSelectState.menu) return customSelectState.menu;

  const menu = document.createElement('div');
  menu.id = 'ocSelectMenu';
  menu.className = 'oc-select-menu hidden';
  menu.setAttribute('role', 'listbox');
  document.body.appendChild(menu);

  menu.addEventListener('click', event => {
    const optionButton = event.target.closest('.oc-select-option');
    if (!optionButton || optionButton.disabled) return;

    const select = customSelectState.openSelect;
    if (!select) return;

    const index = Number(optionButton.dataset.optionIndex);
    const option = select.options[index];
    if (!option || option.disabled) return;

    select.selectedIndex = index;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncCustomSelect(select);
    closeCustomSelect();
  });

  customSelectState.menu = menu;
  return menu;
}

function customSelectWrapper(select) {
  return select?.closest?.('.oc-select') || null;
}

function customSelectTrigger(select) {
  return customSelectWrapper(select)?.querySelector('.oc-select-trigger') || null;
}

function buildCustomSelectOptions(select) {
  const menu = ensureCustomSelectMenu();
  menu.innerHTML = '';
  menu.setAttribute('aria-label', select.getAttribute('aria-label') || select.id || 'Auswahl');

  let flatOptionIndex = 0;
  const children = Array.from(select.children);

  if (!select.options.length) {
    menu.innerHTML = '<div class="oc-select-empty">Keine Auswahl verfügbar</div>';
    return [];
  }

  const optionButtons = [];

  const appendOption = option => {
    const index = Array.from(select.options).indexOf(option);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'oc-select-option';
    button.dataset.optionIndex = String(index);
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', option.selected ? 'true' : 'false');
    button.disabled = option.disabled || select.disabled;
    const label = document.createElement('span');
    label.textContent = option.textContent?.trim() || '';
    const check = document.createElement('span');
    check.className = 'oc-select-check';
    check.textContent = '✓';
    button.append(label, check);
    if (option.selected) button.classList.add('selected');
    menu.appendChild(button);
    optionButtons.push(button);
    flatOptionIndex++;
  };

  children.forEach(child => {
    if (child.tagName === 'OPTGROUP') {
      const heading = document.createElement('div');
      heading.className = 'oc-select-group';
      heading.textContent = child.label || '';
      menu.appendChild(heading);
      Array.from(child.children).forEach(option => appendOption(option));
    } else if (child.tagName === 'OPTION') {
      appendOption(child);
    }
  });

  return optionButtons;
}

function positionCustomSelectMenu(select) {
  const trigger = customSelectTrigger(select);
  const menu = ensureCustomSelectMenu();
  if (!trigger || menu.classList.contains('hidden')) return;

  const rect = trigger.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const gap = 6;

  if (window.innerWidth <= 720) {
    menu.style.top = `${Math.min(rect.bottom + gap, viewportHeight - 80)}px`;
    menu.style.bottom = 'auto';
    menu.style.width = 'auto';
    return;
  }

  const width = Math.max(rect.width, 220);
  menu.style.width = `${Math.min(width, window.innerWidth - 20)}px`;
  menu.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - width - 10))}px`;

  const estimatedHeight = Math.min(menu.scrollHeight || 320, 420, viewportHeight * .52);
  const roomBelow = viewportHeight - rect.bottom - gap;
  const roomAbove = rect.top - gap;

  if (roomBelow >= Math.min(estimatedHeight, 180) || roomBelow >= roomAbove) {
    menu.style.top = `${rect.bottom + gap}px`;
    menu.style.bottom = 'auto';
  } else {
    menu.style.top = 'auto';
    menu.style.bottom = `${viewportHeight - rect.top + gap}px`;
  }
}

function openCustomSelect(select) {
  if (!select || select.disabled) return;

  if (customSelectState.openSelect && customSelectState.openSelect !== select) {
    closeCustomSelect();
  }

  const trigger = customSelectTrigger(select);
  const menu = ensureCustomSelectMenu();
  customSelectState.openSelect = select;
  syncCustomSelect(select);
  const buttons = buildCustomSelectOptions(select);

  trigger?.setAttribute('aria-expanded', 'true');
  menu.classList.remove('hidden');
  positionCustomSelectMenu(select);

  const selectedButtonIndex = buttons.findIndex(button => button.classList.contains('selected') && !button.disabled);
  customSelectState.focusedIndex = selectedButtonIndex >= 0
    ? selectedButtonIndex
    : buttons.findIndex(button => !button.disabled);

  buttons.forEach((button, i) => button.classList.toggle('focused', i === customSelectState.focusedIndex));
  buttons[customSelectState.focusedIndex]?.scrollIntoView({ block: 'nearest' });
}

function closeCustomSelect() {
  const select = customSelectState.openSelect;
  const trigger = customSelectTrigger(select);
  trigger?.setAttribute('aria-expanded', 'false');

  const menu = ensureCustomSelectMenu();
  menu.classList.add('hidden');
  menu.style.top = '';
  menu.style.bottom = '';
  menu.style.left = '';
  menu.style.width = '';

  customSelectState.openSelect = null;
  customSelectState.focusedIndex = -1;
}

function moveCustomSelectFocus(direction) {
  const menu = ensureCustomSelectMenu();
  const buttons = Array.from(menu.querySelectorAll('.oc-select-option'));
  if (!buttons.length) return;

  let index = customSelectState.focusedIndex;
  for (let tries = 0; tries < buttons.length; tries++) {
    index = (index + direction + buttons.length) % buttons.length;
    if (!buttons[index].disabled) break;
  }

  customSelectState.focusedIndex = index;
  buttons.forEach((button, i) => button.classList.toggle('focused', i === index));
  buttons[index]?.scrollIntoView({ block: 'nearest' });
}

function syncCustomSelect(select) {
  if (!select || !select.classList?.contains('oc-select-native')) return;

  const trigger = customSelectTrigger(select);
  if (!trigger) return;

  const text = trigger.querySelector('.oc-select-trigger-text');
  if (text) text.textContent = customSelectLabel(select);

  trigger.disabled = select.disabled;
  trigger.setAttribute('aria-disabled', select.disabled ? 'true' : 'false');

  if (customSelectState.openSelect === select && customSelectState.menu && !customSelectState.menu.classList.contains('hidden')) {
    buildCustomSelectOptions(select);
    positionCustomSelectMenu(select);
  }
}

function enhanceCustomSelect(select) {
  if (!select || select.dataset.ocSelectEnhanced === '1') {
    if (select) syncCustomSelect(select);
    return;
  }

  select.dataset.ocSelectEnhanced = '1';
  select.classList.add('oc-select-native');

  const wrapper = document.createElement('div');
  wrapper.className = 'oc-select';

  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'oc-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = '<span class="oc-select-trigger-text"></span><span class="oc-select-chevron" aria-hidden="true"></span>';
  wrapper.appendChild(trigger);

  trigger.addEventListener('click', event => {
    event.preventDefault();
    if (customSelectState.openSelect === select) closeCustomSelect();
    else openCustomSelect(select);
  });

  trigger.addEventListener('keydown', event => {
    if (select.disabled) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (customSelectState.openSelect !== select) openCustomSelect(select);
      else moveCustomSelectFocus(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (customSelectState.openSelect !== select) {
        openCustomSelect(select);
      } else {
        const button = ensureCustomSelectMenu().querySelectorAll('.oc-select-option')[customSelectState.focusedIndex];
        button?.click();
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeCustomSelect();
    }
  });

  select.addEventListener('change', () => syncCustomSelect(select));

  const observer = new MutationObserver(() => syncCustomSelect(select));
  observer.observe(select, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'selected', 'label']
  });

  syncCustomSelect(select);
}

function enhanceAllCustomSelects(root = document) {
  root.querySelectorAll?.('select').forEach(enhanceCustomSelect);
}

document.addEventListener('click', event => {
  if (!customSelectState.openSelect) return;
  const wrapper = customSelectWrapper(customSelectState.openSelect);
  const menu = ensureCustomSelectMenu();
  if (wrapper?.contains(event.target) || menu.contains(event.target)) return;
  closeCustomSelect();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && customSelectState.openSelect) closeCustomSelect();
});

window.addEventListener('resize', () => {
  if (customSelectState.openSelect) positionCustomSelectMenu(customSelectState.openSelect);
});

window.addEventListener('scroll', event => {
  if (!customSelectState.openSelect) return;

  const menu = ensureCustomSelectMenu();
  if (event.target === menu || menu.contains(event.target)) return;

  closeCustomSelect();
}, true);

function setAccountStatus(text, type='') {
  const el = document.getElementById('accountStatus');
  if (!el) return;
  msg(el, text, type);
}

function renderAccountSettings() {
  const emailEl = document.getElementById('accountEmail');
  const accountIdEl = document.getElementById('accountPublicId');
  const emailInput = document.getElementById('accountNewEmail');
  const userEmail = state.session?.user?.email || '';

  if (emailEl) emailEl.textContent = userEmail || 'Keine E-Mail hinterlegt';
  if (accountIdEl) accountIdEl.textContent = state.accountCode || '–';
  if (emailInput && !emailInput.value) emailInput.value = userEmail;
}

function setAccountEditMode(editing) {
  const summary = document.getElementById('accountDataSummary');
  const form = document.getElementById('accountEditForm');
  if (!summary || !form) return;

  summary.classList.toggle('hidden', editing);
  form.classList.toggle('hidden', !editing);

  if (editing) {
    const emailInput = document.getElementById('accountNewEmail');
    const passwordInput = document.getElementById('accountNewPassword');
    const confirmInput = document.getElementById('accountNewPasswordConfirm');

    if (emailInput) emailInput.value = state.session?.user?.email || '';
    if (passwordInput) passwordInput.value = '';
    if (confirmInput) confirmInput.value = '';
    setAccountStatus('');
    emailInput?.focus();
  }
}

async function updateAccountData(event) {
  event.preventDefault();

  const emailInput = document.getElementById('accountNewEmail');
  const passwordInput = document.getElementById('accountNewPassword');
  const confirmInput = document.getElementById('accountNewPasswordConfirm');
  const submitButton = event.currentTarget.querySelector('button[type="submit"]');

  const currentEmail = state.session?.user?.email || '';
  const newEmail = String(emailInput?.value || '').trim();
  const newPassword = String(passwordInput?.value || '');
  const confirmPassword = String(confirmInput?.value || '');

  const emailChanged = !!newEmail && newEmail.toLowerCase() !== currentEmail.toLowerCase();
  const passwordChanged = newPassword.length > 0;

  if (!emailChanged && !passwordChanged) {
    setAccountStatus('Es wurden keine Änderungen vorgenommen.', 'error');
    return;
  }

  if (passwordChanged && newPassword !== confirmPassword) {
    setAccountStatus('Die beiden Passwörter stimmen nicht überein.', 'error');
    return;
  }

  if (passwordChanged && newPassword.length < 6) {
    setAccountStatus('Das neue Passwort muss mindestens 6 Zeichen lang sein.', 'error');
    return;
  }

  const updates = {};
  if (emailChanged) updates.email = newEmail;
  if (passwordChanged) updates.password = newPassword;

  if (submitButton) submitButton.disabled = true;
  setAccountStatus('Account-Daten werden geändert …');

  try {
    const { data, error } = await sb.auth.updateUser(updates);
    if (error) throw error;

    if (data?.user) {
      state.session = {
        ...state.session,
        user: data.user
      };
    }

    const { data: refreshed } = await sb.auth.getSession();
    if (refreshed?.session) state.session = refreshed.session;

    renderAccountSettings();

    if (emailChanged) {
      setAccountStatus(
        'Änderung gespeichert. Falls E-Mail-Bestätigung aktiviert ist, bestätige bitte die neue Adresse über die zugesandte E-Mail.',
        'success'
      );
    } else {
      setAccountStatus('Passwort erfolgreich geändert.', 'success');
    }

    if (passwordInput) passwordInput.value = '';
    if (confirmInput) confirmInput.value = '';

    setTimeout(() => setAccountEditMode(false), 1800);
  } catch (error) {
    setAccountStatus(error?.message || 'Account-Daten konnten nicht geändert werden.', 'error');
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function setPushStatus(text, type='') {
  const el = document.getElementById('pushStatus');
  if (!el) return;
  msg(el, text, type);
}

async function getPushRegistration() {
  if (!pushSupported()) return null;
  await navigator.serviceWorker.register('service-worker.js');
  return navigator.serviceWorker.ready;
}

async function savePushPreferences(enabled = true) {
  if (!sb || !state.session?.user?.id) return;

  const { error } = await sb.from('push_preferences').upsert({
    user_id: state.session.user.id,
    production_enabled: enabled,
    retail_enabled: enabled,
    building_enabled: enabled,
    market_enabled: enabled,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });

  if (error) {
    setPushStatus(`Einstellungen konnten nicht gespeichert werden: ${error.message}`, 'error');
  }
}

async function enablePushNotifications() {
  if (!pushSupported()) {
    setPushStatus('Dieser Browser unterstützt keine Push-Benachrichtigungen.', 'error');
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    setPushStatus(
      permission === 'denied'
        ? 'Benachrichtigungen sind im Browser blockiert.'
        : 'Benachrichtigungen wurden nicht aktiviert.',
      'error'
    );
    return false;
  }

  const { data: configData, error: configError } = await sb
    .from('push_config')
    .select('vapid_public_key')
    .eq('singleton', true)
    .maybeSingle();

  if (configError || !configData?.vapid_public_key) {
    setPushStatus('Push-Konfiguration konnte nicht geladen werden.', 'error');
    return false;
  }

  const registration = await getPushRegistration();
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(configData.vapid_public_key)
    });
  }

  const json = subscription.toJSON();
  const { error: saveError } = await sb.from('push_subscriptions').upsert({
    user_id: state.session.user.id,
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    user_agent: navigator.userAgent,
    enabled: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'endpoint' });

  if (saveError) {
    setPushStatus(`Push-Abo konnte nicht gespeichert werden: ${saveError.message}`, 'error');
    return false;
  }

  await savePushPreferences(true);
  setPushStatus('Push-Benachrichtigungen sind auf diesem Gerät aktiv.', 'success');
  return true;
}

async function disablePushNotifications() {
  if (!pushSupported() || !state.session?.user?.id) return;

  const registration = await getPushRegistration();
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    await sb.from('push_subscriptions')
      .delete()
      .eq('user_id', state.session.user.id)
      .eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  }

  await savePushPreferences(false);
  setPushStatus('Push-Benachrichtigungen sind auf diesem Gerät deaktiviert.');
}

async function loadPushSettings() {
  const pushToggle = document.getElementById('pushEnabled');
  if (!pushToggle || !state.session?.user?.id) return;

  if (!pushSupported()) {
    pushToggle.checked = false;
    pushToggle.disabled = true;
    setPushStatus('Dieser Browser unterstützt keine Push-Benachrichtigungen.', 'error');
    return;
  }

  const registration = await getPushRegistration();
  const subscription = await registration.pushManager.getSubscription();
  const active = Notification.permission === 'granted' && !!subscription;
  pushToggle.checked = active;

  if (active) {
    await savePushPreferences(true);
  }

  if (Notification.permission === 'denied') {
    setPushStatus('Benachrichtigungen sind im Browser blockiert.', 'error');
  } else if (active) {
    setPushStatus('Push-Benachrichtigungen sind auf diesem Gerät aktiv.', 'success');
  } else {
    setPushStatus('Push-Benachrichtigungen sind auf diesem Gerät nicht aktiviert.');
  }
}

function openViewFromHash() {
  if (!state.company) return;

  const rawHash = location.hash.replace(/^#/, '');
  if (rawHash) {
    const [view, ...rest] = rawHash.split('/');
    if (view === 'encyclopedia' && rest.length) {
      const articleId = decodeURIComponent(rest.join('/'));
      if (encyclopediaArticleById(articleId)) {
        state.encyclopediaSelectedArticleId = articleId;
        state.encyclopediaCategory = 'Alle';
        state.encyclopediaSearch = '';
        encyclopediaRememberArticle(articleId);
        activateView('encyclopedia');
        renderEncyclopedia();
        return;
      }
    }

    const btn = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (btn) {
      btn.click();
      return;
    }
  }

  const savedView = loadLastView();
  const savedBtn = savedView
    ? document.querySelector(`.nav-item[data-view="${savedView}"]`)
    : null;

  if (savedBtn) {
    savedBtn.click();
    return;
  }

  document.querySelector('.nav-item[data-view="dashboard"]')?.click();
}



function stopInactivityWatcher() {
  if (inactivityLogoutTimer) clearTimeout(inactivityLogoutTimer);
  inactivityLogoutTimer = null;
  lastUserActivityAt = 0;
}

function scheduleInactivityLogout() {
  if (!state.session) return;
  if (inactivityLogoutTimer) clearTimeout(inactivityLogoutTimer);

  const elapsed = Date.now() - lastUserActivityAt;
  const remaining = Math.max(0, INACTIVITY_LIMIT_MS - elapsed);

  inactivityLogoutTimer = setTimeout(async () => {
    const inactiveFor = Date.now() - lastUserActivityAt;
    if (!state.session || inactiveFor < INACTIVITY_LIMIT_MS) {
      scheduleInactivityLogout();
      return;
    }
    await logoutForInactivity();
  }, remaining + 50);
}

function recordUserActivity() {
  if (!state.session || inactivityLogoutInProgress) return;
  lastUserActivityAt = Date.now();
  scheduleInactivityLogout();
}

async function logoutForInactivity() {
  if (!sb || !state.session || inactivityLogoutInProgress) return;
  inactivityLogoutInProgress = true;
  try {
    if (state.company?.id) {
      await sb.rpc('set_company_offline', { p_company_id: state.company.id });
    }
    const userId = state.session?.user?.id;
    clearLastView(userId);
    history.replaceState(null, '', location.pathname + location.search);
    stopPresenceHeartbeat();
    stopNpcMarketHeartbeat();
    stopCompanyBalanceWatcher();
    stopInactivityWatcher();
    await sb.auth.signOut({ scope: 'local' });
    msg(
      document.getElementById('authMessage'),
      'Sitzung nach 60 Minuten Inaktivität beendet.',
      'success'
    );
  } catch (error) {
    console.error('Inaktivitäts-Logout:', error);
  } finally {
    inactivityLogoutInProgress = false;
  }
}

function startInactivityWatcher() {
  lastUserActivityAt = Date.now();
  scheduleInactivityLogout();
}

function installInactivityListeners() {
  if (inactivityListenersInstalled) return;
  inactivityListenersInstalled = true;

  ['pointerdown','keydown','touchstart','scroll'].forEach(eventName => {
    window.addEventListener(eventName, recordUserActivity, { passive: true, capture: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (!state.session) return;
    if (document.visibilityState === 'visible') {
      if (lastUserActivityAt && Date.now() - lastUserActivityAt >= INACTIVITY_LIMIT_MS) {
        logoutForInactivity();
      } else {
        recordUserActivity();
      }
    }
  });
}

function escapePublicLeaderboardText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

async function loadPublicLeaderboard() {
  const table = document.getElementById('publicLeaderboardTable');
  const date = document.getElementById('publicLeaderboardDate');
  if (!table || !date || !sb) return;

  const { data, error } = await sb.rpc('get_public_company_leaderboard');

  if (error) {
    console.error('Öffentliche Rangliste:', error);
    table.innerHTML = '<p class="status error">Rangliste konnte nicht geladen werden.</p>';
    date.textContent = '';
    return;
  }

  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    table.innerHTML = '<p class="muted">Noch keine Ranglistendaten verfügbar.</p>';
    date.textContent = '';
    return;
  }

  table.innerHTML = `<table>
    <thead>
      <tr>
        <th>Platz</th>
        <th>Unternehmen</th>
        <th>Gegründet</th>
        <th>Unternehmenswert</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(row => `<tr>
        <td>#${num(row.rank)}</td>
        <td>${escapePublicLeaderboardText(row.company_name)}</td>
        <td>${row.founded_date ? new Date(`${row.founded_date}T12:00:00`).toLocaleDateString(uiLocale()) : '–'}</td>
        <td>${money(row.company_value)}</td>
      </tr>`).join('')}
    </tbody>
  </table>`;

  const rankingDate = rows[0]?.ranking_date;
  date.textContent = rankingDate
    ? `Stand: ${new Date(`${rankingDate}T12:00:00`).toLocaleDateString(uiLocale())}`
    : '';
}

function startPublicLeaderboardRefresh() {
  if (publicLeaderboardTimer) clearInterval(publicLeaderboardTimer);
  loadPublicLeaderboard();
  publicLeaderboardTimer = setInterval(() => {
    if (!state.session) loadPublicLeaderboard();
  }, 15 * 60 * 1000);
}

async function init() {
  initializeLanguage();
  enhanceAllCustomSelects(document);
  syncLanguageControls();
  installInactivityListeners();
  if (!sb) return;

  startPublicLeaderboardRefresh();

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      state.recoveringPassword = true;
      state.session = session;
      document.getElementById('mainNavigation')?.classList.add('hidden');
      document.getElementById('authView').classList.add('hidden');
      document.getElementById('publicLeaderboardView')?.classList.add('hidden');
      document.getElementById('gameView').classList.add('hidden');
      document.getElementById('bootstrapView').classList.add('hidden');
      document.getElementById('recoveryView').classList.remove('hidden');
      document.getElementById('logoutBtn').classList.add('hidden');
      document.getElementById('sessionLabel').textContent = 'Passwort zurücksetzen';
      document.getElementById('pageTitle').textContent = 'Passwort zurücksetzen';
      return;
    }
    if (state.recoveringPassword && event !== 'SIGNED_OUT') return;
    await handleSession(session);
  });

  const { data: { session }, error } = await sb.auth.getSession();
  if (error) {
    console.error(error);
    msg(document.getElementById('authMessage'), error.message, 'error');
    return;
  }
  await handleSession(session);
}

async function handleSession(session) {
  if (state.recoveringPassword) return;
  state.session = session;
  const loggedIn = !!session;
  document.getElementById('mainNavigation')?.classList.toggle('hidden', !loggedIn);
  document.getElementById('headerChatBtn')?.classList.toggle('hidden', !loggedIn);
  document.getElementById('authView').classList.toggle('hidden', loggedIn);
  document.getElementById('publicLeaderboardView')?.classList.toggle('hidden', loggedIn);
  document.getElementById('recoveryView').classList.add('hidden');
  document.getElementById('logoutBtn').classList.toggle('hidden', !loggedIn);
  document.getElementById('sessionLabel').textContent = loggedIn ? session.user.email : 'Nicht angemeldet';

  if (!loggedIn) {
    stopPresenceHeartbeat();
    stopNpcMarketHeartbeat();
    stopCompanyBalanceWatcher();
    stopInactivityWatcher();
    state.accountCode = null;
    document.getElementById('gameView').classList.add('hidden');
    document.getElementById('bootstrapView').classList.add('hidden');
    clearCompanyLoadError();
    loadPublicLeaderboard();
    return;
  }
  startInactivityWatcher();
  await loadAccountIdentity();
  await loadCompany();

  if (state.openDashboardAfterLogin && state.company) {
    state.openDashboardAfterLogin = false;
    clearLastView(session.user.id);
    history.replaceState(null, '', '#dashboard');
    document.querySelector('.nav-item[data-view="dashboard"]')?.click();
  }
}

async function loadAccountIdentity() {
  if (!sb || !state.session?.user?.id) {
    state.accountCode = null;
    return;
  }

  const { data, error } = await sb
    .from('account_profiles')
    .select('account_code')
    .eq('user_id', state.session.user.id)
    .maybeSingle();

  if (error) {
    console.error('Account-ID konnte nicht geladen werden:', error);
    state.accountCode = null;
    return;
  }

  state.accountCode = data?.account_code || null;
}

async function loadCompany() {
  const { data, error } = await sb.from('companies').select('*').eq('owner_user_id', state.session.user.id).maybeSingle();
  if (error) {
    console.error(error);
    showCompanyLoadError(error);
    return;
  }
  clearCompanyLoadError();
  state.company = data;
  document.getElementById('bootstrapView').classList.toggle('hidden', !!data);
  document.getElementById('gameView').classList.toggle('hidden', !data);

  if (data) {
    startPresenceHeartbeat();
    startNpcMarketHeartbeat();

    const dailyXp = await sb.rpc('claim_daily_login_xp', { p_company_id: data.id });
    if (dailyXp.error) console.warn('Tägliche XP:', dailyXp.error.message);

    const dailyOcb = await sb.rpc('claim_daily_login_ocb', { p_company_id: data.id });
    if (dailyOcb.error) console.warn('Tägliche OCB:', dailyOcb.error.message);

    const completedBuildings = await sb.rpc('complete_due_buildings', { p_company_id: data.id });
    if (completedBuildings.error) console.warn('Gebäudebau:', completedBuildings.error.message);
    const completedJobs = await sb.rpc('complete_due_production_jobs', { p_company_id: data.id });
    if (completedJobs.error) console.warn('Produktionsabschluss:', completedJobs.error.message);
    const completedRetailSales = await sb.rpc('complete_due_retail_sales', { p_company_id: data.id });
    if (completedRetailSales.error) console.warn('Handelsabschluss:', completedRetailSales.error.message);

    const refreshed = await sb.from('companies').select('*').eq('id', data.id).single();
    if (!refreshed.error && refreshed.data) state.company = refreshed.data;

    startCompanyBalanceWatcher();
    await loadGameData();
    await loadPushSettings();
    renderAccountSettings();
    openViewFromHash();
  }
}

async function loadGameData() {
  const cid = state.company.id;
  const results = await Promise.all([
    sb.from('products').select('*').eq('company_id', cid).order('name'),
    sb.from('products').select('*').eq('status','active').order('name'),
    sb.from('inventories').select('*, products(name)').eq('company_id', cid),
    sb.from('materials').select('*').eq('status','active').order('name'),
    sb.from('material_inventories').select('*').eq('company_id', cid),
    sb.from('production_recipe_inputs').select('*'),
    sb.from('building_types').select('*').order('construction_cost'),
    sb.from('company_buildings').select('*').eq('company_id', cid),
    sb.from('production_jobs').select('*').eq('company_id', cid).order('started_at', {ascending:false}).limit(500),
    sb.from('retail_sale_jobs').select('*').eq('company_id', cid).order('started_at', {ascending:false}).limit(500),
    sb.from('financial_transactions').select('*').eq('company_id', cid).order('created_at', {ascending:false}).limit(500),
    sb.from('market_orders').select('*, products(name), materials(name)').in('status',['open','partially_filled']).order('created_at',{ascending:false}).limit(1000),
    sb.from('market_trades').select('id,order_id,buyer_company_id,seller_company_id,product_id,material_id,quantity,price_per_unit,total_value,quality_level,executed_at,products(name,category),materials(name)').or(`buyer_company_id.eq.${cid},seller_company_id.eq.${cid}`).order('executed_at',{ascending:false}).limit(500),
    sb.from('contracts').select('*').or(`seller_company_id.eq.${cid},buyer_company_id.eq.${cid}`).order('created_at',{ascending:false}),
    sb.rpc('list_companies'),
    sb.rpc('get_company_debt', { p_company_id: cid }),
    sb.rpc('get_bond_dashboard', { p_company_id: cid }),
    sb.from('company_valuation_history').select('valuation_date,cash_balance,material_value,product_value,building_value,patent_value,loan_debt,company_value,previous_company_value,change_amount,calculated_at').eq('company_id',cid).order('valuation_date',{ascending:false}).limit(2),
    sb.rpc('get_company_ranking', { p_company_id: cid }),
    sb.rpc('get_storage_status', { p_company_id: cid }),
    sb.rpc('get_ocb_status', { p_company_id: cid })
  ]);

  const labels = ['Produkte','Alle Produkte','Produktlager','Materialien','Materiallager','Rezepte','Gebäudetypen','Gebäude','Produktionen','Handelsverkäufe','Finanzen','Marktorders','Marktkäufe','Verträge','Firmenverzeichnis','Kreditschulden','Anleihen','Unternehmenswert-Verlauf','Unternehmensranking','Lagerstatus','OC-Boost'];
  const errors = results.map((r,i)=>r.error ? { label: labels[i], error:r.error } : null).filter(Boolean);
  if (errors.length) {
    console.error(errors);
    showGameDataError(errors);
    return;
  }
  clearGameDataError();

  const [products, allProducts, inventory, materials, materialInventory, recipes, buildingTypes, buildings, productionJobs, retailSaleJobs, tx, orders, marketTrades, contracts, directory, companyDebt, bondDashboard, valuationHistory, companyRanking, storageStatus, ocbStatus] = results;
  state.products = products.data;
  state.allProducts = allProducts.data;
  state.inventory = inventory.data;
  state.materials = materials.data;
  state.materialInventory = materialInventory.data;
  state.recipes = recipes.data || [];
  state.buildingTypes = buildingTypes.data;
  state.buildings = buildings.data;
  if (state.selectedBuildingId && !state.buildings.some(b => b.id === state.selectedBuildingId)) state.selectedBuildingId = null;
  if (state.selectedRetailBuildingId && !state.buildings.some(b => b.id === state.selectedRetailBuildingId)) state.selectedRetailBuildingId = null;
  state.productionJobs = productionJobs.data;
  state.retailSaleJobs = retailSaleJobs.data;
  state.transactions = tx.data;
  state.marketOrders = orders.data || [];
  const permanentTransportOrder = await fetchPermanentTransportContainerMarketOrder();
  state.marketOrders = withPermanentTransportContainerOrder(state.marketOrders, permanentTransportOrder);
  state.marketTrades = marketTrades.data || [];
  state.contracts = contracts.data;
  state.companyDirectory = directory.data || [];
  state.companyDebt = Number(companyDebt.data || 0);
  state.bondDashboard = bondDashboard.data || null;
  state.valuationHistory = valuationHistory.data || [];
  state.companyValueChange = Number(state.valuationHistory?.[0]?.change_amount || 0);
  state.companyRanking = companyRanking.data || null;
  state.storageStatus = storageStatus.data || null;
  state.ocbStatus = ocbStatus.data || {
    balance: Number(state.company?.ocb_balance || 0),
    today: { login:false, production:false, retail:false, earned:0, maximum:GAME_RULES.ocb.dailyMaximum }
  };
  if (state.company) state.company.ocb_balance = Number(state.ocbStatus.balance || 0);
  renderAll();
}

function currentProductionContext() {
  const selectedBuilding = state.buildings.find(
    building => building.id === state.selectedBuildingId && building.status === 'active'
  ) || null;

  const runningJob = selectedBuilding
    ? state.productionJobs.find(job => job.building_id === selectedBuilding.id && job.status === 'running') || null
    : null;

  const selectedProductId = document.getElementById('productionProduct')?.value || '';
  const productId = runningJob?.product_id || selectedProductId;
  const product = state.products.find(p => p.id === productId) || null;
  const buildingType = selectedBuilding
    ? state.buildingTypes.find(type => type.id === selectedBuilding.building_type_id) || null
    : null;

  const buildingCanProduce = !!selectedBuilding
    && !!product
    && product.required_building_type_id === selectedBuilding.building_type_id
    && ['production','research'].includes(buildingType?.building_category);

  const building = buildingCanProduce ? selectedBuilding : null;
  const multiplier = building ? buildingLevelMultiplier(building.level) : 1;
  const baseProductRate = Number(product?.base_production_rate || 0);
  const unitsPerHour = buildingType && building && baseProductRate > 0
    ? Math.max(1, Math.floor(baseProductRate * multiplier))
    : 0;

  return {
    productId, product, buildingType, building, multiplier, unitsPerHour,
    runningJob,
    freeBuilding: building && !runningJob ? building : null,
    matchingBuildingCount: building ? 1 : 0,
    baseProductRate,
    qualityLevel: productQuality(product),
    minInputQuality: minimumInputQuality(product)
  };
}

function productionUnitsFromInput(rawValue) {
  const raw = String(rawValue ?? '').trim().toLowerCase();
  const ctx = currentProductionContext();

  const hoursMatch = raw.match(/^(\d{1,2})\s*hrs$/i);
  if (hoursMatch) {
    const hours = Number(hoursMatch[1]);
    if (hours >= 1 && hours <= 24) {
      return {
        matchedHours: true,
        matchedTime: false,
        hours,
        units: Math.floor(ctx.unitsPerHour * hours)
      };
    }
  }

  const timeMatch = raw.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/i);
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] || 0);
    const meridiem = timeMatch[3].toLowerCase();

    if (hour >= 1 && hour <= 12) {
      if (hour === 12) hour = 0;
      if (meridiem === 'pm') hour += 12;

      const now = new Date();
      const target = new Date(now);
      target.setHours(hour, minute, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);

      const hours = (target.getTime() - now.getTime()) / 3600000;
      if (hours > 0 && hours <= 24.01) {
        return {
          matchedHours: false,
          matchedTime: true,
          hours,
          units: Math.floor(ctx.unitsPerHour * hours),
          targetTime: target
        };
      }
    }
  }

  const numeric = Number(raw.replace(',', '.'));
  return {
    matchedHours: false,
    matchedTime: false,
    hours: null,
    units: Number.isFinite(numeric) ? Math.floor(numeric) : 0
  };
}

function formatProductionUnitsInput(units) {
  const value = Math.round(Number(units || 0) * 10000) / 10000;
  return String(value);
}

function handleProductionUnitsInput(event) {
  const parsed = productionUnitsFromInput(event.target.value);

  if (parsed.matchedHours || parsed.matchedTime) {
    event.target.value = formatProductionUnitsInput(parsed.units);
  }

  renderProductionRecipe();
}

function marketOrdersForProductionInput(input) {
  const requiredQuality = Number(input.minQuality || 1);
  const component = input.component_product_id
    ? ((state.products || []).find(p => p.id === input.component_product_id)
      || (state.allProducts || []).find(p => p.id === input.component_product_id))
    : null;
  return state.marketOrders
    .filter(order => {
      if (order.order_type !== 'sell' || !['open','partially_filled'].includes(order.status) || order.company_id === state.company?.id || Number(order.remaining_quantity || 0) <= 0) return false;
      if (Number(order.quality_level || 1) < requiredQuality) return false;
      if (input.material_id) return order.material_id === input.material_id;
      if (component && order.product_id) {
        const marketProduct = state.allProducts.find(p => p.id === order.product_id);
        return marketProduct?.name === component.name && marketProduct?.category === component.category;
      }
      return false;
    })
    .sort((a,b)=>Number(a.price_per_unit||0)-Number(b.price_per_unit||0));
}

function estimateMissingInputPurchase(input) {
  const missing = Math.max(0, Number(input.required || 0) - Number(input.available || 0));
  if (missing <= 0) return { missing: 0, availableOnMarket: 0, estimatedCost: 0, fullyAvailable: true };

  const orders = marketOrdersForProductionInput(input);
  let remaining = missing;
  let availableOnMarket = 0;
  let estimatedCost = 0;

  for (const order of orders) {
    if (remaining <= 1e-9) break;
    const orderQty = Number(order.remaining_quantity || 0);
    const take = Math.min(remaining, orderQty);
    availableOnMarket += take;
    estimatedCost += take * Number(order.price_per_unit || 0);
    remaining -= take;
  }

  // Wenn der Markt die komplette Fehlmenge nicht deckt, wird der ungedeckte Rest
  // mit einem stabilen Referenzpreis geschätzt, damit offene Beschaffungskosten nicht 0 werden.
  if (remaining > 1e-9) {
    let fallbackPrice = 0;
    if (input.material_id) {
      fallbackPrice = Number(state.materials.find(m => m.id === input.material_id)?.base_cost || 0);
    } else if (input.component_product_id) {
      const product = state.products.find(p => p.id === input.component_product_id);
      fallbackPrice = Number(product?.suggested_retail_price || input.averageUnitCost || 0);
    }
    estimatedCost += remaining * fallbackPrice;
  }

  return {
    missing,
    availableOnMarket,
    estimatedCost,
    fullyAvailable: availableOnMarket + 1e-9 >= missing
  };
}

function productionPlan(unitsOverride = null) {
  const ctx = currentProductionContext();
  const unitsInput = document.getElementById('productionUnits');
  const inputParsed = productionUnitsFromInput(unitsInput?.value || 0);
  let requestedUnits = unitsOverride === null ? inputParsed.units : Number(unitsOverride || 0);
  requestedUnits = Number.isFinite(requestedUnits) ? Math.max(0, requestedUnits) : 0;

  const hours = ctx.unitsPerHour > 0 ? requestedUnits / ctx.unitsPerHour : 0;
  const outputQty = requestedUnits;
  const recipe = state.recipes.filter(r => r.product_id === ctx.productId);

  const inputs = recipe.map(r => {
    let name = '–';
    let unit = '';
    let available = 0;
    let averageUnitCost = 0;
    const minQuality = minimumInputQuality(ctx.product);
    if (r.material_id) {
      const m = state.materials.find(x => x.id === r.material_id);
      const summary = inventoryLotSummary(materialInventoryLots(r.material_id), minQuality);
      name = m?.name || '–';
      unit = m?.unit || '';
      available = summary.quantity;
      averageUnitCost = summary.averageUnitCost;
    } else {
      const p = state.products.find(x => x.id === r.component_product_id);
      const summary = inventoryLotSummary(productInventoryLots(r.component_product_id), minQuality);
      name = p?.name || '–';
      available = summary.quantity;
      averageUnitCost = summary.averageUnitCost;
    }

    const required = Number(r.quantity_per_unit || 0) * outputQty;
    const enough = available + 1e-9 >= required;
    const input = { ...r, name, unit, available, averageUnitCost, required, enough, minQuality };
    const purchase = estimateMissingInputPurchase(input);
    return {
      ...input,
      missing: purchase.missing,
      openProcurementCost: purchase.estimatedCost,
      marketAvailable: purchase.availableOnMarket,
      marketFullyAvailable: purchase.fullyAvailable
    };
  });

  let maxUnitsByMaterial = Infinity;
  for (const input of inputs) {
    const perUnit = Number(input.quantity_per_unit || 0);
    if (perUnit > 0) maxUnitsByMaterial = Math.min(maxUnitsByMaterial, input.available / perUnit);
  }
  const maxUnitsByTime = ctx.unitsPerHour * 24;
  if (!Number.isFinite(maxUnitsByMaterial)) maxUnitsByMaterial = maxUnitsByTime;
  const maxUnits = Math.max(0, Math.floor(Math.min(maxUnitsByMaterial, maxUnitsByTime) * 10000) / 10000);

  const procurementCost = inputs.reduce((sum, input) => sum + Number(input.openProcurementCost || 0), 0);
  const baseProductionCost = ctx.product?.category === 'research'
    ? Number(ctx.product.production_cost || 0) * outputQty
    : 0;
  const personnelCost = ctx.buildingType
    ? Number(ctx.buildingType.labor_cost_per_unit || 0) * outputQty
    : 0;
  const productionCost = procurementCost + baseProductionCost + personnelCost;

  const materialsOk = inputs.every(i => i.enough);
  const within24h = hours > 0 && hours <= 24;
  const atLeastOne = outputQty >= 1;
  const runnable = !!ctx.building && !ctx.runningJob && atLeastOne && within24h && materialsOk;

  return {
    ...ctx,
    requestedUnits,
    outputQty,
    hours,
    inputs,
    maxUnits,
    procurementCost,
    baseProductionCost,
    personnelCost,
    productionCost,
    materialsOk,
    within24h,
    atLeastOne,
    runnable
  };
}

function setProductionUnits(units) {
  const input = document.getElementById('productionUnits');
  input.value = formatProductionUnitsInput(units);
  renderProductionRecipe();
}

function formatProductionDuration(hours) {
  const totalMinutes = Math.max(0, Math.round(Number(hours || 0) * 60));
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${wholeHours} Std. ${minutes} Min.`;
}

function formatProductionFinish(hours) {
  const durationHours = Number(hours || 0);
  if (!Number.isFinite(durationHours) || durationHours <= 0) return '–';

  const finish = new Date(Date.now() + durationHours * 60 * 60 * 1000);
  return finish.toLocaleString(uiLocale(), {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) + ' Uhr';
}

function productionClaimableQuantity(job) {
  if (!job || job.status !== 'running') return 0;

  const output = Number(job.output_quantity || 0);
  const claimed = Number(job.claimed_quantity || 0);
  const unitsPerHour = Number(job.units_per_hour || 0);
  const startedAt = new Date(job.started_at).getTime();
  const finishesAt = new Date(job.finishes_at).getTime();
  const now = Date.now();

  let produced;
  if (now >= finishesAt) {
    produced = output;
  } else {
    const elapsedHours = Math.max(0, (now - startedAt) / 3600000);
    produced = Math.min(output, Math.floor(unitsPerHour * elapsedHours));
  }

  return Math.max(0, produced - claimed);
}

function productionProductDisplayName(name, quantity) {
  if (name === 'Elektronikmodul' && Number(quantity) !== 1) return 'Elektronikmodule';
  if (name === 'Smartphone' && Number(quantity) !== 1) return 'Smartphones';
  return name || 'Einheiten';
}

function startProductionClaimDisplayTimer() {
  if (productionClaimDisplayTimer) clearInterval(productionClaimDisplayTimer);
  productionClaimDisplayTimer = null;

  const hasRunningActivity =
    state.productionJobs.some(j => j.status === 'running') ||
    state.retailSaleJobs.some(j => j.status === 'running');
  if (!hasRunningActivity) return;

  productionClaimDisplayTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (document.getElementById('production')?.classList.contains('active-view')) {
      renderProductionRecipe();
    }
    if (document.getElementById('market')?.classList.contains('active-view')) {
      renderRetailSale();
    }
  }, 10000);
}

function renderProductionRecipe() {
  let plan = productionPlan();
  let { buildingType, building, multiplier, unitsPerHour, runningJob } = plan;
  const productSelect = document.getElementById('productionProduct');
  const unitsInput = document.getElementById('productionUnits');
  const maxBtn = document.getElementById('productionMaxBtn');
  const h24Btn = document.getElementById('production24Btn');

  // Während einer laufenden Produktion bleibt der komplette Startzustand sichtbar.
  // Die Werte stammen persistent aus dem Produktionsauftrag und überleben auch Seiten-Reloads.
  if (runningJob) {
    productSelect.dataset.runningJobId = runningJob.id;
    unitsInput.value = runningJob.start_input_text || formatProductionUnitsInput(runningJob.output_quantity);
    productSelect.disabled = true;
    unitsInput.disabled = true;
    if (maxBtn) maxBtn.disabled = true;
    if (h24Btn) h24Btn.disabled = true;

    // Das Produkt-Dropdown bleibt frei wählbar, damit andere Produktionsgebäude parallel genutzt werden können.
    // Die angezeigten Startwerte des laufenden Auftrags bleiben eingefroren.
    plan = productionPlan(Number(runningJob.output_quantity || 0));
    ({ buildingType, building, multiplier, unitsPerHour, runningJob } = plan);
  } else {
    const hadRunningJob = !!productSelect.dataset.runningJobId;
    delete productSelect.dataset.runningJobId;
    productSelect.disabled = false;
    unitsInput.disabled = false;
    if (maxBtn) maxBtn.disabled = false;
    if (h24Btn) h24Btn.disabled = false;

    if (hadRunningJob) {
      unitsInput.value = '1';
      plan = productionPlan();
      ({ buildingType, building, multiplier, unitsPerHour, runningJob } = plan);
    }
  }

  const staff = buildingType && building
    ? Math.round(Number(buildingType.employees_per_building || 0) * multiplier)
    : 0;

  const startSnapshot = runningJob?.start_snapshot || {};
  const displayOutputQty = runningJob ? Number(startSnapshot.outputQty ?? runningJob.output_quantity ?? 0) : plan.outputQty;
  const displayHours = runningJob ? Number(startSnapshot.hours ?? runningJob.hours ?? 0) : plan.hours;
  const displayProcurementCost = runningJob ? Number(startSnapshot.procurementCost ?? 0) : plan.procurementCost;
  const displayBaseProductionCost = runningJob ? Number(startSnapshot.baseProductionCost ?? 0) : plan.baseProductionCost;
  const displayPersonnelCost = runningJob ? Number(startSnapshot.personnelCost ?? runningJob.production_cash_cost ?? 0) : plan.personnelCost;
  const displayProductionCost = runningJob
    ? Number(startSnapshot.productionCost ?? (displayProcurementCost + displayPersonnelCost))
    : plan.productionCost;
  const displayFinish = runningJob
    ? new Date(runningJob.finishes_at).toLocaleString(uiLocale(), {
        weekday:'short', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
      }) + ' Uhr'
    : (building && plan.hours > 0 ? formatProductionFinish(plan.hours) : '–');

  const statusRows = buildingType ? [
    `<div class="kv"><span>Benötigtes Gebäude</span><strong>${buildingType.name} ${building ? '✓' : '✗'}</strong></div>`,
    `<div class="kv"><span>Produktqualität</span><strong>Q${runningJob ? Number(runningJob.quality_level || 1) : productQuality(plan.product)} (+${Math.round((qualityMultiplier(runningJob ? runningJob.quality_level : productQuality(plan.product))-1)*100)}% Wert)</strong></div>`,
    `<div class="kv"><span>Mindestqualität Inputs</span><strong>Q${runningJob ? Math.max(1, Number(runningJob.quality_level || 1)-1) : minimumInputQuality(plan.product)}</strong></div>`,
    `<div class="kv"><span>Gebäudelevel</span><strong>${building ? `Level ${building.level}` : 'Nicht gebaut'}</strong></div>`,
    `<div class="kv"><span>Produkt-Basisrate</span><strong>${plan.product ? `${num(plan.product.base_production_rate || 0)} Einheiten / Std.` : '–'}</strong></div>`,
    `<div class="kv"><span>Produktionsrate</span><strong>${building ? `${num(unitsPerHour)} Einheiten / Std.` : '–'}</strong></div>`,
    `<div class="kv"><span>Produktionsmenge</span><strong>${num(displayOutputQty)} Einheiten</strong></div>`,
    `<div class="kv"><span>Produktionsdauer</span><strong>${formatProductionDuration(displayHours)}</strong></div>`,
    `<div class="kv"><span>Voraussichtliches Ende</span><strong>${displayFinish}</strong></div>`,
    ...(plan.product?.category === 'research'
      ? [`<div class="kv"><span>Grund-Produktionskosten</span><strong class="production-cost-negative">-${money(Math.abs(displayBaseProductionCost))}</strong></div>`]
      : [`<div class="kv"><span>${translateUiString('Beschaffungskosten')}</span><strong class="${displayProcurementCost > 0 ? 'production-cost-negative' : 'production-cost-zero'}">${displayProcurementCost > 0 ? '-' : ''}${money(Math.abs(displayProcurementCost))}</strong></div>`]),
    `<div class="kv"><span>${translateUiString('Personalkosten')}</span><strong class="production-cost-negative">-${money(Math.abs(displayPersonnelCost))}</strong></div>`,
    `<div class="kv"><span>Produktionskosten gesamt</span><strong class="production-cost-negative">-${money(Math.abs(displayProductionCost))}</strong></div>`,
    `<div class="kv"><span>Belegschaft</span><strong>${building ? `${num(staff)} Mitarbeiter` : '–'}</strong></div>`
  ] : ['<div class="kv"><span>Benötigtes Gebäude</span><strong>Keines</strong></div>'];

  if (runningJob) {
    const finish = new Date(runningJob.finishes_at);
    const claimable = productionClaimableQuantity(runningJob);
    const runningProduct = state.products.find(p => p.id === runningJob.product_id);
    const productName = productionProductDisplayName(runningProduct?.name, claimable);

    statusRows.push(`<div class="production-running">
      <div class="production-running-main">
        <div>
          <strong>Produktion läuft</strong>
          <span>${num(Math.max(0, Number(runningJob.output_quantity || 0) - Number(runningJob.claimed_quantity || 0)))} Einheiten – fertig am ${finish.toLocaleString(uiLocale(), { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })} Uhr</span>
        </div>
        <button type="button" class="production-claim-btn" ${claimable <= 0 ? 'disabled' : ''} onclick="claimProductionOutput('${runningJob.id}')">Abrufen</button>
      </div>
      <div class="production-claimable ${claimable > 0 ? 'has-output' : ''}">Abrufbar: <strong>${num(claimable)} ${productName}</strong></div>
    </div>`);
  }

  document.getElementById('productionRequirement').innerHTML = statusRows.join('');

  const rows = plan.inputs.map(input => {
    const inputId = input.material_id || input.component_product_id;
    const inputKind = input.material_id ? 'material' : 'product';
    const buyButton = input.enough
      ? ''
      : `<button type="button" class="production-buy-input-btn" onclick="buyMissingProductionInput('${inputKind}','${inputId}')">${translateUiString('Kaufen')}</button>`;

    return `<tr>
      <td>${input.material_id ? 'Material' : 'Vorprodukt'}</td>
      <td>${input.name}</td>
      <td>Q${input.minQuality}+</td>
      <td>${num(input.quantity_per_unit)} ${input.unit}</td>
      <td class="material-amount ${input.enough ? '' : 'missing'}">${num(input.required)} ${input.unit}</td>
      <td class="material-amount ${input.enough ? '' : 'missing'}">${num(input.available)} ${input.unit}</td>
      <td>${buyButton}</td>
    </tr>`;
  });

  document.getElementById('productionRecipe').innerHTML = rows.length
    ? renderTable(['Typ','Input','Qualität','Bedarf je Einheit','Benötigt','Bestand','Aktion'], rows)
    : (plan.product?.category === 'research'
      ? '<div class="research-production-note">Keine Rohstoffe benötigt. Forschungseinheiten benötigen ausschließlich Geld: 12 OC$ Grundkosten + 14 OC$ Personalkosten pro Einheit.</div>'
      : renderTable(['Typ','Input','Qualität','Bedarf je Einheit','Benötigt','Bestand','Aktion'], rows));

  const button = document.getElementById('productionStartBtn');
  button.classList.remove('production-ready', 'production-cancel');

  if (runningJob) {
    button.disabled = false;
    button.textContent = 'Produktion abbrechen';
    button.classList.add('production-cancel');
    button.style.setProperty('background', 'var(--danger-button)', 'important');
    button.style.setProperty('border-color', 'var(--danger-button)', 'important');
    button.style.setProperty('color', '#fff', 'important');
  } else {
    button.style.removeProperty('background');
    button.style.removeProperty('border-color');
    button.style.removeProperty('color');
    button.disabled = !plan.runnable;
    button.textContent = 'Produktion starten';
    button.classList.toggle('production-ready', plan.runnable);
  }

  const hint = document.getElementById('productionCheck');
  hint.classList.toggle('missing-building-warning', !building);
  if (!building) {
    hint.textContent = 'Benötigtes Gebäude fehlt.';
  } else if (runningJob) {
    const refundCash = Number(runningJob.production_cash_cost || 0) * 0.90;
    hint.textContent = `Abbruch möglich: 90% der Produktionskosten (${money(refundCash)}) und 90% der Materialien werden erstattet.`;
  } else if (!plan.atLeastOne) {
    hint.textContent = 'Es muss mindestens 1 Einheit produziert werden können.';
  } else if (!plan.within24h) {
    hint.textContent = 'Die gewählte Menge überschreitet die maximale Produktionsdauer von 24 Stunden.';
  } else if (!plan.materialsOk) {
    hint.textContent = 'Nicht genügend Material für diese Produktionsmenge.';
  } else {
    hint.textContent = `Bereit: ${num(plan.outputQty)} Einheiten in ${num(plan.hours)} Std. für ${money(plan.productionCost)}.`;
  }

  scheduleProductionRefresh();
}

function scheduleProductionRefresh() {
  if (productionRefreshTimer) clearTimeout(productionRefreshTimer);
  const running = [
    ...state.productionJobs.filter(j => j.status === 'running'),
    ...state.retailSaleJobs.filter(j => j.status === 'running')
  ];
  if (!running.length) return;
  const nextFinish = Math.min(...running.map(j => new Date(j.finishes_at).getTime()));
  const delay = Math.max(1000, Math.min(2147480000, nextFinish - Date.now() + 1000));
  productionRefreshTimer = setTimeout(() => loadCompany(), delay);
}

function buildingCategoryLabel(category) {
  if (category === 'retail') return translateUiString('Verkauf');
  if (category === 'research') return translateUiString('Forschung');
  if (category === 'storage') return translateUiString('Lager');
  return translateUiString('Produktion');
}

function renderBuildingCatalog() {
  const table = document.getElementById('buildingCatalogTable');
  const filter = document.getElementById('buildingCategoryFilter');
  if (!table || !filter) return;

  const selectedCategory = filter.value || 'all';
  const slots = buildingSlotsForLevel(state.company?.company_level);
  const used = state.buildings.length;
  const noFreeSlot = used >= slots;

  const rows = state.buildingTypes
    .filter(bt => selectedCategory === 'all' || bt.building_category === selectedCategory)
    .map(bt => {
      const cost = Number(bt.construction_cost || 0);
      const buildHours = buildingConstructionHours(1);
      const count = state.buildings.filter(b => b.building_type_id === bt.id).length;
      const storageAlreadyBuilt = bt.code === 'storage_warehouse' && count > 0;
      const buildDisabled = noFreeSlot || storageAlreadyBuilt;
      const buildLabel = storageAlreadyBuilt
        ? translateUiString('Bereits gebaut')
        : translateUiString(noFreeSlot ? 'Keine Plätze' : 'Bauen');

      return `<tr>
        <td>${bt.name}</td>
        <td>${buildingCategoryLabel(bt.building_category)}</td>
        <td>${count}</td>
        <td><span class="building-construction-cost">-${money(Math.abs(cost))}</span></td>
        <td>${formatBuildingConstructionTime(buildHours)}</td>
        <td>
          <button
            class="building-catalog-build-btn"
            ${buildDisabled ? 'disabled' : ''}
            onclick="buildBuilding('${bt.id}')"
          >${buildLabel}</button>
        </td>
      </tr>`;
    });

  table.innerHTML = renderTable(
    ['Gebäude', 'Kategorie', 'Anzahl', 'Baukosten', 'Bauzeit', 'Aktion'],
    rows
  );
}

function buildingDisplayNumber(building) {
  const siblings = state.buildings
    .filter(b => b.building_type_id === building.building_type_id)
    .sort((a,b) => new Date(a.built_at || 0) - new Date(b.built_at || 0) || String(a.id).localeCompare(String(b.id)));
  return Math.max(1, siblings.findIndex(b => b.id === building.id) + 1);
}

function buildingJobProgress(job) {
  if (!job?.started_at || !job?.finishes_at) return 0;
  const start = new Date(job.started_at).getTime();
  const end = new Date(job.finishes_at).getTime();
  return end > start ? Math.max(0, Math.min(100, (Date.now()-start)/(end-start)*100)) : 0;
}

function buildingConstructionProgress(building) {
  if (!building?.construction_started_at || !building?.construction_complete_at) return 0;
  const start = new Date(building.construction_started_at).getTime();
  const end = new Date(building.construction_complete_at).getTime();
  return end > start ? Math.max(0, Math.min(100, (Date.now()-start)/(end-start)*100)) : 0;
}

function renderBuildings() {
  const slots = buildingSlotsForLevel(state.company?.company_level);
  const usedSlots = state.buildings.length;
  const slotsEl = document.getElementById('buildingSlotsSummary');
  if (slotsEl) {
    slotsEl.innerHTML = `<span>Gebäudeplätze</span><strong>${usedSlots} / ${slots}</strong>`;
    slotsEl.classList.toggle('building-slots-over', usedSlots > slots);
  }

  const selectable = state.buildings.filter(building => {
    const type = state.buildingTypes.find(bt => bt.id === building.building_type_id);
    return building.status === 'active' && ['production','research'].includes(type?.building_category);
  });
  if (!state.buildings.some(b => b.id === state.selectedBuildingId) && selectable.length) {
    state.selectedBuildingId = selectable[0].id;
  }

  const filter = state.buildingOverviewFilter || 'all';
  const categoryOrder = {
    production: 1,
    research: 2,
    retail: 3,
    storage: 4
  };

  const html = state.buildings
    .filter(building => {
      const type = state.buildingTypes.find(bt => bt.id === building.building_type_id);
      return filter === 'all' || type?.building_category === filter;
    })
    .sort((a, b) => {
      const typeA = state.buildingTypes.find(bt => bt.id === a.building_type_id);
      const typeB = state.buildingTypes.find(bt => bt.id === b.building_type_id);
      const catA = categoryOrder[typeA?.building_category] ?? 99;
      const catB = categoryOrder[typeB?.building_category] ?? 99;

      if (catA !== catB) return catA - catB;

      const nameA = typeA?.name || '';
      const nameB = typeB?.name || '';
      const byName = nameA.localeCompare(nameB, uiLocale());
      if (byName !== 0) return byName;

      return new Date(a.built_at || 0) - new Date(b.built_at || 0)
        || String(a.id).localeCompare(String(b.id));
    })
    .map(building => {
      const bt = state.buildingTypes.find(type => type.id === building.building_type_id);
      if (!bt) return '';

      const number = buildingDisplayNumber(building);
      const selected = state.selectedBuildingId === building.id || state.selectedRetailBuildingId === building.id;
      const underConstruction = building.status === 'inactive' && !!building.construction_complete_at;
      const prodJob = state.productionJobs.find(j => j.building_id === building.id && j.status === 'running') || null;
      const retailJob = state.retailSaleJobs.find(j => j.building_id === building.id && j.status === 'running') || null;
      const job = prodJob || retailJob;
      const product = job ? state.products.find(p => p.id === job.product_id) : null;
      const inUse = !!job;
      const isRetail = bt.building_category === 'retail';
      const isStorage = bt.building_category === 'storage';
      const level = Number(building.level || 1);

      let statusClass = 'free', statusText = 'Frei';
      if (underConstruction) { statusClass='building'; statusText='Im Bau / Ausbau'; }
      else if (prodJob) { statusClass='running'; statusText='Produktion läuft'; }
      else if (retailJob) { statusClass='running'; statusText='Verkauf läuft'; }

      const statusHtml = isStorage && !underConstruction
        ? ''
        : `<span class="building-card-status ${statusClass}">${translateUiString(statusText)}</span>`;

      let jobHtml = '';
      if (job) {
        const finish = new Date(job.finishes_at);
        const progress = buildingJobProgress(job);
        const detail = prodJob
          ? `${num(Math.max(0, Number(job.output_quantity||0)-Number(job.claimed_quantity||0)))} Einheiten offen`
          : `${num(Math.max(0, Number(job.quantity||0)-retailSoldQuantity(job)))} Einheiten offen`;
        jobHtml = `<div class="building-card-job">
          <strong>${translateUiString(product?.name || 'Auftrag')} · Q${Number(job.quality_level || 1)}</strong>
          <span class="building-card-meta">${detail}</span>
          <div class="building-card-progress" style="--progress:${progress}%"><span></span></div>
          <span class="building-card-meta">Ende ${finish.toLocaleString(uiLocale(),{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} Uhr</span>
        </div>`;
      }

      let constructionHtml = '';
      if (underConstruction) {
        const progress = buildingConstructionProgress(building);
        const finish = new Date(building.construction_complete_at);
        const targetLevel = Number(building.construction_target_level || building.level || 1);
        const isUpgrade = targetLevel > Number(building.level || 1);
        const constructionLabel = isUpgrade
          ? `${translateUiString('Ausbau auf Level')} ${targetLevel}`
          : translateUiString('Gebäude im Bau');

        const remainingMinutes = buildingRemainingMinutes(building);
        const hourMinutes = Math.min(60, remainingMinutes);
        const ocbBalance = currentOcbBalance();
        const hourLabel = remainingMinutes > 60
          ? `1 Std. · 60 OCB`
          : `${remainingMinutes} Min. · ${remainingMinutes} OCB`;

        constructionHtml = `<div class="building-card-job building-card-construction">
          <strong>${constructionLabel}</strong>
          <div class="building-card-progress" style="--progress:${progress}%"><span></span></div>
          <span class="building-card-meta">${translateUiString('Ende')} ${finish.toLocaleString(uiLocale(),{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} ${translateUiString('Uhr')}</span>
          <div class="building-ocb-speedup">
            <div class="building-ocb-speedup-head">
              <span>⚡ ${translateUiString('Bau beschleunigen')}</span>
              <strong>${num(ocbBalance)} OCB</strong>
            </div>
            <div class="building-ocb-speedup-actions">
              <button type="button"
                onclick="event.stopPropagation();speedUpBuildingWithOcb('${building.id}',${hourMinutes})"
                ${hourMinutes <= 0 || ocbBalance < hourMinutes ? 'disabled' : ''}>${hourLabel}</button>
              <button type="button"
                onclick="event.stopPropagation();speedUpBuildingWithOcb('${building.id}',null)"
                ${remainingMinutes <= 0 || ocbBalance < remainingMinutes ? 'disabled' : ''}>MAX · ${remainingMinutes} OCB</button>
              ${ocbBalance < Math.min(hourMinutes || remainingMinutes, remainingMinutes) ? `<button type="button" class="ghost" onclick="event.stopPropagation();openOcbShop()">${translateUiString('OCB erhalten')}</button>` : ''}
            </div>
          </div>
        </div>`;
      }

      let storageInfoHtml = '';
      if (isStorage && !underConstruction) {
        const storageStatus = state.storageStatus || {};
        const storageQuantity = Number(storageStatus.total_quantity || 0);
        const storageCapacity = Math.max(1, Number(storageStatus.capacity || 1000));
        const storageUsage = Number(
          storageStatus.usage_percent ?? (storageQuantity / storageCapacity * 100)
        );
        const storageProgress = Math.max(0, Math.min(100, storageUsage));

        const storageColorClass =
          storageUsage >= 90 ? 'storage-capacity-red'
          : storageUsage > 80 ? 'storage-capacity-yellow-red'
          : storageUsage >= 70 ? 'storage-capacity-yellow'
          : storageUsage > 55 ? 'storage-capacity-green-yellow'
          : 'storage-capacity-green';

        storageInfoHtml = `
          <div class="building-storage-status">
            <div class="building-storage-capacity">
              <strong>${translateUiString('Kapazität')}: ${num(storageQuantity)} / ${num(storageCapacity)} ${translateUiString('Einheiten')}</strong>
            </div>
            <div class="building-storage-progress" aria-label="${translateUiString('Auslastung')}">
              <span class="${storageColorClass}" style="width:${storageProgress}%"></span>
            </div>
            <div class="building-card-meta building-storage-usage">
              ${translateUiString('Auslastung')}: ${storageUsage.toLocaleString(uiLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %
            </div>
          </div>
        `;
      }

      let actions = '';
      if (underConstruction) {
        actions = `<button type="button" class="strong-danger-btn" onclick="event.stopPropagation();cancelBuildingConstruction('${building.id}','${bt.id}')">${translateUiString('Bau abbrechen')}</button>`;
      } else if (isRetail) {
        actions = `<button type="button" onclick="event.stopPropagation();openRetailBuilding('${building.id}')">${translateUiString(inUse ? 'Verkauf öffnen' : 'Im Handel verwenden')}</button>`;
        if (!inUse) actions += `<button type="button" class="building-upgrade-btn" onclick="event.stopPropagation();upgradeBuilding('${building.id}','${bt.id}')">${translateUiString('Ausbauen')}</button>
          <button type="button" class="building-demolish-btn" onclick="event.stopPropagation();downgradeBuilding('${building.id}','${bt.id}')">${translateUiString(level<=1?'Abreißen':'Abstufen')}</button>`;
      } else if (isStorage) {
        actions = `<button type="button" class="building-upgrade-btn" onclick="event.stopPropagation();upgradeBuilding('${building.id}','${bt.id}')">${translateUiString('Ausbauen')}</button>
          <button type="button" class="building-demolish-btn" onclick="event.stopPropagation();downgradeBuilding('${building.id}','${bt.id}')">${translateUiString(level<=1?'Abreißen':'Abstufen')}</button>
          <button type="button" class="storage-open-building-btn" onclick="event.stopPropagation();openStorageFromBuildingTab()">${translateUiString('Lager öffnen')}</button>`;
      } else {
        actions = `<button type="button" onclick="event.stopPropagation();selectBuildingCard('${building.id}')">${translateUiString(inUse ? 'Auftrag öffnen' : 'Auswählen')}</button>`;
        if (!inUse) actions += `<button type="button" class="building-upgrade-btn" onclick="event.stopPropagation();upgradeBuilding('${building.id}','${bt.id}')">${translateUiString('Ausbauen')}</button>
          <button type="button" class="building-demolish-btn" onclick="event.stopPropagation();downgradeBuilding('${building.id}','${bt.id}')">${translateUiString(level<=1?'Abreißen':'Abstufen')}</button>`;
      }

      const click = underConstruction || isStorage ? '' : (isRetail ? `onclick="openRetailBuilding('${building.id}')"` : `onclick="selectBuildingCard('${building.id}')"`);
      return `<div class="building-card ${selected?'selected':''} ${underConstruction?'under-construction':''} ${isStorage?'storage-building-card':''}" ${click}>
        <div class="building-card-head"><div>
          <div class="building-card-title">${bt.name} #${number}</div>
          <div class="building-card-meta">Level ${level} · ${buildingCategoryLabel(bt.building_category)}</div>
        </div></div>
        ${statusHtml}
        ${jobHtml}
        ${constructionHtml}
        ${storageInfoHtml}
        <div class="building-card-actions ${isStorage ? 'building-storage-actions' : ''}">${actions}</div>
      </div>`;
    }).filter(Boolean).join('');

  const cards = document.getElementById('buildingCards');
  if (cards) cards.innerHTML = html || '<div class="production-building-empty">In dieser Kategorie sind noch keine Gebäude vorhanden.</div>';

  document.querySelectorAll('.building-overview-filter').forEach(button => {
    button.classList.toggle('active', button.dataset.buildingFilter === filter);
  });

  const selected = state.buildings.find(b => b.id === state.selectedBuildingId) || null;
  const selectedType = selected ? state.buildingTypes.find(bt => bt.id === selected.building_type_id) : null;
  const isRetailSelected = selectedType?.building_category === 'retail';
  const isProductionSelected = ['production','research'].includes(selectedType?.building_category);

  const productionControl = document.getElementById('productionControlPanel');
  const retailControl = document.getElementById('retailControlPanel');
  if (productionControl) productionControl.classList.toggle('hidden', !selected || !isProductionSelected);
  if (retailControl) retailControl.classList.toggle('hidden', !selected || !isRetailSelected);

  const heading = document.getElementById('productionSelectedHeading');
  const hint = document.getElementById('productionSelectedHint');
  if (heading && hint && selected && selectedType && isProductionSelected) {
    heading.textContent = `${selectedType.name} #${buildingDisplayNumber(selected)} · Produktion`;
    const running = state.productionJobs.find(j => j.building_id === selected.id && j.status === 'running');
    hint.textContent = running
      ? 'Dieses Gebäude hat bereits einen laufenden Produktionsauftrag.'
      : 'Dieses Gebäude ist frei. Wähle ein Produkt und starte die Produktion.';
  }

  const retailHeading = document.getElementById('retailSelectedHeading');
  const retailHint = document.getElementById('retailSelectedHint');
  if (retailHeading && retailHint && selected && selectedType && isRetailSelected) {
    retailHeading.textContent = `${selectedType.name} #${buildingDisplayNumber(selected)} · Handelsverkauf`;
    const running = state.retailSaleJobs.find(j => j.building_id === selected.id && j.status === 'running');
    retailHint.textContent = running
      ? 'Dieses Geschäft hat bereits einen laufenden Verkaufsauftrag.'
      : 'Dieses Geschäft ist frei. Wähle Produkt, Preis und Menge.';
  }

  renderBuildingCatalog();
}

window.selectBuildingCard = function(buildingId) {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || building.status !== 'active') return;
  const type = state.buildingTypes.find(bt => bt.id === building.building_type_id);
  if (type?.building_category === 'retail') return openRetailBuilding(buildingId);
  if (type?.building_category === 'storage') return;

  state.selectedBuildingId = buildingId;
  state.selectedRetailBuildingId = null;
  updateProductionProductsForSelectedBuilding();
  renderBuildings();
  renderProductionRecipe();
};

window.openStorageFromBuildingTab = function() {
  const storageNav = document.querySelector('.nav-item[data-view="storage"]');
  if (storageNav) {
    storageNav.click();
    return;
  }

  document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view'));
  document.getElementById('storage')?.classList.add('active-view');
  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = translateUiString('Lager');
};

window.openRetailBuilding = function(buildingId) {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || building.status !== 'active') return;
  const type = state.buildingTypes.find(bt => bt.id === building.building_type_id);
  if (type?.building_category !== 'retail') return;

  state.selectedBuildingId = buildingId;
  state.selectedRetailBuildingId = buildingId;
  updateProductionProductsForSelectedBuilding();
  renderBuildings();
  renderRetailSale();

  document.querySelector('.nav-item[data-view="production"]')?.click();
};

function retailSaleContext() {
  const productId = document.getElementById('retailProduct')?.value;
  const product = state.products.find(p => p.id === productId);
  const quality = Number(document.getElementById('retailQuality')?.value || 1);
  const inventory = productLot(productId, quality);
  const buildingType = state.buildingTypes.find(bt => bt.id === product?.required_retail_building_type_id);

  let building = state.buildings.find(
    b => b.id === state.selectedRetailBuildingId && b.status === 'active'
  ) || null;

  if (building && product && building.building_type_id !== product.required_retail_building_type_id) building = null;

  const runningJob = building
    ? state.retailSaleJobs.find(job => job.building_id === building.id && job.status === 'running') || null
    : null;

  const multiplier = building ? buildingLevelMultiplier(building.level) : 1;
  const baseProductRetailRate = Number(product?.base_retail_rate || 0);
  const baseUnitsPerHour = buildingType && building && baseProductRetailRate > 0
    ? Math.max(1, Math.floor(baseProductRetailRate * multiplier))
    : 0;

  const productionCost = Number(inventory?.average_unit_cost || 0);
  const referencePrice = retailAveragePrice(productionCost);
  const minimumPrice = retailMinPrice(productionCost);
  const maximumPrice = retailMaxPrice(productionCost);
  const priceInput = document.getElementById('retailPrice');
  const enteredPrice = Number(priceInput?.value || 0);
  const price = enteredPrice > 0 ? enteredPrice : referencePrice;
  const profitFactor = retailProfitFactor(productionCost, price);
  const effectiveUnitRevenue = retailEffectiveUnitRevenue(productionCost, price);
  const demandFactor = 1;
  const unitsPerHour = baseUnitsPerHour;

  return {
    product, inventory, buildingType, building, runningJob,
    baseProductRetailRate, baseUnitsPerHour, unitsPerHour,
    available: Number(inventory?.quantity || 0),
    productionCost, quality, referencePrice, minimumPrice, maximumPrice,
    price, profitFactor, effectiveUnitRevenue, demandFactor
  };
}

function retailQuantityFromInput(rawValue) {
  const raw = String(rawValue ?? '').trim().toLowerCase();
  const ctx = retailSaleContext();

  const hoursMatch = raw.match(/^(\d{1,2})\s*hrs$/i);
  if (hoursMatch) {
    const hours = Number(hoursMatch[1]);
    if (hours >= 1 && hours <= 24 && ctx.unitsPerHour > 0) {
      return {
        matchedHours: true,
        matchedTime: false,
        hours,
        units: Math.floor(ctx.unitsPerHour * hours)
      };
    }
  }

  const timeMatch = raw.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/i);
  if (timeMatch && ctx.unitsPerHour > 0) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] || 0);
    const meridiem = timeMatch[3].toLowerCase();

    if (hour >= 1 && hour <= 12) {
      if (hour === 12) hour = 0;
      if (meridiem === 'pm') hour += 12;

      const now = new Date();
      const target = new Date(now);
      target.setHours(hour, minute, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);

      const hours = (target.getTime() - now.getTime()) / 3600000;
      if (hours > 0 && hours <= 24.01) {
        return {
          matchedHours: false,
          matchedTime: true,
          hours,
          units: Math.floor(ctx.unitsPerHour * hours),
          targetTime: target
        };
      }
    }
  }

  const numeric = Number(raw.replace(',', '.'));
  return {
    matchedHours: false,
    matchedTime: false,
    hours: null,
    units: Number.isFinite(numeric) ? Math.floor(numeric) : 0
  };
}

function rememberRetailQuantityExpression(input, rawValue, parsed) {
  if (!input) return;
  if (parsed?.matchedHours || parsed?.matchedTime) {
    input.dataset.quantityMode = parsed.matchedTime ? 'time' : 'hours';
    input.dataset.quantityExpression = String(rawValue ?? '').trim();
  } else {
    input.dataset.quantityMode = 'fixed';
    delete input.dataset.quantityExpression;
  }
}

function recalculateRetailQuantityFromRememberedExpression() {
  const qtyInput = document.getElementById('retailQty');
  if (!qtyInput?.dataset.quantityExpression) return false;

  const parsed = retailQuantityFromInput(qtyInput.dataset.quantityExpression);
  if (!(parsed.matchedHours || parsed.matchedTime)) {
    delete qtyInput.dataset.quantityMode;
    delete qtyInput.dataset.quantityExpression;
    return false;
  }

  const ctx = retailSaleContext();
  const available = Math.max(0, Math.floor(ctx.available || 0));
  const maxUnits24h = Math.max(0, Math.floor((ctx.unitsPerHour || 0) * 24));
  qtyInput.value = formatRetailQuantityInput(Math.min(parsed.units, available, maxUnits24h));
  return true;
}

function formatRetailQuantityInput(units) {
  const value = Number(units || 0);
  if (!Number.isFinite(value)) return '0';
  return String(Math.max(0, Math.floor(value)));
}

function retailSoldQuantity(job) {
  if (!job || job.status !== 'running') return 0;
  const quantity = Number(job.quantity || 0);
  const unitsPerHour = Number(job.units_per_hour || 0);
  const startedAt = new Date(job.started_at).getTime();
  const finishesAt = new Date(job.finishes_at).getTime();
  const now = Date.now();

  if (now >= finishesAt) return quantity;
  const elapsedHours = Math.max(0, (now - startedAt) / 3600000);
  return Math.min(quantity, Math.floor(unitsPerHour * elapsedHours));
}

function retailSaleProgress(job) {
  if (!job) {
    return {
      sold: 0,
      claimed: 0,
      claimableUnits: 0,
      unitPrice: 0,
      claimableRevenue: 0,
      openRevenue: 0,
      cancellationFee: 0
    };
  }

  const quantity = Number(job.quantity || 0);
  const claimed = Number(job.claimed_quantity || 0);
  const sold = retailSoldQuantity(job);
  const claimableUnits = Math.max(0, sold - claimed);
  const unitPrice = quantity > 0 ? Number(job.total_value || 0) / quantity : 0;

  return {
    sold,
    claimed,
    claimableUnits,
    unitPrice,
    claimableRevenue: claimableUnits * unitPrice,
    openRevenue: Math.max(0, Number(job.total_value || 0) - claimed * unitPrice),
    cancellationFee: Number(job.total_value || 0) * GAME_RULES.fees.retailCancellationRate
  };
}

function renderRetailSale() {
  const select = document.getElementById('retailProduct');
  const details = document.getElementById('retailSaleDetails');
  const button = document.getElementById('retailSaleBtn');
  const qtyInput = document.getElementById('retailQty');
  const qualitySelect = document.getElementById('retailQuality');
  const priceInput = document.getElementById('retailPrice');
  const maxBtn = document.getElementById('retailMaxBtn');
  const h24Btn = document.getElementById('retail24Btn');
  if (!select || !details || !button || !qtyInput) return;

  const runningRetailJobs = state.retailSaleJobs.filter(job => job.status === 'running');
  const retailProducts = retailSelectableProducts();
  const previous = select.value;

  select.innerHTML = retailProducts.length
    ? retailProducts.map(p => {
        const hasRunning = runningRetailJobs.some(job => job.product_id === p.id);
        return `<option value="${p.id}">${p.name}${hasRunning && !hasProductInventory(p.id) ? ' – Verkauf läuft' : ''}</option>`;
      }).join('')
    : '<option value="">Keine Handelsprodukte verfügbar</option>';

  if (retailProducts.some(p => p.id === previous)) select.value = previous;

  const retailLots = availableProductQualities(select.value);
  const previousQuality = qualitySelect?.value;
  const selectedRunningJob = state.selectedRetailBuildingId
    ? state.retailSaleJobs.find(job => job.status === 'running' && job.building_id === state.selectedRetailBuildingId)
    : state.retailSaleJobs.find(job => job.status === 'running' && job.product_id === select.value);
  if (qualitySelect) {
    const runningQuality = Number(selectedRunningJob?.quality_level || 1);
    qualitySelect.innerHTML = retailLots.length
      ? retailLots.map(l => `<option value="${Number(l.quality_level || 1)}">Q${Number(l.quality_level || 1)} – ${num(l.quantity)} verfügbar</option>`).join('')
      : selectedRunningJob
        ? `<option value="${runningQuality}">Q${runningQuality} – Verkauf läuft</option>`
        : '<option value="1">Q1 – 0 verfügbar</option>';
    if (selectedRunningJob && !retailLots.length) {
      qualitySelect.value = String(runningQuality);
    } else if (retailLots.some(l => String(l.quality_level) === String(previousQuality))) {
      qualitySelect.value = previousQuality;
    }
  }

  let ctx = retailSaleContext();

  if (priceInput && !priceInput.dataset.manualPrice && ctx.referencePrice > 0 && !ctx.runningJob) {
    priceInput.value = ctx.referencePrice.toFixed(2);
    ctx = retailSaleContext();
  }

  // Während eines laufenden Verkaufs bleibt der komplette Startzustand sichtbar.
  if (ctx.runningJob) {
    select.dataset.runningJobId = ctx.runningJob.id;
    select.value = ctx.runningJob.product_id;
    if (qualitySelect) qualitySelect.value = String(ctx.runningJob.quality_level || 1);
    qtyInput.value = ctx.runningJob.start_input_text || formatRetailQuantityInput(ctx.runningJob.quantity);
    const runningSnapshot = ctx.runningJob.start_snapshot || {};
    if (priceInput) priceInput.value = Number(runningSnapshot.unitPrice ?? (Number(ctx.runningJob.total_value || 0) / Number(ctx.runningJob.quantity || 1))).toFixed(2);
    ctx = retailSaleContext();
  } else if (select.dataset.runningJobId) {
    delete select.dataset.runningJobId;
    qtyInput.value = '1';
    delete qtyInput.dataset.quantityMode;
    delete qtyInput.dataset.quantityExpression;
    if (priceInput) {
      delete priceInput.dataset.manualPrice;
      const resetCtx = retailSaleContext();
      if (resetCtx.referencePrice > 0) priceInput.value = resetCtx.referencePrice.toFixed(2);
    }
    ctx = retailSaleContext();
  }

  const parsedQty = retailQuantityFromInput(qtyInput.value);
  const qty = Number(parsedQty.units || 0);
  const wholeUnits = Number.isInteger(qty);
  const hasStock = ctx.product && qty > 0 && wholeUnits && ctx.available + 1e-9 >= qty;
  const saleHours = ctx.unitsPerHour > 0 ? qty / ctx.unitsPerHour : 0;
  const within24h = saleHours > 0 && saleHours <= 24;
  const hasProductionCost = ctx.productionCost > 0;
  const priceWithinRange = hasProductionCost &&
    Number(ctx.price || 0) >= Number(ctx.minimumPrice || 0) &&
    Number(ctx.price || 0) <= Number(ctx.maximumPrice || 0);
  const ready = !!ctx.product && !!ctx.building && !ctx.runningJob && hasStock && priceWithinRange && within24h;

  button.classList.remove('retail-cancel-mode');
  select.disabled = !!ctx.runningJob;
  if (qualitySelect) qualitySelect.disabled = !!ctx.runningJob;
  if (priceInput) priceInput.disabled = !!ctx.runningJob;
  qtyInput.disabled = !!ctx.runningJob;
  if (maxBtn) maxBtn.disabled = !!ctx.runningJob;
  if (h24Btn) h24Btn.disabled = !!ctx.runningJob;

  if (ctx.runningJob) {
    const job = ctx.runningJob;
    const progress = retailSaleProgress(job);
    const runningProduct = state.products.find(p => p.id === job.product_id);
    const finish = new Date(job.finishes_at);
    const remainingUnits = Math.max(0, Number(job.quantity || 0) - progress.sold);

    const startSnapshot = job.start_snapshot || {};
    const startQty = Number(startSnapshot.quantity ?? job.quantity ?? 0);
    const startHours = Number(startSnapshot.hours ?? ((new Date(job.finishes_at) - new Date(job.started_at)) / 3600000));
    const startUnitPrice = Number(startSnapshot.unitPrice ?? (startQty > 0 ? Number(job.total_value || 0) / startQty : 0));
    const startTotalValue = Number(startSnapshot.totalValue ?? job.total_value ?? 0);
    const startUnitsPerHour = Number(startSnapshot.unitsPerHour ?? job.units_per_hour ?? 0);
    const startAvailable = Number(startSnapshot.available ?? 0);

    details.innerHTML = `
      <div class="kv"><span>Verkaufsgebäude</span><strong>${startSnapshot.buildingTypeName || ctx.buildingType?.name || '–'}</strong></div>
      <div class="kv"><span>Gebäudestatus</span><strong class="retail-ready">Verkauf läuft</strong></div>
      <div class="kv"><span>Verkaufsrate</span><strong>${num(startUnitsPerHour)} Einheiten / Std.</strong></div>
      <div class="kv"><span>Bestand beim Start</span><strong>${num(startAvailable)} Einheiten</strong></div>
      <div class="kv"><span>Verkaufspreis</span><strong>${money(startUnitPrice)} / Einheit</strong></div>
      <div class="kv"><span>Verkaufsdauer</span><strong>${formatProductionDuration(startHours)}</strong></div>
      <div class="kv"><span>Voraussichtliches Ende</span><strong>${finish.toLocaleString(uiLocale(), { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })} Uhr</strong></div>
      <div class="kv"><span>Erwarteter Erlös</span><strong>${money(startTotalValue)}</strong></div>
      <div class="retail-running-box">
        <div class="retail-running-head">
          <div>
            <strong>Verkauf läuft</strong>
            <span>${num(remainingUnits)} ${productionProductDisplayName(runningProduct?.name, remainingUnits)} noch offen – fertig am ${finish.toLocaleString(uiLocale(), { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })} Uhr</span>
          </div>
          <button type="button" class="retail-collect-btn" ${progress.claimableUnits <= 0 ? 'disabled' : ''} onclick="collectRetailRevenue('${job.id}')">Einsammeln</button>
        </div>
        <div class="kv"><span>${translateUiString('Bereits verkauft')}</span><strong>${num(progress.sold)} ${productionProductDisplayName(runningProduct?.name, progress.sold)}</strong></div>
        <div class="kv"><span>Einsammelbarer Erlös</span><strong class="retail-revenue-positive">${money(progress.claimableRevenue)}</strong></div>
        <div class="kv"><span>Erwarteter Erlös (offen)</span><strong>${money(progress.openRevenue)}</strong></div>
        <div class="kv"><span>Abbruchgebühr</span><strong class="retail-cancel-fee">-${money(progress.cancellationFee)}</strong></div>
      </div>`;

    button.disabled = false;
    button.textContent = 'Verkauf abbrechen';
    button.classList.add('retail-cancel-mode');
    startProductionClaimDisplayTimer();
    scheduleProductionRefresh();
    return;
  }

  const expectedRevenue = ctx.effectiveUnitRevenue * Math.max(0, qty);
  const cancellationFee = expectedRevenue * GAME_RULES.fees.retailCancellationRate;
  details.innerHTML = ctx.product ? [
    `<div class="kv"><span>Verkaufsgebäude</span><strong>${ctx.buildingType?.name || '–'}</strong></div>`,
    `<div class="kv"><span>Gebäudestatus</span><strong class="${ctx.building ? 'retail-ready' : 'missing-building-warning'}">${ctx.building ? 'Bereit' : 'Benötigtes Gebäude fehlt'}</strong></div>`,
    `<div class="kv"><span>Produkt-Basisverkaufsrate</span><strong>${ctx.product ? `${num(ctx.product.base_retail_rate || 0)} Einheiten / Std.` : '–'}</strong></div>`,
    `<div class="kv"><span>Verkaufsrate</span><strong>${ctx.building ? `${num(ctx.unitsPerHour)} Einheiten / Std.` : '–'}</strong></div>`,
    `<div class="kv"><span>Qualität</span><strong>Q${ctx.quality} (+${Math.round((qualityMultiplier(ctx.quality)-1)*100)}% Wert)</strong></div>`,
    `<div class="kv"><span>Verfügbarer Bestand</span><strong>${num(ctx.available)} Einheiten</strong></div>`,
    `<div class="kv"><span>Ausgewählte Menge</span><strong>${qty > 0 ? `${num(qty)} Einheiten` : '–'}</strong></div>`,
    `<div class="kv"><span>${translateUiString('Vorgeschlagener Preis')}</span><strong>${money(ctx.referencePrice)} / Einheit</strong></div>`,
    `<div class="kv"><span>Gewählter Verkaufspreis</span><strong>${money(ctx.price)} / Einheit</strong></div>`,
    `<div class="kv"><span>Verkaufsdauer</span><strong>${ctx.building && saleHours > 0 ? formatProductionDuration(saleHours) : '–'}</strong></div>`,
    `<div class="kv"><span>Voraussichtliches Ende</span><strong>${ctx.building && saleHours > 0 ? formatProductionFinish(saleHours) : '–'}</strong></div>`,
    `<div class="kv"><span>Erwarteter Erlös</span><strong class="retail-revenue-positive">${money(expectedRevenue)}</strong></div>`,
    `<div class="kv"><span>Abbruchgebühr</span><strong class="retail-cancel-fee">${expectedRevenue > 0 ? `-${money(cancellationFee)}` : money(0)}</strong></div>`
  ].join('') : '<p class="muted">Es befinden sich keine Produkte für den Handelsverkauf im Lager.</p>';

  button.disabled = !ready;

  if (!ctx.product) {
    button.textContent = 'Kein Handelsprodukt';
  } else if (!ctx.building) {
    button.textContent = 'Benötigtes Gebäude fehlt';
  } else if (!wholeUnits) {
    button.textContent = 'Nur ganze Einheiten';
  } else if (!hasStock) {
    button.textContent = 'Nicht genügend Bestand';
  } else if (!hasProductionCost) {
    button.textContent = 'Produktionskosten fehlen';
  } else if (!priceWithinRange) {
    button.textContent = 'Verkauf nicht möglich';
  } else if (!within24h) {
    button.textContent = 'Maximal 24 Std. Verkaufsdauer';
  } else {
    button.textContent = 'Im Handel verkaufen';
  }

  startProductionClaimDisplayTimer();
  scheduleProductionRefresh();
}

function marketProductIdentity(product) {
  return `${product?.name || ''}::${product?.category || ''}`;
}

function marketItemKeyFromOrder(order) {
  if (order?.material_id) return `material:${order.material_id}`;
  const product = state.allProducts.find(p => p.id === order?.product_id);
  return product ? `product:${marketProductIdentity(product)}` : `product-id:${order?.product_id || ''}`;
}

function marketCatalogCategory(item) {
  if (item.type === 'material') return 'Rohstoffe';
  const product = item.product;
  const category = researchCategory(product);
  return category === 'Energietechnik' ? 'Energie' : category;
}

function marketItemIcon(item) {
  const name = String(item.name || '').toLocaleLowerCase(uiLocale());
  if (name.includes('transportcontainer')) return '📦';
  if (name.includes('prozessor')) return '🧩';
  if (name.includes('elektronik')) return '🔌';
  if (name.includes('smartphone')) return '📱';
  if (name.includes('display')) return '🖥️';
  if (name.includes('batter')) return '🔋';
  if (name.includes('stahl')) return '🔩';
  if (name.includes('aluminium')) return '⚙️';
  if (name.includes('kupfer')) return '🟠';
  if (name.includes('silizium')) return '💠';
  if (name.includes('glas')) return '◫';
  if (name.includes('lithium')) return '🔋';
  return ({
    Rohstoffe:'⛏️', Elektronik:'💻', Maschinen:'⚙️', Automobil:'🚗', Chemie:'🧪',
    Bau:'🏗️', Textil:'🧵', Lebensmittel:'🍞', Energie:'⚡', Forschung:'🔬', Sonstige:'📦'
  })[marketCatalogCategory(item)] || '📦';
}

function marketCatalogItems() {
  const items = [];
  state.materials
    .filter(m => m.status !== 'inactive')
    .forEach(material => items.push({
      key:`material:${material.id}`,
      type:'material', id:material.id, name:material.name, material
    }));

  const seen = new Set();
  state.allProducts
    .filter(p => p.status === 'active')
    .forEach(product => {
      const identity = marketProductIdentity(product);
      if (!identity || seen.has(identity)) return;
      seen.add(identity);
      items.push({
        key:`product:${identity}`,
        type:'product', name:product.name, category:product.category, product
      });
    });
  return items;
}

function marketItemDescriptor(key=state.marketSelectedItemKey) {
  return marketCatalogItems().find(item => item.key === key) || null;
}

function marketOrdersForItem(item, { includeOwn=true, quality=state.marketQualityFilter } = {}) {
  if (!item) return [];
  return state.marketOrders
    .filter(order => marketItemKeyFromOrder(order) === item.key)
    .filter(order => includeOwn || order.company_id !== state.company?.id)
    .filter(order => {
      const q = Number(order.quality_level || 1);
      return quality === 'all' || (quality === '5' ? q >= 5 : q === Number(quality));
    })
    .filter(order => ['open','partially_filled'].includes(order.status) && Number(order.remaining_quantity || 0) > 0)
    .sort((a,b) => Number(a.price_per_unit || 0)-Number(b.price_per_unit || 0) || Number(b.quality_level||1)-Number(a.quality_level||1));
}

function marketCategorySort(a,b) {
  const order=['Rohstoffe','Elektronik','Maschinen','Automobil','Chemie','Bau','Textil','Lebensmittel','Energie','Forschung','Sonstige'];
  const ai=order.indexOf(a), bi=order.indexOf(b);
  return (ai<0?999:ai)-(bi<0?999:bi) || a.localeCompare(b,uiLocale());
}

function renderMarketCatalog() {
  const root=document.getElementById('marketCatalog');
  if (!root) return;
  const search=String(state.marketSearchFilter||'').trim().toLocaleLowerCase(uiLocale());
  const items=marketCatalogItems().filter(item => !search || item.name.toLocaleLowerCase(uiLocale()).includes(search));
  const groups=new Map();
  items.forEach(item => {
    const category=marketCatalogCategory(item);
    if (!groups.has(category)) groups.set(category,[]);
    groups.get(category).push(item);
  });

  if (!items.length) {
    root.innerHTML='<div class="market-empty-state">Keine Waren gefunden.</div>';
    return;
  }

  root.innerHTML=[...groups.entries()]
    .sort(([a],[b])=>marketCategorySort(a,b))
    .map(([category,group])=>`<section class="market-category-section">
      <h3>${category}</h3>
      <div class="market-product-grid">
        ${group.sort((a,b)=>a.name.localeCompare(b.name,uiLocale())).map(item=>{
          const orders=marketOrdersForItem(item,{includeOwn:false,quality:'all'});
          const total=orders.reduce((sum,o)=>sum+Number(o.remaining_quantity||0),0);
          const best=orders.length ? Number(orders[0].price_per_unit||0) : 0;
          return `<button type="button" class="market-product-tile" data-market-item="${encodeURIComponent(item.key)}">
            <span class="market-product-icon" aria-hidden="true">${marketItemIcon(item)}</span>
            <strong>${item.name}</strong>
            <span>${orders.length ? `${num(total)} verfügbar` : 'Kein Angebot'}</span>
            <small>${orders.length ? `ab ${money(best)}` : '–'}</small>
          </button>`;
        }).join('')}
      </div>
    </section>`).join('');

  root.querySelectorAll('[data-market-item]').forEach(button=>button.addEventListener('click',()=>{
    state.marketSelectedItemKey=decodeURIComponent(button.dataset.marketItem||'');
    state.marketQualityFilter='all';
    state.marketView='product';
    const qty=document.getElementById('marketProductBuyQty');
    if (qty) qty.value='1';
    renderMarket();
  }));
}

function marketCanSellItem(item) {
  if (!item) return false;
  if (item.type==='material') return materialInventoryLots(item.id).some(l=>Number(l.quantity||0)>0);
  return state.products.some(p => marketProductIdentity(p)===item.key.replace(/^product:/,'') && hasProductInventory(p.id));
}

function marketProductBuyPlan() {
  const item=marketItemDescriptor();
  const qty=Math.max(0,Number(document.getElementById('marketProductBuyQty')?.value||0));
  const orders=marketOrdersForItem(item,{includeOwn:false});
  let remaining=qty,total=0;
  const fills=[];
  for (const order of orders) {
    if (remaining<=0) break;
    const take=Math.min(remaining,Number(order.remaining_quantity||0));
    if (take<=0) continue;
    fills.push({order,quantity:take});
    total += take*Number(order.price_per_unit||0);
    remaining -= take;
  }
  return {item,qty,orders,fills,total,remaining,available:orders.reduce((s,o)=>s+Number(o.remaining_quantity||0),0)};
}

function updateMarketProductBuyPreview() {
  const totalEl=document.getElementById('marketProductBuyTotal');
  const button=document.getElementById('marketProductBuyBtn');
  const availability=document.getElementById('marketProductBuyAvailability');
  if (!totalEl || !button) return;
  const plan=marketProductBuyPlan();
  if (availability) availability.textContent=`${num(plan.available)} verfügbar`;
  if (!plan.item || !(plan.qty>0)) {
    totalEl.textContent='–'; button.disabled=true; return;
  }
  if (plan.remaining>0) {
    totalEl.textContent=`Max. ${num(plan.available)} verfügbar`; button.disabled=true; return;
  }
  totalEl.textContent=money(plan.total);
  button.disabled=false;
}

function renderMarketProductPage() {
  const item=marketItemDescriptor();
  const page=document.getElementById('marketProductPage');
  if (!page || !item) {
    state.marketView='catalog';
    state.marketSelectedItemKey='';
    return;
  }
  document.getElementById('marketProductCategory').textContent=marketCatalogCategory(item);
  document.getElementById('marketProductTitle').textContent=item.name;
  document.getElementById('marketProductHeroIcon').textContent=marketItemIcon(item);
  const sellBtn=document.getElementById('marketSellOpenBtn');
  if (sellBtn) {
    sellBtn.disabled=!marketCanSellItem(item);
    sellBtn.textContent=marketCanSellItem(item)?'Verkaufsorder erstellen':'Kein Bestand zum Verkaufen';
  }

  document.querySelectorAll('.market-quality-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.quality===state.marketQualityFilter));

  const orders=marketOrdersForItem(item,{includeOwn:true});
  const body=document.getElementById('marketOrderBookBody');
  if (body) body.innerHTML=orders.length ? orders.map(order=>{
    const own=order.company_id===state.company?.id;
    return `<tr class="${own?'own-market-order':''}">
      <td><strong>${companyName(order.company_id)}</strong>${own?'<span class="market-own-badge">Du</span>':''}</td>
      <td><span class="market-quality-badge">Q${Number(order.quality_level||1)}</span></td>
      <td>${num(order.remaining_quantity)}</td>
      <td><strong>${money(order.price_per_unit)}</strong></td>
      <td>${own?`<button type="button" class="strong-danger-btn market-cancel-order" data-order-id="${order.id}">Stornieren</button>`:''}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="market-empty-cell">Für diese Auswahl gibt es aktuell keine Verkaufsangebote.</td></tr>';

  body?.querySelectorAll('.market-cancel-order').forEach(btn=>btn.addEventListener('click',()=>cancelOrder(btn.dataset.orderId)));
  updateMarketProductBuyPreview();
}

function renderMyOpenMarketOrders() {
  const root=document.getElementById('myOpenMarketOrders');
  const countEl=document.getElementById('myOpenMarketOrdersCount');
  if (!root || !state.company?.id) return;

  const orders=state.marketOrders
    .filter(order =>
      order.company_id===state.company.id &&
      order.order_type==='sell' &&
      ['open','partially_filled'].includes(order.status) &&
      Number(order.remaining_quantity||0)>0
    )
    .sort((a,b) =>
      itemName(a).localeCompare(itemName(b),uiLocale()) ||
      Number(a.price_per_unit||0)-Number(b.price_per_unit||0)
    );

  if (countEl) countEl.textContent=`${orders.length} offen`;

  if (!orders.length) {
    root.innerHTML='<div class="market-empty-state">Du hast aktuell keine offenen Verkaufsorders.</div>';
    return;
  }

  root.innerHTML=`
    <div class="table-wrap">
      <table class="market-orderbook my-market-orders-table">
        <thead>
          <tr>
            <th>Artikel</th>
            <th>Qualität</th>
            <th>Restmenge</th>
            <th>Preis / Einheit</th>
            <th>Aktion</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(order=>`
            <tr>
              <td><strong>${itemName(order)}</strong></td>
              <td><span class="market-quality-badge">Q${Number(order.quality_level||1)}</span></td>
              <td>${num(order.remaining_quantity)}</td>
              <td><strong>${money(order.price_per_unit)}</strong></td>
              <td>
                <button type="button" class="strong-danger-btn my-market-cancel-order" data-order-id="${order.id}">
                  Stornieren
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;

  root.querySelectorAll('.my-market-cancel-order').forEach(button=>{
    button.addEventListener('click',()=>cancelOrder(button.dataset.orderId));
  });
}

function renderMarket() {
  const catalogView=document.getElementById('marketCatalogView');
  const productView=document.getElementById('marketProductView');
  if (!catalogView || !productView) return;
  const showProduct=state.marketView==='product' && !!marketItemDescriptor();
  catalogView.classList.toggle('hidden',showProduct);
  productView.classList.toggle('hidden',!showProduct);
  if (showProduct) renderMarketProductPage(); else renderMarketCatalog();
  renderMyOpenMarketOrders();
  if (currentLanguage==='en') applyLanguageToDom(document.getElementById('market'));
}


function contractItemName(c) {
  if (c.material_id) return state.materials.find(m => m.id === c.material_id)?.name || 'Material';
  return state.allProducts.find(p => p.id === c.product_id)?.name || 'Produkt';
}
function contractStatus(s) {
  const label = ({ proposed:'Vorgeschlagen', accepted:'Angenommen', fulfilled:'Erfüllt', cancelled:'Storniert', rejected:'Abgelehnt' })[s] || s;
  return translateUiString(label);
}
function renderContracts() {
  const cid = state.company.id;
  const proposedContracts = state.contracts.filter(c => c.status === 'proposed');
  const incoming = proposedContracts.filter(c => c.buyer_company_id === cid);
  const outgoing = proposedContracts.filter(c => c.seller_company_id === cid);

  const contractRows = (contracts, direction) => contracts.map(c => {
    const totalValue = Number(c.quantity || 0) * Number(c.unit_price || 0);
    const partnerId = direction === 'incoming' ? c.seller_company_id : c.buyer_company_id;
    const actions = direction === 'incoming'
      ? `<div class="contract-action-buttons">
          <button class="contract-accept-btn" onclick="acceptContract('${c.id}')">${translateUiString('Annehmen')}</button>
          <button class="strong-danger-btn" onclick="rejectContract('${c.id}')">${translateUiString('Ablehnen')}</button>
        </div>`
      : `<div class="contract-action-buttons">
          <button class="strong-danger-btn" onclick="cancelContract('${c.id}')">${translateUiString('Stornieren')}</button>
        </div>`;

    return `<tr>
      <td>${companyName(partnerId)}</td>
      <td>${contractItemName(c)}</td>
      <td>Q${Number(c.quality_level || 1)}</td>
      <td>${num(c.quantity)}</td>
      <td>${money(c.unit_price)}</td>
      <td><strong>${money(totalValue)}</strong></td>
      <td>${actions}</td>
    </tr>`;
  });

  const incomingTable = document.getElementById('incomingContractsTable');
  const outgoingTable = document.getElementById('outgoingContractsTable');

  if (incomingTable) {
    incomingTable.innerHTML = renderTable(
      ['Absender','Gut','Qualität','Menge','Preis je Einheit','Kaufsumme','Aktion'],
      contractRows(incoming, 'incoming')
    );
  }

  if (outgoingTable) {
    outgoingTable.innerHTML = renderTable(
      ['Empfänger','Gut','Qualität','Menge','Preis je Einheit','Verkaufssumme','Aktion'],
      contractRows(outgoing, 'outgoing')
    );
  }

  updateContractPartnerOptions();
  updateContractGoods();
}

function updateContractPartnerOptions() {
  const hiddenInput = document.getElementById('contractPartner');
  const searchInput = document.getElementById('contractPartnerSearch');
  const displayInput = document.getElementById('contractPartnerDisplay');
  const resultsBox = document.getElementById('contractPartnerSearchResults');
  if (!hiddenInput || !searchInput || !displayInput || !resultsBox || !state.company?.id) return;

  const currentPartner = state.companyDirectory.find(c =>
    c.id === hiddenInput.value &&
    c.company_type === 'player' &&
    c.id !== state.company.id
  );

  if (currentPartner) {
    displayInput.value = `${currentPartner.name}${currentPartner.company_code ? ` · ${currentPartner.company_code}` : ''}`;
  } else {
    hiddenInput.value = '';
    displayInput.value = '';
  }

  const search = searchInput.value.trim().toLocaleLowerCase(uiLocale());
  if (!search) {
    resultsBox.innerHTML = '';
    resultsBox.classList.add('hidden');
    return;
  }

  const matches = state.companyDirectory
    .filter(c => c.company_type === 'player' && c.id !== state.company.id)
    .filter(c => {
      const name = String(c.name || '').toLocaleLowerCase(uiLocale());
      const companyCode = String(c.company_code || '').toLocaleLowerCase(uiLocale());
      return name.includes(search) || companyCode.includes(search);
    })
    .sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), uiLocale()))
    .slice(0, 12);

  if (!matches.length) {
    resultsBox.innerHTML = `<div class="contract-partner-result"><strong>${translateUiString('Kein Unternehmen gefunden')}</strong></div>`;
    resultsBox.classList.remove('hidden');
    return;
  }

  resultsBox.innerHTML = matches.map(c => `
    <button type="button" class="contract-partner-result" data-company-id="${c.id}">
      <strong>${c.name}</strong>
      <span>${c.company_code || ''}</span>
    </button>
  `).join('');

  resultsBox.classList.remove('hidden');
}

function selectContractPartner(companyId) {
  const company = state.companyDirectory.find(c =>
    c.id === companyId &&
    c.company_type === 'player' &&
    c.id !== state.company?.id
  );
  if (!company) return;

  const hiddenInput = document.getElementById('contractPartner');
  const searchInput = document.getElementById('contractPartnerSearch');
  const displayInput = document.getElementById('contractPartnerDisplay');
  const resultsBox = document.getElementById('contractPartnerSearchResults');

  if (hiddenInput) hiddenInput.value = company.id;
  if (displayInput) displayInput.value = `${company.name}${company.company_code ? ` · ${company.company_code}` : ''}`;
  if (searchInput) searchInput.value = `${company.name}${company.company_code ? ` · ${company.company_code}` : ''}`;
  if (resultsBox) {
    resultsBox.innerHTML = '';
    resultsBox.classList.add('hidden');
  }

  renderContractPreview();
}

function updateContractGoods() {
  const type = document.getElementById('contractItemType')?.value || 'product';
  const itemSelect = document.getElementById('contractItem');
  if (!itemSelect) return;

  let opts = [];

  if (type === 'material') {
    opts = state.materials
      .filter(material =>
        state.materialInventory.some(inv =>
          inv.material_id === material.id && Number(inv.quantity || 0) > 0
        )
      )
      .sort((a,b)=>a.name.localeCompare(b.name,uiLocale()))
      .map(m => `<option value="${m.id}">${m.name}</option>`);
  } else {
    opts = stockedProducts()
      .sort((a,b)=>a.name.localeCompare(b.name,uiLocale()))
      .map(p => `<option value="${p.id}">${p.name}</option>`);
  }

  itemSelect.innerHTML = opts.length
    ? opts.join('')
    : '<option value="">Keine passenden Bestände im Lager</option>';

  updateContractQualityOptions();
}

function contractOfferContext() {
  const type = document.getElementById('contractItemType')?.value || 'product';
  const itemId = document.getElementById('contractItem')?.value;
  const quality = Number(document.getElementById('contractQuality')?.value || 1);
  const quantity = Math.max(0, Number(document.getElementById('contractQty')?.value || 0));
  const price = Math.max(0, Number(document.getElementById('contractPrice')?.value || 0));

  const item = type === 'material'
    ? state.materials.find(m => m.id === itemId)
    : state.products.find(p => p.id === itemId);

  const lot = type === 'material'
    ? materialInventoryLots(itemId).find(l => Number(l.quality_level || 1) === quality)
    : productLot(itemId, quality);

  const unitCost = Number(lot?.average_unit_cost || 0);
  const referencePrice = unitCost * GAME_RULES.pricing.playerRecommendedCostMultiplier;
  const freight = transportContainerFreight(quantity);

  return { type, item, lot, quality, quantity, price, unitCost, referencePrice, freight };
}

function renderContractPreview() {
  const preview = document.getElementById('contractPreview');
  if (!preview) return;

  const ctx = contractOfferContext();
  if (!ctx.item || !ctx.lot) {
    preview.innerHTML = '<p class="muted">Kein passender Lagerbestand für einen Vertrag vorhanden.</p>';
    return;
  }

  const available = Number(ctx.lot.quantity || 0);
  const unitCost = Number(ctx.unitCost || ctx.lot.average_unit_cost || 0);
  const totalCost = ctx.quantity * unitCost;
  const freightCost = Number(ctx.freight?.cost || 0);
  const revenue = ctx.quantity * ctx.price;
  const profit = revenue - totalCost - freightCost;
  const costLabel = ctx.type === 'material' ? 'Einstandskosten' : 'Produktionskosten';
  const profitClass = profit >= 0 ? 'retail-revenue-positive' : 'retail-cancel-fee';
  const freightClass = ctx.freight?.sufficient ? 'retail-cancel-fee' : 'missing-building-warning';

  preview.innerHTML = `
    <div class="kv"><span>Verfügbarer Bestand</span><strong>${num(available)}</strong></div>
    <div class="kv"><span>${translateUiString(costLabel)}</span><strong class="retail-cancel-fee">${totalCost > 0 ? `-${money(totalCost)}` : money(0)}</strong></div>
    <div class="kv"><span>Frachtkosten</span><strong class="${freightClass}">${ctx.freight?.exempt ? 'Nicht erforderlich' : (freightCost > 0 ? `-${money(freightCost)}` : money(0))}</strong></div>
    <div class="kv"><span>Transportcontainer</span><strong class="${ctx.freight?.sufficient ? '' : 'missing-building-warning'}">${ctx.freight?.exempt ? 'Nicht erforderlich' : `${num(ctx.freight?.available || 0)} / ${num(ctx.quantity)} verfügbar`}</strong></div>
    <div class="kv"><span>${translateUiString('Erlös')}</span><strong class="retail-revenue-positive">${money(revenue)}</strong></div>
    <div class="kv"><span>${translateUiString('Gewinn / Verlust')}</span><strong class="${profitClass}">${profit >= 0 ? '+' : '-'}${money(Math.abs(profit))}</strong></div>
  `;
}

function updateContractQualityOptions() {
  const type = document.getElementById('contractItemType')?.value;
  const itemId = document.getElementById('contractItem')?.value;
  const qualitySelect = document.getElementById('contractQuality');
  if (!qualitySelect) return;

  const previous = qualitySelect.value;
  const lots = type === 'material'
    ? materialInventoryLots(itemId)
    : productInventoryLots(itemId);

  const qualities = [...new Set(
    lots
      .filter(lot => Number(lot.quantity || 0) > 0)
      .map(lot => Number(lot.quality_level || 1))
  )].sort((a,b)=>a-b);

  qualitySelect.innerHTML = qualities.length
    ? qualities.map(q => `<option value="${q}">Q${q}</option>`).join('')
    : '<option value="">Keine Qualität auf Lager</option>';

  if (qualities.some(q => String(q) === String(previous))) {
    qualitySelect.value = previous;
  }

  const priceInput = document.getElementById('contractPrice');
  const ctx = contractOfferContext();
  if (priceInput && ctx.referencePrice > 0) {
    priceInput.value = ctx.referencePrice.toFixed(2);
  }

  renderContractPreview();
}


function financePeriodStart(period, offset = state.financePeriodOffset || 0) {
  const now = new Date();

  if (period === 'day') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    start.setDate(start.getDate() + offset);
    return start;
  }

  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth() + offset, 1, 0, 0, 0, 0);
  }

  const start = new Date(now);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day + (offset * 7));
  start.setHours(0, 0, 0, 0);
  return start;
}


function financePeriodEnd(period, start) {
  const end = new Date(start);

  if (period === 'day') {
    end.setHours(23, 59, 59, 999);
    return end;
  }

  if (period === 'week') {
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  end.setMonth(end.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return end;
}

function formatFinancePeriodRange(period, start, end) {
  const shortDate = (date, includeYear = false) => date.toLocaleDateString(uiLocale(), {
    day: '2-digit',
    month: '2-digit',
    ...(includeYear ? { year: 'numeric' } : {})
  });

  if (period === 'day') {
    return shortDate(start, true);
  }

  if (period === 'week') {
    return `${shortDate(start)} – ${shortDate(end, true)}`;
  }

  return `${shortDate(start)} – ${shortDate(end, true)}`;
}

function financePeriodTransactions() {
  const start = financePeriodStart(state.financePeriod);
  const end = financePeriodEnd(state.financePeriod, start);
  return state.transactions.filter(t => {
    const createdAt = new Date(t.created_at);
    return createdAt >= start && createdAt <= end;
  });
}

function financeMovementDate(value) {
  const date = new Date(value);
  return date.toLocaleDateString(uiLocale(), { day:'numeric', month:'numeric' });
}

function financeMovementTime(value) {
  return new Date(value).toLocaleString(uiLocale(), {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
}

function financeMovementCompanyName(companyId) {
  if (!companyId) return null;
  if (companyId === state.company?.id) return state.company?.name || null;
  return state.companyDirectory.find(c => c.id === companyId)?.name || null;
}

function financeMovementItemName(productId, materialId, trade = null) {
  if (trade?.products?.name) return trade.products.name;
  if (trade?.materials?.name) return trade.materials.name;
  if (materialId) return state.materials.find(m => m.id === materialId)?.name || null;
  if (productId) return state.allProducts.find(p => p.id === productId)?.name || null;
  return null;
}

function resolveFinanceContract(transaction) {
  if (!transaction || !['contract_buy','contract_sale'].includes(transaction.transaction_type)) return null;

  if (transaction.reference_type === 'contract' && transaction.reference_id) {
    const exact = state.contracts.find(c => c.id === transaction.reference_id);
    if (exact) return exact;
  }

  const isBuy = transaction.transaction_type === 'contract_buy';
  const companyId = state.company?.id;
  const txAmount = Math.abs(Number(transaction.amount || 0));
  const txTime = new Date(transaction.created_at).getTime();

  const candidates = state.contracts
    .filter(contract => {
      if (isBuy && contract.buyer_company_id !== companyId) return false;
      if (!isBuy && contract.seller_company_id !== companyId) return false;

      const contractTotal = Math.abs(Number(contract.quantity || 0) * Number(contract.unit_price || 0));
      const amountTolerance = Math.max(0.01, txAmount * 0.0001);
      return Math.abs(contractTotal - txAmount) <= amountTolerance;
    })
    .sort((a, b) => {
      const aTime = new Date(a.fulfilled_at || a.accepted_at || a.created_at || 0).getTime();
      const bTime = new Date(b.fulfilled_at || b.accepted_at || b.created_at || 0).getTime();
      return Math.abs(aTime - txTime) - Math.abs(bTime - txTime);
    });

  return candidates[0] || null;
}

function financeMovementDetails(transaction) {
  const rows = [];
  const add = (label, value) => {
    if (value === null || value === undefined || value === '') return;
    rows.push(`<div class="finance-movement-detail"><span>${translateUiString(label)}</span><strong>${value}</strong></div>`);
  };

  add('Zeit', financeMovementTime(transaction.created_at));

  const financeContract = resolveFinanceContract(transaction);
  if (financeContract) {
    const isBuy = transaction.transaction_type === 'contract_buy';
    const partnerId = isBuy ? financeContract.seller_company_id : financeContract.buyer_company_id;
    add('Beschreibung', transaction.description);
    add('Partner', financeMovementCompanyName(partnerId));
    add(financeContract.material_id ? 'Rohstoff' : 'Produkt',
      financeMovementItemName(financeContract.product_id, financeContract.material_id));
    add('Qualität', `Q${Number(financeContract.quality_level || 1)}`);
    add('Menge', num(financeContract.quantity));
    add('Preis je Einheit', money(financeContract.unit_price));
    add('Gesamtbetrag', money(Number(financeContract.quantity || 0) * Number(financeContract.unit_price || 0)));
  } else if (transaction.reference_type === 'market_order' && transaction.reference_id) {
    const txTime = new Date(transaction.created_at).getTime();
    const candidates = state.marketTrades
      .filter(trade => trade.order_id === transaction.reference_id)
      .sort((a,b) =>
        Math.abs(new Date(a.executed_at).getTime() - txTime) -
        Math.abs(new Date(b.executed_at).getTime() - txTime)
      );
    const trade = candidates[0] || null;

    if (trade) {
      const isBuy = trade.buyer_company_id === state.company?.id;
      const partnerId = isBuy ? trade.seller_company_id : trade.buyer_company_id;
      add('Partner', financeMovementCompanyName(partnerId));
      add(trade.material_id ? 'Rohstoff' : 'Produkt',
        financeMovementItemName(trade.product_id, trade.material_id, trade));
      add('Menge', num(trade.quantity));
      add('Qualität', `Q${Number(trade.quality_level || 1)}`);
      add('Preis je Einheit', money(trade.price_per_unit));
      add('Handelswert', money(trade.total_value));
      if (transaction.transaction_type === 'market_fee') {
        add('Gebühr', money(Math.abs(Number(transaction.amount || 0))));
      }
    }
  } else if (transaction.reference_type === 'production_job' && transaction.reference_id) {
    const job = state.productionJobs.find(j => j.id === transaction.reference_id);
    if (job) {
      const product = state.products.find(p => p.id === job.product_id);
      add('Produkt', product?.name || null);
      add('Menge', num(job.quantity ?? job.output_quantity ?? job.requested_quantity));
      add('Qualität', product ? `Q${productQuality(product)}` : null);
    }
  } else if (transaction.reference_type === 'building' && transaction.reference_id) {
    const building = state.buildings.find(b => b.id === transaction.reference_id);
    const type = building ? state.buildingTypes.find(bt => bt.id === building.building_type_id) : null;
    add('Gebäude', type?.name || null);
    add('Level', building?.level ? String(building.level) : null);
  }

  if (!financeContract) {
    if (transaction.description) add('Beschreibung', transaction.description);
    add('Betrag', money(transaction.amount));
  }

  return rows.join('');
}

function financeMovementTitle(transaction) {
  const financeContract = resolveFinanceContract(transaction);
  if (financeContract) {
    const isBuy = transaction.transaction_type === 'contract_buy';
    const partnerId = isBuy ? financeContract.seller_company_id : financeContract.buyer_company_id;
    const partner = financeMovementCompanyName(partnerId);
    const item = financeMovementItemName(financeContract.product_id, financeContract.material_id);
    const action = isBuy ? 'Vertrag von' : 'Vertrag an';
    return `${item || translateUiString('Vertrag')} ${action} ${partner || translateUiString('Unternehmen')}`;
  }

  if (transaction.reference_type === 'market_order' && transaction.reference_id) {
    const txTime = new Date(transaction.created_at).getTime();
    const trade = state.marketTrades
      .filter(t => t.order_id === transaction.reference_id)
      .sort((a,b) =>
        Math.abs(new Date(a.executed_at).getTime() - txTime) -
        Math.abs(new Date(b.executed_at).getTime() - txTime)
      )[0];

    if (trade) {
      const item = financeMovementItemName(trade.product_id, trade.material_id, trade);
      const isBuy = trade.buyer_company_id === state.company?.id;
      if (transaction.transaction_type === 'market_fee') {
        return `${item || translateUiString('Ware')} · ${translateUiString('Marktgebühr')}`;
      }
      return `${item || translateUiString('Ware')} · ${translateUiString(isBuy ? 'Marktkauf' : 'Marktverkauf')}`;
    }
  }

  return transaction.description || transactionLabel(transaction.transaction_type);
}

window.toggleFinanceMovement = function(scope, movementId) {
  const container = document.querySelector(`.finance-movements[data-finance-scope="${scope}"]`);
  if (!container) return;

  const item = container.querySelector(`.finance-movement[data-movement-id="${movementId}"]`);
  if (!item) return;

  const button = item.querySelector('.finance-movement-toggle');
  const details = item.querySelector('.finance-movement-details');
  const open = item.classList.toggle('open');

  if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (details) details.hidden = !open;
};

function renderFinanceMovements(transactions, scope = 'finance') {
  if (!transactions?.length) {
    return `<p class="muted">${translateUiString('Noch keine Daten.')}</p>`;
  }

  return `
    <div class="finance-movements" data-finance-scope="${scope}">
      ${transactions.map((transaction, index) => {
        const movementId = `${scope}-${transaction.id || index}`;
        const amount = Number(transaction.amount || 0);
        const isCost = amount < 0;
        return `
          <article class="finance-movement" data-movement-id="${movementId}">
            <button type="button" class="finance-movement-toggle" aria-expanded="false"
              onclick="toggleFinanceMovement('${scope}','${movementId}')">
              <span class="finance-movement-arrow" aria-hidden="true">›</span>
              <span class="finance-movement-date">${financeMovementDate(transaction.created_at)}</span>
              <span class="finance-movement-title">${financeMovementTitle(transaction)}</span>
              <span class="finance-movement-amount ${isCost ? 'finance-movement-cost' : ''}">
                ${isCost ? '−' : ''}${money(Math.abs(amount))}
              </span>
            </button>
            <div class="finance-movement-details" hidden>
              ${financeMovementDetails(transaction)}
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

const FINANCE_MOVEMENT_FILTERS = [
  { id:'all', label:'Alle' },
  { id:'sales', label:'Verkäufe' },
  { id:'production', label:'Produktion' },
  { id:'trade', label:'Handel' },
  { id:'building', label:'Bau' },
  { id:'storage', label:'Lager' },
  { id:'research', label:'Forschung' },
  { id:'contracts', label:'Verträge' },
  { id:'finance', label:'Finanzierung' },
  { id:'other', label:'Sonstiges' }
];

function financeMovementCategory(transaction) {
  const type = transaction?.transaction_type || '';

  if (['market_sale','retail_sale'].includes(type)) return 'sales';
  if (['production','production_refund'].includes(type)) return 'production';
  if (['market_buy','market_fee','freight_cost','retail_cancel_fee','retail_cancel_refund'].includes(type)) return 'trade';
  if (['construction','building_refund'].includes(type)) return 'building';
  if (['storage_fee','storage_forced_auction'].includes(type)) return 'storage';
  if (['research','research_investment'].includes(type)) return 'research';
  if (['contract_buy','contract_sale'].includes(type)) return 'contracts';
  if (type.startsWith('bond_')) return 'finance';
  return 'other';
}

window.setFinanceMovementFilter = function(filter) {
  if (!FINANCE_MOVEMENT_FILTERS.some(item => item.id === filter)) return;
  state.financeMovementFilter = filter;
  renderFinanceTable();
};

function renderFinanceTable() {
  const container = document.getElementById('financeTable');
  if (!container) return;

  const transactions = financePeriodTransactions();
  const activeFilter = state.financeMovementFilter || 'all';

  const counts = transactions.reduce((result, transaction) => {
    const category = financeMovementCategory(transaction);
    result[category] = (result[category] || 0) + 1;
    return result;
  }, {});

  const filteredTransactions = activeFilter === 'all'
    ? transactions
    : transactions.filter(transaction => financeMovementCategory(transaction) === activeFilter);

  container.innerHTML = `
    <div class="finance-movement-filters" role="group" aria-label="${translateUiString('Ein- und Auszahlungen')}">
      ${FINANCE_MOVEMENT_FILTERS.map(filter => {
        const count = filter.id === 'all' ? transactions.length : (counts[filter.id] || 0);
        return `
          <button type="button"
            class="finance-movement-filter ${activeFilter === filter.id ? 'active' : ''}"
            onclick="setFinanceMovementFilter('${filter.id}')">
            <span>${translateUiString(filter.label)}</span>
            <strong>${count}</strong>
          </button>
        `;
      }).join('')}
    </div>
    <div class="finance-movement-list-wrap">
      ${renderFinanceMovements(filteredTransactions, 'finance')}
    </div>
  `;
}

function financeStatementAmount(value, options = {}) {
  const number = Number(value || 0);
  const { cost = false, signed = false, emphasize = false } = options;
  const absolute = Math.abs(number);

  let prefix = '';
  let className = '';
  if (signed) {
    if (number < 0) {
      prefix = '−';
      className = 'finance-negative';
    } else if (number > 0) {
      prefix = '+';
      className = 'finance-positive';
    }
  } else if (cost && absolute > 0) {
    prefix = '−';
    className = 'finance-negative';
  } else if (!cost && number > 0) {
    className = emphasize ? 'finance-positive' : '';
  }

  return `<strong class="${className}">${prefix}${money(absolute)}</strong>`;
}

function financeStatementRow(label, value, options = {}) {
  const { cost = false, signed = false, muted = false } = options;
  return `
    <div class="finance-statement-row ${muted ? 'finance-statement-row-muted' : ''}">
      <span>${translateUiString(label)}</span>
      ${financeStatementAmount(value, { cost, signed })}
    </div>
  `;
}

function financeStatementSection(title, rows, totalLabel, totalValue, totalOptions = {}) {
  return `
    <section class="finance-statement-section">
      <h3>${translateUiString(title)}</h3>
      ${rows.length ? `<div class="finance-statement-rows">${rows.join('')}</div>` : ''}
      <div class="finance-statement-total">
        <span>${translateUiString(totalLabel)}</span>
        ${financeStatementAmount(totalValue, { signed:true, emphasize:true, ...totalOptions })}
      </div>
    </section>
  `;
}

function renderFinanceSummary() {
  const container = document.getElementById('financeSummary');
  if (!container) return;

  const start = financePeriodStart(state.financePeriod);
  const end = financePeriodEnd(state.financePeriod, start);
  const periodRange = formatFinancePeriodRange(state.financePeriod, start, end);
  const transactions = financePeriodTransactions();

  const jobs = state.productionJobs.filter(j => {
    const startedAt = new Date(j.started_at);
    return startedAt >= start && startedAt <= end && j.status !== 'cancelled';
  });

  const sumType = (...types) => transactions
    .filter(t => types.includes(t.transaction_type))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const sumCostBasisType = (...types) => transactions
    .filter(t => types.includes(t.transaction_type))
    .reduce((sum, t) => sum + Number(t.cost_basis || 0), 0);

  const costType = (...types) => Math.abs(sumType(...types));

  // Marktverkäufe werden netto gespeichert. Für die GuV wird die Marktgebühr
  // zum Bruttoverkauf zurückgerechnet und danach als eigene Ausgabe ausgewiesen.
  const netMarketSales = sumType('market_sale');
  const marketFees = costType('market_fee');
  const grossMarketSales = netMarketSales + marketFees;

  const retailSales = sumType('retail_sale');
  const contractSales = sumType('contract_sale');
  const storageAuctionRevenue = sumType('storage_forced_auction');
  const productionRefunds = sumType('production_refund');
  const retailCancelRefunds = sumType('retail_cancel_refund');

  const productionCosts = jobs.reduce(
    (sum, j) => sum + Number(j.production_cash_cost || 0),
    0
  );
  const marketBuyCosts = costType('market_buy');
  const contractBuyCosts = costType('contract_buy');
  const freightCosts = costType('freight_cost');
  const retailCancelFees = costType('retail_cancel_fee');
  const storageHoldingCosts = costType('storage_fee');
  // Der Einstandswert investierter Forschungseinheiten wurde bereits beim
  // Einkauf (Markt/Vertrag) oder bei der Produktion als Aufwand erfasst.
  // research_investment.cost_basis dient nur der Nachvollziehbarkeit und darf
  // deshalb hier nicht nochmals als Forschungskosten gezählt werden.
  const directResearchCosts = costType('research');
  const patentValueGains = sumType('research_investment');

  const buildingCosts = costType('construction');
  const buildingRefunds = sumType('building_refund');

  const bondInterestIncome = sumType('bond_interest_income', 'bond_interest_state');
  const bondInterestPaid = costType('bond_interest_paid');

  const excludedResultTypes = new Set([
    'market_sale','retail_sale','contract_sale','storage_forced_auction',
    'production_refund','retail_cancel_refund',
    'production','market_buy','contract_buy','market_fee','freight_cost','retail_cancel_fee',
    'storage_fee','research','research_investment',
    'construction','building_refund',
    'bond_interest_income','bond_interest_state','bond_interest_paid',
    'bond_investment','bond_proceeds','bond_repayment','founding_capital'
  ]);

  const otherOperatingIncome = transactions
    .filter(t => Number(t.amount || 0) > 0 && !excludedResultTypes.has(t.transaction_type))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const otherOperatingCosts = Math.abs(transactions
    .filter(t => Number(t.amount || 0) < 0 && !excludedResultTypes.has(t.transaction_type))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0));

  const operatingRevenue =
    grossMarketSales +
    retailSales +
    contractSales +
    storageAuctionRevenue +
    productionRefunds +
    retailCancelRefunds +
    patentValueGains +
    otherOperatingIncome;

  const operatingCosts =
    productionCosts +
    marketBuyCosts +
    contractBuyCosts +
    marketFees +
    freightCosts +
    retailCancelFees +
    storageHoldingCosts +
    directResearchCosts +
    otherOperatingCosts;

  const operatingResult = operatingRevenue - operatingCosts;
  const investmentResult = buildingRefunds - buildingCosts;
  const financeResult = bondInterestIncome - bondInterestPaid;
  const profit = operatingResult + investmentResult + financeResult;

  const bondProceeds = sumType('bond_proceeds');
  const bondInvestments = Math.abs(sumType('bond_investment'));
  const bondRepayments = Math.abs(sumType('bond_repayment'));
  const foundingCapital = sumType('founding_capital');

  const periodLabel =
    state.financePeriodOffset === 0
      ? (state.financePeriod === 'day' ? 'Heute' : state.financePeriod === 'month' ? 'Aktueller Monat' : 'Aktuelle Woche')
      : (state.financePeriod === 'day' ? 'Tag' : state.financePeriod === 'month' ? 'Monat' : 'Woche');

  const revenueRows = [
    financeStatementRow('Warenbörse – Verkäufe', grossMarketSales),
    financeStatementRow('Einzelhandel – Verkäufe', retailSales),
    financeStatementRow('Vertragsverkäufe', contractSales),
    financeStatementRow('Zwangsauktionen', storageAuctionRevenue)
  ];
  if (productionRefunds > 0) revenueRows.push(financeStatementRow('Produktionserstattungen', productionRefunds));
  if (retailCancelRefunds > 0) revenueRows.push(financeStatementRow('Verkaufserstattungen', retailCancelRefunds));
  if (patentValueGains > 0) revenueRows.push(financeStatementRow('Patentwert-Gewinne', patentValueGains));
  if (otherOperatingIncome > 0) revenueRows.push(financeStatementRow('Sonstige Einnahmen', otherOperatingIncome));

  const expenseRows = [
    financeStatementRow('Produktionskosten', productionCosts, { cost:true }),
    financeStatementRow('Markteinkäufe', marketBuyCosts, { cost:true }),
    financeStatementRow('Vertragskäufe', contractBuyCosts, { cost:true }),
    financeStatementRow('Marktgebühren', marketFees, { cost:true }),
    financeStatementRow('Frachtkosten', freightCosts, { cost:true }),
    financeStatementRow('Storno-/Abbruchgebühren', retailCancelFees, { cost:true }),
    financeStatementRow('Lagerhaltungskosten', storageHoldingCosts, { cost:true }),
    financeStatementRow('Forschungskosten', directResearchCosts, { cost:true })
  ];
  if (otherOperatingCosts > 0) expenseRows.push(financeStatementRow('Sonstige Betriebskosten', otherOperatingCosts, { cost:true }));

  const investmentRows = [
    financeStatementRow('Baukosten', buildingCosts, { cost:true }),
    financeStatementRow('Gebäudeerstattungen', buildingRefunds)
  ];

  const financeRows = [
    financeStatementRow('Zinserträge', bondInterestIncome),
    financeStatementRow('Zinsaufwand', bondInterestPaid, { cost:true })
  ];

  const capitalRows = [];
  if (foundingCapital !== 0) capitalRows.push(financeStatementRow('Gründungskapital', foundingCapital, { signed:true }));
  if (bondProceeds !== 0) capitalRows.push(financeStatementRow('Anleiheerlöse', bondProceeds, { signed:true }));
  if (bondInvestments !== 0) capitalRows.push(financeStatementRow('Anleiheinvestitionen', -bondInvestments, { signed:true }));
  if (bondRepayments !== 0) capitalRows.push(financeStatementRow('Tilgungen', -bondRepayments, { signed:true }));

  container.innerHTML = `
    <div class="finance-statement-period">
      <span>${translateUiString('Zeitraum')}</span>
      <strong>${translateUiString(periodLabel)}</strong>
      <small>${periodRange}</small>
    </div>

    ${financeStatementSection('Betriebserträge', revenueRows, 'Betriebserträge', operatingRevenue)}
    ${financeStatementSection('Betriebsausgaben', expenseRows, 'Betriebsausgaben', -operatingCosts)}
    ${financeStatementSection('Betriebsergebnis', [], 'Betriebsergebnis', operatingResult)}
    ${financeStatementSection('Investitionen', investmentRows, 'Investitionsergebnis', investmentResult)}
    ${financeStatementSection('Finanzierung', financeRows, 'Finanzergebnis', financeResult)}

    <div class="finance-statement-grand-total ${profit < 0 ? 'loss' : 'gain'}">
      <span>${translateUiString('Gesamtergebnis')}</span>
      ${financeStatementAmount(profit, { signed:true, emphasize:true })}
    </div>

    ${capitalRows.length ? `
      <section class="finance-statement-section finance-capital-section">
        <h3>${translateUiString('Kapitalbewegungen')} <small>(${translateUiString('nicht ergebniswirksam')})</small></h3>
        <div class="finance-statement-rows">${capitalRows.join('')}</div>
      </section>
    ` : ''}
  `;

  document.querySelectorAll('.finance-period-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === state.financePeriod);
  });

  const nextBtn = document.getElementById('financeNextPeriod');
  if (nextBtn) nextBtn.disabled = state.financePeriodOffset >= 0;

  renderFinanceTable();
}


function bondStatusLabel(status) {
  const label = ({
    open:'Offen',
    funded:'Voll finanziert',
    closed:'Beendet',
    active:'Aktiv',
    repaid:'Getilgt',
    auto_repaid:'Automatisch getilgt',
    defaulted:'Ausgefallen',
    cancelled:'Storniert'
  })[status] || status || '–';
  return translateUiString(label);
}

function formatBondDate(value) {
  if (!value) return '–';
  return new Date(value).toLocaleString(uiLocale(), {
    day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
  }) + ' Uhr';
}

function updateBondRequestPreview() {
  const countInput = document.getElementById('bondRequestCount');
  const preview = document.getElementById('bondRequestAmountPreview');
  if (!countInput || !preview) return;
  const count = Math.max(0, Math.floor(Number(countInput.value || 0)));
  preview.textContent = money(count * 5000);
}

function renderBonds() {
  const dashboard = state.bondDashboard;
  const container = document.getElementById('bondFinanceContent');
  if (!container) return;

  if (!dashboard) {
    container.innerHTML = '<p class="muted">Anleihedaten konnten nicht geladen werden.</p>';
    return;
  }

  const unlocked = Number(state.company?.company_level || 0) >= 10;
  const buildingValue = Number(dashboard.building_value || 0);
  const creditLimit = Number(dashboard.credit_limit || 0);
  const outstanding = Number(dashboard.outstanding_principal || 0);
  const reserved = Number(dashboard.reserved_requests || 0);
  const available = Number(dashboard.available_credit || 0);
  const defaultDays = Number(dashboard.default_days || 0);

  const warning = defaultDays > 0
    ? `<div class="bond-warning"><strong>⚠ Zinsausfall: ${defaultDays} von 3 Tagen.</strong><span>Nach dem dritten aufeinanderfolgenden Ausfall wird das Unternehmen zurückgesetzt.</span></div>`
    : '';

  const overview = `
    <div class="bond-overview">
      <div class="finance-summary-card"><span>Gebäudewert</span><strong>${money(buildingValue)}</strong></div>
      <div class="finance-summary-card"><span>Kreditlimit (99%)</span><strong>${money(creditLimit)}</strong></div>
      <div class="finance-summary-card"><span>Offene Kreditsumme</span><strong>${money(outstanding)}</strong></div>
      <div class="finance-summary-card"><span>Reservierte Anfragen</span><strong>${money(reserved)}</strong></div>
      <div class="finance-summary-card"><span>Noch verfügbar</span><strong>${money(available)}</strong></div>
    </div>`;

  if (!unlocked) {
    container.innerHTML = `${warning}${overview}<div class="bond-locked"><strong>🔒 Anleihen werden auf Unternehmenslevel ${GAME_RULES.unlockLevels.bonds} freigeschaltet.</strong></div>`;
    return;
  }

  const myRequests = dashboard.my_requests || [];
  const openRequests = dashboard.open_requests || [];
  const borrowed = dashboard.my_borrowed_positions || [];
  const investments = dashboard.my_investments || [];

  const myRequestRows = myRequests.map(r => `<tr>
    <td>${money(r.requested_amount)}</td>
    <td>${money(r.funded_amount)}</td>
    <td>${money(r.remaining_amount)}</td>
    <td>${num(r.daily_interest_rate)}%</td>
    <td>${bondStatusLabel(r.status)}</td>
    <td>${formatBondDate(r.created_at)}</td>
  </tr>`);

  const marketRows = openRequests.map(r => `<tr>
    <td>${r.borrower_name}${r.borrower_type === 'npc' ? ' (NPC)' : ''}</td>
    <td>${money(r.requested_amount)}</td>
    <td>${money(r.remaining_amount)}</td>
    <td>${num(r.daily_interest_rate)}% / Tag</td>
    <td>
      <div class="bond-inline-action">
        <input type="number" id="bondInvest-${r.id}" min="0.01" step="0.01" max="${Number(r.remaining_amount || 0)}" placeholder="OC$">
        <button type="button" onclick="investBondRequest('${r.id}')">Bereitstellen</button>
      </div>
    </td>
  </tr>`);

  const now = Date.now();
  const borrowedRows = borrowed.map(i => {
    const active = i.status === 'active';
    const matured = active && new Date(i.matures_at).getTime() <= now;
    return `<tr>
      <td>${i.lender_name}${i.lender_type === 'npc' ? ' (NPC)' : ''}</td>
      <td>${money(i.original_principal)}</td>
      <td>${money(i.outstanding_principal)}</td>
      <td>${num(i.daily_interest_rate)}%</td>
      <td>${money(i.total_received)} / ${money(i.target_received)}</td>
      <td>${formatBondDate(i.matures_at)}</td>
      <td>${bondStatusLabel(i.status)}</td>
      <td>
        ${active ? `<div class="bond-inline-action">
          <input type="number" id="bondRepay-${i.id}" min="0.01" step="0.01" max="${Number(i.outstanding_principal || 0)}" placeholder="OC$" ${matured ? '' : 'disabled'}>
          <button type="button" onclick="repayBondInvestment('${i.id}')" ${matured ? '' : 'disabled'}>${matured ? 'Tilgen' : '14 Tage'}</button>
        </div>` : '–'}
      </td>
    </tr>`;
  });

  const investmentRows = investments.map(i => `<tr>
    <td>${i.borrower_name}${i.borrower_type === 'npc' ? ' (NPC)' : ''}</td>
    <td>${money(i.original_principal)}</td>
    <td>${money(i.outstanding_principal)}</td>
    <td>${num(i.daily_interest_rate)}%</td>
    <td class="finance-positive">+${money(i.interest_received)}</td>
    <td>${money(i.total_received)} / ${money(i.target_received)}</td>
    <td>${bondStatusLabel(i.status)}</td>
  </tr>`);

  container.innerHTML = `
    ${warning}
    ${overview}
    <div class="bond-grid">
      <section class="bond-section">
        <h3>Anleihen anfragen</h3>
        <p class="muted">1 Anleihe = 5.000 OC$. Mindestzins 0,50% täglich. Das Kreditlimit entspricht 99% des Gebäudewerts, abgerundet auf 5.000 OC$.</p>
        <form id="bondRequestForm" class="bond-request-form">
          <label>Anzahl Anleihen
            <input type="number" id="bondRequestCount" min="1" step="1" value="1">
          </label>
          <label>Täglicher Zinssatz
            <input type="number" id="bondRequestRate" min="0.50" step="0.01" value="0.50">
          </label>
          <div class="kv bond-request-preview"><span>Anfragevolumen</span><strong id="bondRequestAmountPreview">${money(5000)}</strong></div>
          <button type="submit">Kredit anfragen</button>
        </form>
      </section>

      <section class="bond-section">
        <h3>Meine Kreditanfragen</h3>
        <div class="table-wrap">${renderTable(['Anfrage','Finanziert','Rest','Zins','Status','Erstellt'], myRequestRows)}</div>
      </section>
    </div>

    <section class="bond-section">
      <h3>Offene Anleihen anderer Unternehmen</h3>
      <div class="table-wrap">${renderTable(['Unternehmen','Anfrage','Noch offen','Zins','Investition'], marketRows)}</div>
    </section>

    <section class="bond-section">
      <h3>Meine aufgenommenen Kredite</h3>
      <div class="table-wrap">${renderTable(['Kreditgeber','Ursprünglich','Restschuld','Zins','Erhalten / Ziel','Tilgbar ab','Status','Tilgung'], borrowedRows)}</div>
    </section>

    <section class="bond-section">
      <h3>Meine Anleiheinvestitionen</h3>
      <div class="table-wrap">${renderTable(['Kreditnehmer','Investiert','Restforderung','Zins','Zinserlöse','Erhalten / Ziel','Status'], investmentRows)}</div>
    </section>
  `;

  const requestForm = document.getElementById('bondRequestForm');
  const requestCount = document.getElementById('bondRequestCount');
  requestCount?.addEventListener('input', () => {
    const whole = Math.max(0, Math.floor(Number(requestCount.value || 0)));
    if (requestCount.value !== '' && String(whole) !== requestCount.value) requestCount.value = String(whole);
    updateBondRequestPreview();
  });

  requestForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const count = Math.floor(Number(document.getElementById('bondRequestCount')?.value || 0));
    const rate = Number(document.getElementById('bondRequestRate')?.value || 0);
    if (count < 1 || rate < 0.50) {
      gameAlert('Bitte mindestens 1 Anleihe und mindestens 0,50% Tageszins angeben.');
      return;
    }

    const total = count * 5000;
    if (total > available) {
      gameAlert(`Dein verfügbarer Kreditspielraum beträgt aktuell ${money(available)}.`);
      return;
    }

    if (!await gameConfirm(`${count} Anleihe${count === 1 ? '' : 'n'} über ${money(total)} zu ${num(rate)}% Tageszins anfragen?`)) return;
    const { error } = await sb.rpc('create_bond_request', {
      p_company_id: state.company.id,
      p_bond_count: count,
      p_daily_interest_rate: rate
    });
    if (error) gameAlert(error.message); else await loadCompany();
  });
}

window.investBondRequest = async function(requestId) {
  const input = document.getElementById(`bondInvest-${requestId}`);
  const amount = Number(input?.value || 0);
  if (amount <= 0) {
    gameAlert('Bitte einen Betrag größer als 0 OC$ eingeben.');
    return;
  }
  if (!await gameConfirm(`${money(amount)} für diese Anleihe bereitstellen? Der Betrag wird sofort von deinem Kontostand abgebucht.`)) return;

  const { error } = await sb.rpc('invest_in_bond_request', {
    p_investor_company_id: state.company.id,
    p_request_id: requestId,
    p_amount: amount
  });
  if (error) gameAlert(error.message); else await loadCompany();
};

window.repayBondInvestment = async function(investmentId) {
  const input = document.getElementById(`bondRepay-${investmentId}`);
  const amount = Number(input?.value || 0);
  if (amount <= 0) {
    gameAlert('Bitte einen Tilgungsbetrag größer als 0 OC$ eingeben.');
    return;
  }
  if (!await gameConfirm(`${money(amount)} auf diesen Kreditanteil tilgen?`)) return;

  const { error } = await sb.rpc('repay_bond_investment', {
    p_company_id: state.company.id,
    p_investment_id: investmentId,
    p_amount: amount
  });
  if (error) gameAlert(error.message); else await loadCompany();
};

function researchInventoryContext() {
  const product = state.products.find(p => p.category === 'research' && p.name === 'Forschungseinheit');
  const summary = product ? inventoryLotSummary(productInventoryLots(product.id), 1) : {quantity:0,averageUnitCost:0};
  return { product, quantity:summary.quantity, averageUnitCost:summary.averageUnitCost };
}

function researchInvestmentValue(quantity, researchProduct) {
  if (!researchProduct || quantity <= 0) return 0;
  let remaining = Math.max(0, Number(quantity || 0));
  let value = 0;
  const lots = productInventoryLots(researchProduct.id)
    .filter(row => Number(row.quantity || 0) > 0)
    .sort((a,b) => Number(a.quality_level || 1) - Number(b.quality_level || 1) || String(a.id).localeCompare(String(b.id)));

  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(lot.quantity || 0));
    value += take * Number(lot.average_unit_cost || 0);
    remaining -= take;
  }
  return value;
}

function renderResearch() {
  const ctx = researchInventoryContext();
  const productInput = document.getElementById('researchProduct');
  const searchInput = document.getElementById('researchProductSearch');
  const qtyInput = document.getElementById('researchInvestmentAmount');
  const preview = document.getElementById('researchInvestmentPreview');
  const table = document.getElementById('researchProductTable');
  const submit = document.getElementById('researchInvestmentBtn');
  const maxBtn = document.getElementById('researchInvestmentMaxBtn');
  if (!productInput || !searchInput || !qtyInput || !preview || !submit || !table) return;

  const researchProducts = [...state.products].sort((a,b)=>
    researchCategory(a).localeCompare(researchCategory(b),uiLocale()) ||
    a.name.localeCompare(b.name,uiLocale())
  );

  if (searchInput.value !== state.researchSearchFilter) {
    searchInput.value = state.researchSearchFilter || '';
  }

  let selectedId = state.researchSelectedProductId || productInput.value || '';
  if (!researchProducts.some(product => product.id === selectedId)) selectedId = '';

  // Wie bisher beim ersten Öffnen direkt ein Produkt als Forschungsziel setzen.
  if (!selectedId && researchProducts[0]) {
    selectedId = researchProducts[0].id;
  }

  state.researchSelectedProductId = selectedId || null;
  productInput.value = selectedId;

  const selected = researchProducts.find(product => product.id === selectedId) || null;
  const quality=productQuality(selected);
  const requirement=researchRequirement(quality);
  const progress=Number(selected?.research_units_progress||0);
  const remaining=Math.max(0,requirement-progress);
  const availableWhole=Math.max(0,Math.floor(ctx.quantity));
  const requested=Math.max(0,Math.floor(Number(qtyInput.value||0)));
  const maxInvestment=availableWhole;
  const valid=!!selected && requested>=1 && requested<=maxInvestment;
  const investmentValue=researchInvestmentValue(Math.min(requested,availableWhole),ctx.product);
  const patentMin=investmentValue*0.80;
  const patentMax=investmentValue*1.10;

  document.getElementById('researchUnitsAvailable').textContent=`${num(availableWhole)} Forschungseinheiten`;
  document.getElementById('researchUnitAverageCost').textContent=money(ctx.averageUnitCost);
  preview.innerHTML=selected ? `
    <div class="kv"><span>Produkt</span><strong>${selected.name}</strong></div>
    <div class="kv"><span>Aktuelle Qualität</span><strong>Q${quality}</strong></div>
    <div class="kv"><span>Wertbonus</span><strong>+${Math.round((qualityMultiplier(quality)-1)*100)}%</strong></div>
    <div class="kv"><span>Fortschritt zu Q${quality+1}</span><strong>${num(progress)} / ${num(requirement)}</strong></div>
    <div class="kv"><span>Noch benötigt</span><strong>${num(remaining)} Forschungseinheiten</strong></div>
    <div class="kv"><span>Geplante Investition</span><strong>${num(requested)} Forschungseinheiten</strong></div>
    ${requested > remaining ? `<div class="kv"><span>Übertrag in Q${quality+1}</span><strong>${num(requested-remaining)} Forschungseinheiten</strong></div>` : ''}
    <div class="kv"><span>Patentwertsteigerung</span><strong>${requested > 0 ? `${money(patentMin)} – ${money(patentMax)}` : money(0)}</strong></div>` : '';
  submit.disabled=!valid;
  if (maxBtn) maxBtn.disabled=maxInvestment<=0;

  const query=(state.researchSearchFilter || '').trim().toLocaleLowerCase(uiLocale());
  const visibleProducts=query
    ? researchProducts.filter(product => {
        const haystack=[
          product.name,
          translateUiString(product.name),
          researchCategory(product),
          translateUiString(researchCategory(product)),
          `Q${productQuality(product)}`
        ].join(' ').toLocaleLowerCase(uiLocale());
        return haystack.includes(query);
      })
    : researchProducts;

  table.innerHTML=renderTable(['Kategorie','Produkt',`Qualität <button type="button" class="encyclopedia-help-btn" onclick="openEncyclopediaArticle('quality')" aria-label="Hilfe zur Qualität" title="Enzyklopädie öffnen">?</button>`,'Wertbonus','Fortschritt','Nächste Stufe','Aktion'],visibleProducts.map(p=>{
    const q=productQuality(p), req=researchRequirement(q), prog=Number(p.research_units_progress||0);
    const isSelected=p.id===selectedId;
    return `<tr class="${isSelected ? 'research-product-selected' : ''}" data-research-product-id="${p.id}"><td>${translateUiString(researchCategory(p))}</td><td>${translateUiString(p.name)}</td><td><strong>Q${q}</strong></td><td>+${Math.round((qualityMultiplier(q)-1)*100)}%</td><td>${num(prog)} / ${num(req)}</td><td>Q${q+1}</td><td><button type="button" class="ghost research-select-btn" onclick="selectResearchProduct('${p.id}')">${translateUiString(isSelected ? 'Ausgewählt' : 'Auswählen')}</button></td></tr>`;
  }));
}

window.selectResearchProduct=function(productId){
  const product=state.products.find(p=>p.id===productId);
  if(!product) return;

  state.researchSelectedProductId=productId;

  const productInput=document.getElementById('researchProduct');
  const amountInput=document.getElementById('researchInvestmentAmount');

  if(productInput) productInput.value=productId;
  if(amountInput) amountInput.value='1';

  renderResearch();
};

function buildingValuationLevelMultiplier(level) {
  const lvl = Math.max(1, Number(level || 1));
  if (lvl <= 1) return 1;
  return Math.round((1 + 0.25 * (lvl - 1) * (lvl + 2)) * 10000) / 10000;
}

function buildingValuationUpgradeCost(baseCost, targetLevel) {
  const base = Number(baseCost || 0);
  const level = Math.max(1, Number(targetLevel || 1));
  if (level <= 1) return Math.round(base * 100) / 100;

  const increase = Math.max(
    0,
    buildingValuationLevelMultiplier(level) - buildingValuationLevelMultiplier(level - 1)
  );

  return Math.round((base * increase * 1.75) * 100) / 100;
}

function currentCompanyBuildingValue() {
  return state.buildings
    .reduce((total, building) => {
      const type = state.buildingTypes.find(bt => bt.id === building.building_type_id);
      const baseCost = Number(type?.construction_cost || 0);
      const level = Math.max(1, Number(building.construction_target_level || building.level || 1));

      let value = baseCost;
      for (let lvl = 2; lvl <= level; lvl += 1) {
        value += buildingValuationUpgradeCost(baseCost, lvl);
      }

      return total + value;
    }, 0);
}

function companyRenameAvailability() {
  const changedAt = state.company?.last_name_change_at;
  if (!changedAt) return { allowed: true, availableAt: null };
  const availableAt = new Date(new Date(changedAt).getTime() + 14 * 24 * 60 * 60 * 1000);
  return { allowed: Date.now() >= availableAt.getTime(), availableAt };
}

window.renameCompany = async function() {
  const availability = companyRenameAvailability();
  if (!availability.allowed) {
    await gameAlert(`Der Firmenname kann wieder ab ${availability.availableAt.toLocaleString(uiLocale())} geändert werden.`);
    return;
  }

  const newName = await gamePrompt('Neuen Unternehmensnamen eingeben:', state.company?.name || '', 'Unternehmensnamen ändern');
  if (newName === null) return;
  const trimmedName = String(newName).trim();
  if (!trimmedName || trimmedName === state.company?.name) return;

  const confirmed = await gameConfirm(`Unternehmensnamen wirklich in „${trimmedName}“ ändern? Danach ist eine weitere Änderung 14 Tage lang gesperrt.`);
  if (!confirmed) return;

  const { data, error } = await sb.rpc('rename_company', {
    p_company_id: state.company.id,
    p_new_name: trimmedName
  });

  if (error) {
    await gameAlert(friendlyDatabaseError(error));
    return;
  }

  if (data) state.company = data;
  await loadCompany();
};
window.renameCompanyFromCompanyTab = window.renameCompany;

function currentStorageValue() {
  const materialValue = state.materialInventory.reduce((sum, inv) => {
    const quantity = Number(inv.quantity || 0);
    const averageCost = Number(inv.average_unit_cost || 0);
    const quality = Number(inv.quality_level || 1);
    return sum + quantity * averageCost * qualityMultiplier(quality);
  }, 0);

  const productValue = state.inventory.reduce((sum, inv) => {
    const quantity = Number(inv.quantity || 0);
    const averageCost = Number(inv.average_unit_cost || 0);
    const quality = Number(inv.quality_level || 1);
    return sum + quantity * averageCost * qualityMultiplier(quality);
  }, 0);

  return materialValue + productValue;
}

function renderStorage() {
  const container = document.getElementById('storageInventoryTable');
  if (!container) return;

  const status = state.storageStatus || {};
  const totalQuantity = Number(status.total_quantity ?? (
    state.inventory.reduce((s,row)=>s+Number(row.quantity||0),0)
    + state.materialInventory.reduce((s,row)=>s+Number(row.quantity||0),0)
  ));
  const capacity = Math.max(1, Number(status.capacity || 1000));
  const hardLimit = Number(status.hard_limit || capacity + 1000);
  const usage = Number(status.usage_percent ?? (totalQuantity / capacity * 100));
  const overflow = Math.max(0, Number(status.overflow_quantity || 0));
  const warningCount = Math.max(0, Number(status.warning_count || 0));
  const progress = Math.max(0, Math.min(100, usage));

  const storageTotalValue = document.getElementById('storageTotalValue');
  if (storageTotalValue) storageTotalValue.textContent = money(Number(status.storage_value ?? currentStorageValue()));

  const capacityText = document.getElementById('storageCapacityText');
  if (capacityText) capacityText.textContent = `${num(totalQuantity)} / ${num(capacity)} ${translateUiString('Einheiten')}`;

  const usageText = document.getElementById('storageUsagePercent');
  if (usageText) usageText.textContent = `${num(usage)}%`;

  const overflowText = document.getElementById('storageOverflowValue');
  if (overflowText) {
    overflowText.textContent = `${num(overflow)} ${translateUiString('Einheiten')}`;
    overflowText.classList.toggle('storage-overflow-active', overflow > 0);
  }

  const warningText = document.getElementById('storageWarningCount');
  if (warningText) {
    warningText.textContent = `${warningCount} / 3`;
    warningText.classList.toggle('storage-warning-active', warningCount > 0);
  }

  const hardLimitText = document.getElementById('storageHardLimit');
  if (hardLimitText) hardLimitText.textContent = `${num(hardLimit)} ${translateUiString('Einheiten')}`;

  const dailyFee = document.getElementById('storageDailyFee');
  if (dailyFee) {
    const value = Number(status.estimated_storage_fee || 0);
    dailyFee.textContent = value > 0 ? `-${money(value)}` : money(0);
    dailyFee.classList.toggle('storage-cost-active', value > 0);
  }

  const overflowFee = document.getElementById('storageOverflowFee');
  if (overflowFee) {
    const value = Number(status.estimated_overflow_fee || 0);
    overflowFee.textContent = value > 0 ? `-${money(value)}` : money(0);
    overflowFee.classList.toggle('storage-cost-active', value > 0);
  }

  const bar = document.getElementById('storageCapacityBar');
  if (bar) {
    bar.style.width = `${progress}%`;
    bar.classList.remove(
      'storage-capacity-green',
      'storage-capacity-green-yellow',
      'storage-capacity-yellow',
      'storage-capacity-yellow-red',
      'storage-capacity-red'
    );

    const capacityColorClass =
      usage >= 90 ? 'storage-capacity-red'
      : usage > 80 ? 'storage-capacity-yellow-red'
      : usage >= 70 ? 'storage-capacity-yellow'
      : usage > 55 ? 'storage-capacity-green-yellow'
      : 'storage-capacity-green';

    bar.classList.add(capacityColorClass);
  }

  const warnings = [];
  if (overflow > 1000) {
    warnings.push(`⚠ Der bestehende Lagerbestand liegt ${num(overflow - 1000)} Einheiten über der neu zulässigen Überlagerung. Neue Einlagerungen sind gesperrt, bis du Bestand reduzierst oder die Lagerkapazität erhöhst.`);
  }

  if (status.last_forced_auction_at) {
    const when = new Date(status.last_forced_auction_at).toLocaleString(uiLocale());
    if (status.last_forced_auction_full) {
      warnings.push(`⚠ ZWANGSVERSTEIGERUNG: Das gesamte Lager wurde am ${when} versteigert. Nettoerlös: ${money(status.last_forced_auction_net || 0)}.`);
    } else {
      warnings.push(`⚠ ZWANGSVERSTEIGERUNG: 1.000 Einheiten wurden am ${when} versteigert. Aktueller Warnstand: ${warningCount} / 3. Nettoerlös: ${money(status.last_forced_auction_net || 0)}.`);
    }
  } else if (warningCount > 0) {
    warnings.push(`⚠ Lagerwarnungen: ${warningCount} / 3. Bei der dritten Warnung wird das gesamte Lager zwangsversteigert.`);
  }

  const warningBanner = document.getElementById('storageWarningBanner');
  if (warningBanner) {
    warningBanner.innerHTML = warnings.map(w => `<div>${w}</div>`).join('');
    warningBanner.classList.toggle('hidden', warnings.length === 0);
  }

  const search = String(state.storageSearchFilter || '').trim().toLocaleLowerCase(uiLocale());
  const type = state.storageTypeFilter || 'all';

  const materialRows = state.materialInventory
    .filter(inv => Number(inv.quantity || 0) > 0)
    .map(inv => {
      const material = state.materials.find(m => m.id === inv.material_id);
      return { type:'material', name:material?.name || '–', quality:Number(inv.quality_level||1), quantity:Number(inv.quantity||0), unit:material?.unit || '–', averageCost:Number(inv.average_unit_cost||0) };
    });
  const productRows = state.inventory
    .filter(inv => Number(inv.quantity || 0) > 0)
    .map(inv => ({ type:'product', name:inv.products?.name || state.products.find(p=>p.id===inv.product_id)?.name || '–', quality:Number(inv.quality_level||1), quantity:Number(inv.quantity||0), unit:'Stück', averageCost:Number(inv.average_unit_cost||0) }));

  const rows=[...materialRows,...productRows]
    .filter(row => (type==='all'||row.type===type) && (!search||row.name.toLocaleLowerCase(uiLocale()).includes(search)))
    .sort((a,b)=>a.name.localeCompare(b.name,uiLocale())||a.quality-b.quality||a.type.localeCompare(b.type,uiLocale()));

  container.innerHTML=renderTable(
    ['Artikel','Typ','Qualität','Menge','Einheit','Ø Kosten'],
    rows.map(row=>`<tr><td>${translateUiString(row.name)}</td><td>${translateUiString(row.type==='material'?'Rohstoff':'Produkt')}</td><td>Q${row.quality}</td><td>${num(row.quantity)}</td><td>${translateUiString(row.unit)}</td><td>${money(row.averageCost)}</td></tr>`)
  );
}

function productOptionsGroupedByBuilding(products) {
  const groups = new Map();

  (products || []).forEach(product => {
    const building = state.buildingTypes.find(
      bt => bt.id === product.required_building_type_id
    );
    const label = building?.name || 'Sonstige';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(product);
  });

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, uiLocale()))
    .map(([label, items]) => {
      const options = items
        .sort((a, b) => a.name.localeCompare(b.name, uiLocale()))
        .map(product => `<option value="${product.id}">${product.name} (Q${productQuality(product)})</option>`)
        .join('');
      return `<optgroup label="${label}">${options}</optgroup>`;
    })
    .join('');
}

function updateProductionProductsForSelectedBuilding() {
  const select = document.getElementById('productionProduct');
  if (!select) return;

  const building = state.buildings.find(b => b.id === state.selectedBuildingId) || null;
  const type = building ? state.buildingTypes.find(bt => bt.id === building.building_type_id) : null;
  const runningJob = building
    ? state.productionJobs.find(j => j.building_id === building.id && j.status === 'running') || null
    : null;

  let products = [];
  if (building && building.status === 'active' && ['production','research'].includes(type?.building_category)) {
    if (runningJob) {
      const p = state.products.find(product => product.id === runningJob.product_id);
      if (p) products = [p];
    } else {
      products = operationalProducts().filter(
        product => product.required_building_type_id === building.building_type_id
      );
    }
  }

  const previous = select.value;
  select.innerHTML = products.length
    ? products.sort((a,b)=>a.name.localeCompare(b.name,uiLocale()))
      .map(product => `<option value="${product.id}">${product.name} (Q${productQuality(product)})</option>`).join('')
    : '<option value="">Kein Produkt verfügbar</option>';

  if (runningJob) select.value = runningJob.product_id;
  else if (products.some(product => product.id === previous)) select.value = previous;
}

function renderSettingsCompanyManagement() {
  const nameEl = document.getElementById('settingsCompanyName');
  const companyIdEl = document.getElementById('settingsCompanyPublicId');
  const hintEl = document.getElementById('settingsCompanyRenameHint');
  const renameBtn = document.getElementById('renameCompanyBtn');

  if (!nameEl || !hintEl || !renameBtn) return;

  nameEl.textContent = state.company?.name || '–';
  if (companyIdEl) companyIdEl.textContent = state.company?.company_code || '–';

  const availability = companyRenameAvailability();
  renameBtn.disabled = !availability.allowed;

  if (availability.allowed) {
    hintEl.textContent = 'Der Unternehmensname kann geändert werden. Danach gilt erneut eine Sperre von 14 Tagen.';
    renameBtn.title = 'Unternehmensnamen ändern';
  } else {
    hintEl.textContent = `Nächste Namensänderung möglich ab ${availability.availableAt.toLocaleString(uiLocale())}.`;
    renameBtn.title = hintEl.textContent;
  }
}



function encyclopediaSection(title, content) {
  if (!content) return '';
  return `<section class="encyclopedia-section">
    <h3>${translateUiString(title)}</h3>
    ${content}
  </section>`;
}

function encyclopediaExample(content) {
  return encyclopediaSection('Beispiel', `<div class="encyclopedia-example">${content}</div>`);
}

function encyclopediaImportant(content) {
  return encyclopediaSection('Wichtig', `<div class="encyclopedia-important">${content}</div>`);
}

function encyclopediaArticleBody({ short, how, example, important }) {
  return [
    encyclopediaSection('Kurz erklärt', `<p>${short}</p>`),
    encyclopediaSection('So funktioniert es', how),
    example ? encyclopediaExample(example) : '',
    important ? encyclopediaImportant(important) : ''
  ].join('');
}

const ENCYCLOPEDIA_ARTICLES = [
  {
    id:'getting-started', category:'Grundlagen', title:'Erste Schritte',
    keywords:['start','anfang','unternehmen','dashboard'],
    summary:'Die wichtigsten ersten Schritte nach der Unternehmensgründung.',
    body:`<p>Nach der Gründung beginnt dein Unternehmen mit Startkapital, einer Grundausstattung an Gebäuden und Zugriff auf die ersten Spielbereiche.</p>
      <h3>Was zuerst wichtig ist</h3>
      <ul><li>Prüfe deinen Kontostand und deine verfügbaren Gebäude.</li><li>Beschaffe Rohstoffe oder Vorprodukte.</li><li>Starte eine Produktion und beobachte Lager sowie Finanzbewegungen.</li><li>Mit höheren Unternehmensleveln werden zusätzliche Funktionen freigeschaltet.</li></ul>`,
    related:['company-level','buildings','production','finance'], targetView:'dashboard'
  },
  {
    id:'company-level', category:'Grundlagen', title:'Unternehmenslevel & XP',
    keywords:['level','xp','erfahrung','freischaltung'],
    summary:'Level bestimmen unter anderem Gebäudeplätze und Funktionsfreischaltungen.',
    body:() => `<p>Unternehmens-XP erhöhen dein Level. Bestimmte Funktionen werden erst ab einem festgelegten Level freigeschaltet.</p>
      <h3>Beispiele</h3><ul><li>Verträge werden ab Level ${GAME_RULES.unlockLevels.contracts} freigeschaltet.</li><li>Forschung wird ab Level ${GAME_RULES.unlockLevels.research} freigeschaltet.</li><li>Anleihen werden ab Level ${GAME_RULES.unlockLevels.bonds} freigeschaltet.</li><li>Mit höheren Leveln stehen zusätzliche Gebäudeplätze zur Verfügung.</li></ul>`,
    related:['buildings','contracts','research','bonds'], targetView:'dashboard'
  },
  {
    id:'company-value', category:'Grundlagen', title:'Unternehmenswert',
    keywords:['wert','bewertung','ranking','unternehmenswert'],
    summary:'Der Unternehmenswert bündelt mehrere Vermögensbestandteile des Unternehmens.',
    body:() => `<p>Der Unternehmenswert entspricht dem bei der täglichen Bewertung gespeicherten Nettovermögen des Unternehmens.</p>
      <p>Berechnet werden <strong>Kontostand + Lagerwert + Gebäudewert + Patentwert + Anleiheforderungen − Schulden</strong>. Ein zusätzlicher Performance-Aufschlag auf das Tagesergebnis wird nicht verwendet.</p>
      <p>Die tägliche Berechnung ist für <strong>${ruleTime('companyValuation')} Uhr deutscher Zeit</strong> vorgesehen. Spätere Buchungen am selben Tag verändern diesen gespeicherten Tageswert nicht rückwirkend.</p>`,
    related:['ranking','finance','storage-value','patent-value'], targetView:'dashboard'
  },
  {
    id:'ranking', category:'Grundlagen', title:'Rangliste',
    keywords:['ranking','rang','platzierung'],
    summary:'Die Rangliste vergleicht aktive Spielerunternehmen anhand des gespeicherten Unternehmenswerts.',
    body:() => `<p>Die Rangliste wird täglich um <strong>${ruleTime('companyRanking')} Uhr deutscher Zeit</strong> aus den Unternehmenswerten erstellt. Angezeigt werden Rang und Rangveränderung gegenüber der vorherigen Wertung.</p>`,
    related:['company-value','company-level'], targetView:'dashboard'
  },
  {
    id:'buildings', category:'Gebäude', title:'Gebäude',
    keywords:['gebäude','fabrik','geschäft','bau'],
    summary:'Gebäude ermöglichen Produktion, Handel und weitere Unternehmensfunktionen.',
    body:`<p>Gebäude belegen Gebäudeplätze. Produktionsgebäude stellen Produkte her, Verkaufsgebäude ermöglichen den Einzelhandel und Spezialgebäude erweitern bestimmte Systeme.</p>
      <p>Gebäude können je nach Typ und Spielfortschritt gebaut und ausgebaut werden.</p>`,
    related:['building-levels','production','retail','warehouse'], targetView:'production'
  },
  {
    id:'building-levels', category:'Gebäude', title:'Gebäudelevel',
    keywords:['ausbau','level','gebäudelevel'],
    summary:'Gebäudelevel beeinflussen Leistungswerte des jeweiligen Gebäudes.',
    body:`<p>Ein Ausbau erhöht das Gebäudelevel. Je nach Gebäudetyp wirkt sich das unter anderem auf Kapazität oder Produktionsleistung aus.</p>
      <p>Während eines laufenden Baus oder Ausbaus kann das Gebäude vorübergehend nicht vollständig verfügbar sein.</p>`,
    related:['buildings','production','warehouse'], targetView:'production'
  },
  {
    id:'production', category:'Produktion', title:'Produktion',
    keywords:['produktion','herstellen','fertigung','job'],
    summary:'Produktion verbraucht Eingaben und erzeugt nach Ablauf der Produktionszeit Produkte.',
    body:`<p>Für die Produktion benötigst du ein passendes aktives Produktionsgebäude und die im Rezept verlangten Materialien oder Vorprodukte.</p>
      <p>Beim Start werden die notwendigen Eingaben aus dem Lager entnommen. Nach Ablauf der Produktionszeit wird die fertige Menge dem Produktlager gutgeschrieben.</p>`,
    related:['recipes','production-cost','quality','storage'], targetView:'production'
  },
  {
    id:'recipes', category:'Produktion', title:'Produktionsrezepte',
    keywords:['rezept','rohstoff','vorprodukt','komponente'],
    summary:'Rezepte legen fest, welche Materialien und Vorprodukte ein Produkt benötigt.',
    body:`<p>Ein Produktionsrezept kann Rohstoffe und bereits hergestellte Vorprodukte enthalten. Die benötigte Menge skaliert mit der geplanten Produktionsmenge.</p>
      <p>Fehlt eine erforderliche Eingabe in ausreichender Menge oder Qualität, kann die Produktion nicht gestartet werden.</p>`,
    related:['production','quality','materials'], targetView:'production'
  },
  {
    id:'production-cost', category:'Produktion', title:'Produktionskosten',
    keywords:['kosten','einstandskosten','herstellkosten','durchschnitt'],
    summary:'Produktionskosten setzen sich aus Eingaben und weiteren produktionsbezogenen Kosten zusammen.',
    body:`<p>Beim Produktionsstart werden die tatsächlich verbrauchten Lagerbestände mit ihren Einstandskosten berücksichtigt. Daraus entsteht der Einstandswert der fertigen Ware.</p>
      <p>Dieser Wert wird später unter anderem für Preisempfehlungen und betriebswirtschaftliche Auswertungen verwendet.</p>`,
    related:['production','average-cost','market-pricing'], targetView:'production'
  },
  {
    id:'quality', category:'Produktion', title:'Qualitätsstufen',
    keywords:['qualität','q1','q2','q3','q4'],
    summary:'Produkte und Bestände besitzen Qualitätsstufen mit Auswirkungen auf Wert und Verwendung.',
    body:() => encyclopediaArticleBody({
      short:`Höhere Qualitätsstufen erhöhen den Wertbonus eines Produkts.`,
      how:`<p>Jede Stufe oberhalb von Q1 erhöht den Wertbonus um <strong>${rulePercent(GAME_RULES.quality.valueBonusPerLevel)} Prozentpunkte</strong>.</p>`,
      example:`<p>Q2 besitzt +${rulePercent(GAME_RULES.quality.valueBonusPerLevel)} %, Q3 +${rulePercent(GAME_RULES.quality.valueBonusPerLevel * 2)} % und Q4 +${rulePercent(GAME_RULES.quality.valueBonusPerLevel * 3)} % Wertbonus.</p>`,
      important:`<p>Bei Produktionsrezepten kann zusätzlich eine Mindestqualität für Rohstoffe oder Vorprodukte gelten.</p>`
    }),
    related:['research','recipes','market'], targetView:'research'
  },
  {
    id:'storage', category:'Lager', title:'Lager',
    keywords:['lager','bestand','kapazität','speicher'],
    summary:'Im Lager befinden sich Rohstoffe, Vorprodukte und fertige Produkte.',
    body:`<p>Das Lager ist die zentrale Bestandsübersicht des Unternehmens. Produktions- und Marktaktionen verändern diese Bestände unmittelbar.</p>
      <p>Die verfügbare Kapazität hängt von deiner Lagerausstattung ab.</p>`,
    related:['warehouse','storage-costs','overflow','storage-value'], targetView:'storage'
  },
  {
    id:'warehouse', category:'Lager', title:'Lagergebäude',
    keywords:['lagergebäude','warehouse','kapazität'],
    summary:'Ein Lagergebäude erhöht die verfügbare Lagerkapazität.',
    body:`<p>Das Lagergebäude erweitert die Kapazität des Unternehmens. Höhere Ausbaustufen stellen mehr Lagerplatz zur Verfügung.</p>
      <p>Das Gebäude belegt einen Gebäudeplatz und besitzt einen eigenen Gebäudewert.</p>`,
    related:['storage','storage-costs','buildings'], targetView:'storage'
  },
  {
    id:'storage-costs', category:'Lager', title:'Lagerhaltungskosten',
    keywords:['lagerkosten','haltungskosten','02:00','gebühr'],
    summary:'Lagerhaltungskosten werden täglich automatisch berechnet.',
    body:() => encyclopediaArticleBody({
      short:`Mit einem Lagergebäude fallen täglich Lagerhaltungskosten an.`,
      how:`<p>Die reguläre Lagerabrechnung startet täglich um <strong>${ruleTime('storageDaily')} Uhr deutscher Zeit</strong>.</p>
        <p>Mit Lagergebäude werden <strong>${rulePercent(GAME_RULES.fees.storageDailyRate)} % des Lagerwerts pro Tag</strong> berechnet. Die Abrechnung erfolgt pro Unternehmen höchstens einmal je Kalendertag.</p>`,
      example:`<p>Bei einem Lagerwert von ${money(20000)} entstehen ${money(20000 * GAME_RULES.fees.storageDailyRate)} Lagerhaltungskosten pro Tag.</p>`,
      important:`<p>Ohne Lagergebäude fällt diese reguläre Lagerhaltungsgebühr nicht an. Überbestand kann unabhängig davon zusätzliche Kosten verursachen.</p>`
    }),
    related:['storage','storage-value','overflow'], targetView:'storage'
  },
  {
    id:'overflow', category:'Lager', title:'Überbestand',
    keywords:['überbestand','überlager','kapazität','gebühr'],
    summary:'Bestände oberhalb der Lagerkapazität können zusätzliche Kosten und Folgen auslösen.',
    body:() => encyclopediaArticleBody({
      short:`Bestände oberhalb deiner Lagerkapazität gelten als Überbestand.`,
      how:`<p>Für den abrechenbaren Überbestand wird zusätzlich eine Gebühr von <strong>${rulePercent(GAME_RULES.fees.storageOverflowRate)} % seines Wertes</strong> berechnet.</p>`,
      example:`<p>Hat der abrechenbare Überbestand einen Wert von ${money(5000)}, beträgt die zusätzliche Überbestandsgebühr ${money(5000 * GAME_RULES.fees.storageOverflowRate)}.</p>`,
      important:`<p>Die Gebühr bezieht sich auf den Wert des abrechenbaren Überbestands, nicht pauschal auf den gesamten Lagerwert.</p>`
    }),
    related:['storage','storage-costs','warehouse'], targetView:'storage'
  },
  {
    id:'storage-value', category:'Lager', title:'Lagerwert',
    keywords:['lagerwert','inventarwert','bestandwert'],
    summary:'Der Lagerwert ergibt sich aus Menge und Einstandswert der Bestände.',
    body:`<p>Der Lagerwert berücksichtigt die im Lager vorhandenen Materialien und Produkte mit ihren jeweiligen Einstandswerten.</p>
      <p>Er ist für Auswertungen und unter anderem für Lagerhaltungskosten relevant.</p>`,
    related:['average-cost','storage-costs','company-value'], targetView:'storage'
  },
  {
    id:'average-cost', category:'Lager', title:'Ø Einstandskosten',
    keywords:['einstandskosten','durchschnitt','average unit cost'],
    summary:'Der durchschnittliche Einstandswert beschreibt die durchschnittlichen Kosten je Lagereinheit.',
    body:`<p>Werden Bestände zu unterschiedlichen Kosten eingelagert, wird der durchschnittliche Einstandswert mengenbezogen fortgeschrieben.</p>
      <p>Dadurch bleibt nachvollziehbar, welchen durchschnittlichen Kostenwert eine Lagereinheit aktuell besitzt.</p>`,
    related:['production-cost','storage-value','market-pricing'], targetView:'storage'
  },
  {
    id:'materials', category:'Lager', title:'Rohstoffe',
    keywords:['rohstoff','material','silizium','kupfer'],
    summary:'Rohstoffe sind grundlegende Eingaben für Produktionsrezepte und können gehandelt werden.',
    body:`<p>Rohstoffe werden im Materiallager geführt. Sie können über die Warenbörse beschafft oder verkauft und anschließend in Produktionsrezepten verbraucht werden.</p>`,
    related:['recipes','market','storage'], targetView:'storage'
  },
  {
    id:'market', category:'Warenbörse', title:'Warenbörse',
    keywords:['markt','warenbörse','order','kaufen','verkaufen'],
    summary:'Über die Warenbörse handeln Spieler und NPC-Unternehmen Produkte und Rohstoffe.',
    body:`<p>Auf der Warenbörse können Verkaufsorders eingestellt und verfügbare Angebote gekauft werden. Offene und teilweise ausgeführte Orders bleiben sichtbar, bis sie erfüllt oder storniert werden.</p>
      <p>NPC-Unternehmen sorgen zusätzlich für Marktaktivität und Angebot.</p>`,
    related:['market-orders','market-fee','market-pricing','npc-market'], targetView:'market'
  },
  {
    id:'market-orders', category:'Warenbörse', title:'Marktorders',
    keywords:['order','verkaufsorder','stornieren','restmenge'],
    summary:'Eine Marktorder enthält Ware, Qualität, Menge und Preis je Einheit.',
    body:`<p>Eine Verkaufsorder reserviert die angebotene Ware für den Markt. Wird nur ein Teil gekauft, reduziert sich die Restmenge entsprechend.</p>
      <p>Eigene offene Orders können storniert werden; abgeschlossene und stornierte Orders bleiben in der Order-Historie sichtbar.</p>`,
    related:['market','market-fee','order-history'], targetView:'market'
  },
  {
    id:'market-fee', category:'Warenbörse', title:'Marktgebühr',
    keywords:['marktgebühr','5%','gebühr'],
    summary:'Erfolgreiche Verkäufe über die Warenbörse unterliegen einer Marktgebühr.',
    body:() => encyclopediaArticleBody({
      short:`Erfolgreiche Warenbörsenverkäufe unterliegen einer Marktgebühr.`,
      how:`<p>Vom Bruttoverkaufserlös werden <strong>${rulePercent(GAME_RULES.fees.marketRate)} % Marktgebühr</strong> abgezogen. Der verbleibende Betrag ist dein Nettoerlös.</p>`,
      example:`<p>Bei ${money(10000)} Bruttoerlös beträgt die Marktgebühr ${money(10000 * GAME_RULES.fees.marketRate)}. Netto bleiben ${money(10000 * (1 - GAME_RULES.fees.marketRate))}.</p>`,
      important:`<p>Die Gebühr wird erst bei einem erfolgreichen Verkauf fällig und als eigene Finanzbewegung dokumentiert.</p>`
    }),
    related:['market','finance','market-pricing'], targetView:'market'
  },
  {
    id:'market-pricing', category:'Warenbörse', title:'Preisfindung & Richtpreise',
    keywords:['preis','richtpreis','empfehlung','aufschlag'],
    summary:'Preisempfehlungen orientieren sich an tatsächlichen Einstandskosten.',
    body:() => encyclopediaArticleBody({
      short:`Der vorgeschlagene Verkaufspreis orientiert sich an den tatsächlichen Einstandskosten.`,
      how:`<p>Für Spielerprodukte wird in den vorgesehenen Eingabefeldern aktuell ein Richtwert von <strong>Einstandskosten × ${GAME_RULES.pricing.playerRecommendedCostMultiplier}</strong> verwendet.</p>`,
      example:`<p>Liegt der durchschnittliche Einstandswert bei ${money(250)}, ergibt sich ein Richtwert von ${money(250 * GAME_RULES.pricing.playerRecommendedCostMultiplier)} je Einheit.</p>`,
      important:`<p>Der Richtpreis ist nur eine Orientierung. Den tatsächlichen Verkaufspreis bestimmst du selbst.</p>`
    }),
    related:['average-cost','market','production-cost'], targetView:'market'
  },
  {
    id:'npc-market', category:'Warenbörse', title:'NPC-Markt',
    keywords:['npc','marktaktualisierung','angebot'],
    summary:'NPC-Unternehmen erzeugen Angebot und können passende Spielerorders kaufen.',
    body:() => `<p>Der NPC-Markt wird regelmäßig automatisch aktualisiert. Dabei können neue NPC-Angebote entstehen und geeignete Verkaufsorders von Spielern ausgeführt werden.</p>
      <p>Die NPC-Marktversorgung läuft derzeit in einem ${GAME_RULES.schedules.npcMarketIntervalMinutes}-Minuten-Rhythmus.</p>`,
    related:['market','market-orders','market-pricing'], targetView:'market'
  },
  {
    id:'order-history', category:'Warenbörse', title:'Order-Historie',
    keywords:['historie','abgeschlossen','storniert'],
    summary:'Abgeschlossene und stornierte Marktorders bleiben nachvollziehbar.',
    body:`<p>Die Order-Historie bewahrt bereits beendete Orders auf. Sie kann nach abgeschlossenen und stornierten Orders gefiltert werden.</p>`,
    related:['market-orders','finance'], targetView:'market'
  },
  {
    id:'research', category:'Forschung', title:'Produktforschung',
    keywords:['forschung','forschungseinheit','qualität','investieren'],
    summary:'Forschungseinheiten erhöhen den Forschungsfortschritt eines ausgewählten Produkts.',
    body:() => encyclopediaArticleBody({
      short:`Mit Forschungseinheiten steigerst du gezielt die Qualität eines Produkts.`,
      how:`<p>Du wählst im Forschungs-Tab ein Produkt aus und investierst Forschungseinheiten aus deinem Lager. Erreicht der Forschungsfortschritt die erforderliche Menge, steigt die Qualitätsstufe.</p>`,
      example:`<p>Ein ausgewähltes Produkt mit Q1 benötigt ${num(researchRequirement(1))} Forschungseinheiten bis Q2. Die Produkttabelle zeigt Fortschritt und verbleibenden Bedarf.</p>`,
      important:`<p>Forschung wird ab Unternehmenslevel ${GAME_RULES.unlockLevels.research} freigeschaltet.</p>`
    }),
    related:['research-units','quality','patent-value'], targetView:'research'
  },
  {
    id:'research-units', category:'Forschung', title:'Forschungseinheiten',
    keywords:['forschungseinheit','einheit','lager','investition'],
    summary:'Forschungseinheiten sind der Verbrauchsbestand für Produktforschung.',
    body:`<p>Forschungseinheiten werden als eigener Produktbestand im Lager geführt. Bei einer Forschungsinvestition werden die gewählten Einheiten verbraucht.</p>
      <p>Der Forschungsbereich zeigt verfügbare Menge und durchschnittlichen Einstandswert.</p>`,
    related:['research','patent-value'], targetView:'research'
  },
  {
    id:'patent-value', category:'Forschung', title:'Patentwert',
    keywords:['patent','patentwert','forschung'],
    summary:'Forschungsinvestitionen können den Patentwert des Unternehmens erhöhen.',
    body:`<p>Bei Investitionen in Produktforschung wird auf Basis des Wertes der eingesetzten Forschungseinheiten eine Patentwertsteigerung berechnet.</p>
      <p>Der Patentwert fließt als eigener Unternehmenswertbestandteil in die wirtschaftliche Darstellung ein.</p>`,
    related:['research','research-units','company-value'], targetView:'research'
  },
  {
    id:'contracts', category:'Verträge', title:'Direktverträge',
    keywords:['vertrag','direktvertrag','partner'],
    summary:'Verträge ermöglichen direkte, gebührenfreie Geschäfte zwischen Spielerunternehmen.',
    body:() => encyclopediaArticleBody({
      short:`Direktverträge ermöglichen gebührenfreie Geschäfte zwischen Spielerunternehmen.`,
      how:`<p>Der Verkäufer wählt Partner, Ware, Qualität, Menge und Preis. Der Empfänger kann den Vertrag annehmen oder ablehnen.</p>`,
      example:`<p>Verkaufst du 100 Einheiten zu ${money(50)} je Einheit, beträgt der Vertragswert ${money(5000)}. Für Direktverträge fällt keine Warenbörsen-Marktgebühr an.</p>`,
      important:`<p>Verträge stehen ab Unternehmenslevel ${GAME_RULES.unlockLevels.contracts} zur Verfügung.</p>`
    }),
    related:['contract-flow','company-level','finance'], targetView:'contracts'
  },
  {
    id:'contract-flow', category:'Verträge', title:'Vertragsablauf',
    keywords:['annehmen','ablehnen','stornieren','erfüllen'],
    summary:'Verträge durchlaufen Vorschlag, Annahme oder Ablehnung/Stornierung.',
    body:`<p>Ausgehende vorgeschlagene Verträge können vom Verkäufer storniert werden. Eingehende Verträge können vom Käufer angenommen oder abgelehnt werden.</p>
      <p>Bei erfolgreicher Annahme werden Ware und Zahlung atomar übertragen. Schlägt die Erfüllung fehl, soll der Vertrag nicht teilweise ausgeführt werden.</p>`,
    related:['contracts','finance'], targetView:'contracts'
  },
  {
    id:'fees', category:'Finanzen', title:'Gebühren',
    keywords:['gebühr','gebühren','marktgebühr','abbruchgebühr','lagerkosten'],
    summary:'Die wichtigsten prozentualen Gebühren werden zentral aus den Spielregeln angezeigt.',
    body:() => encyclopediaArticleBody({
      short:`Die wichtigsten Gebühren von OpenCompany werden zentral aus den Spielregeln übernommen.`,
      how:`<ul>
        <li>Warenbörse: <strong>${rulePercent(GAME_RULES.fees.marketRate)} %</strong> Marktgebühr bei erfolgreichem Verkauf.</li>
        <li>Einzelhandelsabbruch: <strong>${rulePercent(GAME_RULES.fees.retailCancellationRate)} %</strong> des erwarteten Erlöses.</li>
        <li>Lagerhaltung: <strong>${rulePercent(GAME_RULES.fees.storageDailyRate)} %</strong> des Lagerwerts pro Tag bei Lagergebäude.</li>
        <li>Überbestand: <strong>${rulePercent(GAME_RULES.fees.storageOverflowRate)} %</strong> des abrechenbaren Überbestandswerts.</li>
      </ul>`,
      example:`<p>Bei ${money(10000)} Marktverkauf entstehen ${money(10000 * GAME_RULES.fees.marketRate)} Marktgebühr. Bei ${money(10000)} Lagerwert entstehen mit Lagergebäude ${money(10000 * GAME_RULES.fees.storageDailyRate)} tägliche Lagerkosten.</p>`,
      important:`<p>Wenn sich zentrale Regelwerte ändern, aktualisieren sich diese Angaben automatisch.</p>`
    }),
    related:['market-fee','storage-costs','overflow','finance'], targetView:'finance'
  },
  {
    id:'finance', category:'Finanzen', title:'Finanzen',
    keywords:['finanzen','einnahmen','kosten','gewinn'],
    summary:'Der Finanzbereich bündelt Einnahmen, Kosten und einzelne Finanzbewegungen.',
    body:`<p>Die Finanzübersicht kann nach Tag, Woche und Monat betrachtet werden. Einzelne Finanzbewegungen lassen sich aufklappen, um zusätzliche Details zu sehen.</p>
      <p>Einnahmen und Kosten werden aus den gespeicherten Finanztransaktionen des Unternehmens abgeleitet.</p>`,
    related:['financial-transactions','fees','market-fee','bonds','storage-costs'], targetView:'finance'
  },
  {
    id:'financial-transactions', category:'Finanzen', title:'Finanzbewegungen',
    keywords:['transaktion','buchung','finanzbewegung'],
    summary:'Geldbewegungen werden als Finanztransaktionen mit Typ, Betrag und Referenz protokolliert.',
    body:`<p>Finanzbewegungen dokumentieren beispielsweise Produktion, Marktgeschäfte, Verträge, Lagerkosten und Anleihezahlungen.</p>
      <p>Negative Beträge sind Kosten oder Abflüsse; positive Beträge stellen Zuflüsse dar.</p>`,
    related:['finance','market-fee','contracts','bonds'], targetView:'finance'
  },
  {
    id:'bonds', category:'Finanzen', title:'Anleihen & Kredite',
    keywords:['anleihe','kredit','zins','finanzierung'],
    summary:'Anleihen ermöglichen Fremdfinanzierung zwischen Unternehmen und NPCs.',
    body:() => encyclopediaArticleBody({
      short:`Anleihen ermöglichen Fremdfinanzierung und Investments.`,
      how:`<p>Unternehmen können Finanzierungsanfragen stellen oder Kapital in passende Anleihen investieren. Aktive Positionen erzeugen tägliche Zinsverpflichtungen.</p>`,
      example:`<p>Die Zinsverarbeitung ist täglich für ${ruleTime('bondInterest')} Uhr deutscher Zeit vorgesehen.</p>`,
      important:`<p>Das Anleihensystem wird ab Unternehmenslevel ${GAME_RULES.unlockLevels.bonds} freigeschaltet.</p>`
    }),
    related:['bond-interest','bond-default','company-level'], targetView:'finance'
  },
  {
    id:'bond-interest', category:'Finanzen', title:'Anleihezinsen',
    keywords:['zins','tageszins','03:00'],
    summary:'Zinsen aktiver Anleihen werden täglich automatisch verarbeitet.',
    body:() => `<p>Die tägliche Zinsverarbeitung ist für <strong>${ruleTime('bondInterest')} Uhr deutscher Zeit</strong> vorgesehen. Bei ausreichendem Guthaben wird der fällige Betrag beim Kreditnehmer abgezogen und dem Kreditgeber gutgeschrieben.</p>`,
    related:['bonds','bond-default','financial-transactions'], targetView:'finance'
  },
  {
    id:'bond-default', category:'Finanzen', title:'Zinsausfall',
    keywords:['ausfall','zinsausfall','default','zurücksetzen'],
    summary:'Nicht bezahlte Zinsen werden als Ausfalltage erfasst.',
    body:`<p>Kann ein Unternehmen die fälligen Anleihezinsen nicht bedienen, wird ein Zinsausfall erfasst. Wiederholte Ausfälle können weitere Konsequenzen bis hin zu einem Unternehmensreset auslösen.</p>`,
    related:['bond-interest','bonds'], targetView:'finance'
  },
  {
    id:'ocb', category:'Grundlagen', title:'OC-Boost (OCB)',
    keywords:['ocb','oc-boost','boost','beschleunigen','bauzeit','shop'],
    summary:'OCB sind eine optionale Beschleunigungsressource ausschließlich für Bau und Ausbau.',
    body:() => encyclopediaArticleBody({
      short:`1 OCB verkürzt eine laufende Bau- oder Ausbauzeit um genau ${GAME_RULES.ocb.minutesPerBoost} Minute.`,
      how:`<p>OCB können ausschließlich für Gebäude verwendet werden. Produktion, Forschung, Warenbörse, Handelsverkäufe und Anleihen lassen sich damit nicht beschleunigen.</p>
        <p>Täglich kannst du ${GAME_RULES.ocb.dailyMaximum} OCB kostenlos verdienen: ${GAME_RULES.ocb.dailyLogin} für die Anmeldung, ${GAME_RULES.ocb.dailyProduction} für die erste abgeschlossene Produktion und ${GAME_RULES.ocb.dailyRetail} für den ersten abgeschlossenen Handelsverkauf.</p>`,
      example:`<p>Bei 3 Stunden Restbauzeit kostet eine sofortige Fertigstellung 180 OCB. Wartest du eine Stunde, sinkt der MAX-Preis automatisch auf 120 OCB.</p>`,
      important:`<p>Angebrochene Restminuten werden für die sofortige Fertigstellung auf volle Minuten aufgerundet. OCB verfallen nicht.</p>`
    }),
    related:['buildings','building-levels','production','retail'], targetView:'production'
  },
  {
    id:'retail', category:'Handel', title:'Einzelhandel',
    keywords:['einzelhandel','geschäft','verkauf'],
    summary:'Im Einzelhandel werden Produkte über passende Verkaufsgebäude verkauft.',
    body:`<p>Einzelhandelsverkäufe laufen als zeitgebundene Verkaufsjobs. Nach Ablauf wird der Erlös gutgeschrieben und als Finanzbewegung protokolliert.</p>`,
    related:['buildings','finance','production'], targetView:'production'
  }
];


function encyclopediaEscapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  })[character]);
}

function encyclopediaSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('de-DE')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'') || 'eintrag';
}

function encyclopediaProductCatalog() {
  const grouped = new Map();

  for (const product of state.allProducts || []) {
    const key = `${product.name || ''}::${product.category || ''}`;
    if (!grouped.has(key)) grouped.set(key, product);
  }

  // Für die eigene Variante bevorzugen wir die Unternehmensdaten, weil dort
  // Qualität und Forschungsfortschritt des Spielers aktuell sind.
  for (const product of state.products || []) {
    const key = `${product.name || ''}::${product.category || ''}`;
    grouped.set(key, product);
  }

  return [...grouped.values()].sort((a,b) =>
    String(a.name || '').localeCompare(String(b.name || ''), uiLocale())
  );
}

function encyclopediaRecipeRows(product) {
  const ownedProduct = (state.products || []).find(candidate =>
    candidate.id === product.id ||
    (candidate.name === product.name && candidate.category === product.category)
  );

  const recipeProduct = ownedProduct || product;
  if (!recipeProduct?.id) return [];

  return (state.recipes || []).filter(row => row.product_id === recipeProduct.id);
}

function encyclopediaCalculatorBuildingContext(product) {
  const matchingBuildings = (state.buildings || [])
    .filter(building =>
      building.status === 'active' &&
      building.building_type_id === product?.required_building_type_id
    )
    .sort((a, b) => Number(b.level || 1) - Number(a.level || 1));

  const building = matchingBuildings[0] || null;
  const level = Math.max(1, Number(building?.level || 1));
  const baseRate = Math.max(0, Number(product?.base_production_rate || 0));
  const unitsPerHour = baseRate > 0
    ? Math.max(1, Math.floor(baseRate * buildingLevelMultiplier(level)))
    : 0;

  return {
    building,
    level,
    baseRate,
    unitsPerHour,
    usesOwnedBuilding: !!building
  };
}

function encyclopediaProductionInput(rawValue, product) {
  const raw = String(rawValue ?? '').trim().toLowerCase();
  const context = encyclopediaCalculatorBuildingContext(product);

  const hoursMatch = raw.match(/^(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:h|hr|hrs|std|stunden)$/i);
  if (hoursMatch) {
    const hours = Number(hoursMatch[1].replace(',', '.'));
    if (hours > 0 && hours <= 24 && context.unitsPerHour > 0) {
      return {
        valid: true,
        mode: 'hours',
        hours,
        units: Math.floor(context.unitsPerHour * hours),
        context
      };
    }
  }

  const clock24Match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (clock24Match && context.unitsPerHour > 0) {
    const now = new Date();
    const target = new Date(now);
    target.setHours(Number(clock24Match[1]), Number(clock24Match[2]), 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);

    const hours = (target.getTime() - now.getTime()) / 3600000;
    if (hours > 0 && hours <= 24.01) {
      return {
        valid: true,
        mode: 'time',
        hours,
        units: Math.floor(context.unitsPerHour * hours),
        targetTime: target,
        context
      };
    }
  }

  const amPmMatch = raw.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/i);
  if (amPmMatch && context.unitsPerHour > 0) {
    let hour = Number(amPmMatch[1]);
    const minute = Number(amPmMatch[2] || 0);
    const meridiem = amPmMatch[3].toLowerCase();

    if (hour >= 1 && hour <= 12) {
      if (hour === 12) hour = 0;
      if (meridiem === 'pm') hour += 12;

      const now = new Date();
      const target = new Date(now);
      target.setHours(hour, minute, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);

      const hours = (target.getTime() - now.getTime()) / 3600000;
      if (hours > 0 && hours <= 24.01) {
        return {
          valid: true,
          mode: 'time',
          hours,
          units: Math.floor(context.unitsPerHour * hours),
          targetTime: target,
          context
        };
      }
    }
  }

  const numeric = Number(raw.replace(',', '.'));
  if (Number.isFinite(numeric) && numeric > 0) {
    const units = Math.floor(numeric);
    return {
      valid: units > 0,
      mode: 'units',
      hours: context.unitsPerHour > 0 ? units / context.unitsPerHour : null,
      units,
      context
    };
  }

  return {
    valid: false,
    mode: 'invalid',
    hours: null,
    units: 0,
    context
  };
}

function encyclopediaRecipeQuantity(value) {
  return new Intl.NumberFormat(uiLocale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  }).format(Number(value || 0));
}

function encyclopediaRecipeMarketProcurement(row, required, product) {
  const minQuality = minimumInputQuality(product);
  const input = {
    ...row,
    required,
    available: 0,
    minQuality
  };

  const orders = marketOrdersForProductionInput(input);
  let remaining = Math.max(0, Number(required || 0));
  let available = 0;
  let cost = 0;
  let usedOrders = 0;

  for (const order of orders) {
    if (remaining <= 1e-9) break;
    const orderQuantity = Math.max(0, Number(order.remaining_quantity || 0));
    if (orderQuantity <= 0) continue;

    const take = Math.min(remaining, orderQuantity);
    available += take;
    cost += take * Number(order.price_per_unit || 0);
    remaining -= take;
    usedOrders += 1;
  }

  return {
    minQuality,
    required: Math.max(0, Number(required || 0)),
    available,
    missing: Math.max(0, remaining),
    cost,
    averagePrice: available > 0 ? cost / available : 0,
    fullyAvailable: remaining <= 1e-9,
    usedOrders
  };
}

function encyclopediaRecipeCalculatorHtml(product) {
  const rows = encyclopediaRecipeRows(product);
  if (!rows.length) return '';

  const calculatorId = `encyclopedia-recipe-calculator-${encyclopediaSlug(product.id || product.name)}`;
  const resultId = `${calculatorId}-result`;
  const refreshId = `${calculatorId}-market-refresh`;
  const productId = encyclopediaEscapeHtml(product.id || '');

  return `
    <div class="encyclopedia-recipe-calculator">
      <div class="encyclopedia-recipe-calculator-head">
        <h3>Materialrechner</h3>
        <button
          type="button"
          id="${refreshId}"
          class="encyclopedia-market-refresh-btn"
          onclick="refreshEncyclopediaProcurementPrices('${productId}','${calculatorId}','${resultId}','${refreshId}')"
          title="Aktuelle Marktpreise laden"
          aria-label="Aktuelle Marktpreise laden">
          <span aria-hidden="true">↻</span> Marktpreise
        </button>
      </div>
      <p class="muted">Menge oder Produktionszeit eingeben, z. B. <strong>500</strong>, <strong>6hrs</strong>, <strong>6h</strong>, <strong>18:00</strong> oder <strong>6pm</strong>. Die Beschaffungskosten werden aus den günstigsten aktuell geladenen Verkaufsorders der Warenbörse berechnet.</p>
      <label for="${calculatorId}">Menge / Stunden / Uhrzeit
        <input
          id="${calculatorId}"
          class="encyclopedia-recipe-calculator-input"
          type="text"
          inputmode="text"
          autocomplete="off"
          placeholder="z. B. 500, 6hrs oder 18:00"
          oninput="updateEncyclopediaRecipeCalculator('${productId}', this.value, '${resultId}')">
      </label>
      <div id="${resultId}" class="encyclopedia-recipe-calculator-result muted">
        Eingabe machen, um Materialbedarf und Beschaffungskosten zu berechnen.
      </div>
    </div>
  `;
}

window.refreshEncyclopediaProcurementPrices = async function(productId, inputId, resultId, refreshId) {
  if (!sb) return;

  const button = document.getElementById(refreshId);
  const input = document.getElementById(inputId);

  if (button?.disabled) return;
  if (button) {
    button.disabled = true;
    button.classList.add('is-refreshing');
    button.setAttribute('aria-busy', 'true');
  }

  try {
    const { data, error } = await sb
      .from('market_orders')
      .select('*, products(name,category), materials(name)')
      .eq('order_type', 'sell')
      .in('status', ['open','partially_filled'])
      .gt('remaining_quantity', 0)
      .order('price_per_unit', { ascending:true })
      .limit(1000);

    if (error) {
      await gameAlert(`Marktpreise konnten nicht aktualisiert werden. ${error.message || 'Unbekannter Fehler'}`);
      return;
    }

    state.marketOrders = data || [];
    updateEncyclopediaRecipeCalculator(productId, input?.value || '', resultId);
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('is-refreshing');
      button.removeAttribute('aria-busy');
    }
  }
};

window.updateEncyclopediaRecipeCalculator = function(productId, rawValue, resultId) {
  const result = document.getElementById(resultId);
  if (!result) return;

  const product = (state.products || []).find(item => item.id === productId)
    || (state.allProducts || []).find(item => item.id === productId);

  if (!product) {
    result.innerHTML = `<p class="status error">${translateUiString('Produkt nicht gefunden.')}</p>`;
    return;
  }

  const rows = encyclopediaRecipeRows(product);
  if (!rows.length) {
    result.innerHTML = '<p class="muted">Für dieses Produkt ist kein Rezept verfügbar.</p>';
    return;
  }

  const parsed = encyclopediaProductionInput(rawValue, product);
  if (!String(rawValue ?? '').trim()) {
    result.innerHTML = '<p class="muted">Eingabe machen, um Materialbedarf und Beschaffungskosten zu berechnen.</p>';
    return;
  }

  if (!parsed.valid) {
    const timeUnavailable = parsed.context.unitsPerHour <= 0;
    result.innerHTML = timeUnavailable
      ? '<p class="status error">Bitte eine gültige Stückzahl eingeben. Für Zeitangaben ist bei diesem Produkt keine Produktionsrate verfügbar.</p>'
      : '<p class="status error">Bitte eine gültige Menge oder Zeitangabe eingeben, z. B. 500, 6hrs, 6h, 18:00 oder 6pm.</p>';
    return;
  }

  const procurementResults = [];

  const materialRows = rows.map(row => {
    const material = row.material_id
      ? (state.materials || []).find(item => item.id === row.material_id)
      : null;
    const component = row.component_product_id
      ? ((state.products || []).find(item => item.id === row.component_product_id)
        || (state.allProducts || []).find(item => item.id === row.component_product_id))
      : null;

    const name = material?.name || component?.name || 'Unbekannte Komponente';
    const unit = material?.unit || (component ? 'Stück' : '');
    const required = Number(row.quantity_per_unit || 0) * parsed.units;
    const procurement = encyclopediaRecipeMarketProcurement(row, required, product);
    procurementResults.push(procurement);

    let procurementText = '';
    if (procurement.required <= 0) {
      procurementText = 'Keine Beschaffung erforderlich';
    } else if (procurement.fullyAvailable) {
      procurementText = `Warenbörse: ${money(procurement.cost)} · Ø ${money(procurement.averagePrice)} / Einheit · Q${procurement.minQuality}+`;
    } else if (procurement.available > 0) {
      procurementText = `Warenbörse aktuell: ${money(procurement.cost)} für ${encyclopediaRecipeQuantity(procurement.available)}${unit ? ` ${encyclopediaEscapeHtml(unit)}` : ''} · ${encyclopediaRecipeQuantity(procurement.missing)}${unit ? ` ${encyclopediaEscapeHtml(unit)}` : ''} fehlen`;
    } else {
      procurementText = `Warenbörse: aktuell kein passendes Angebot in Q${procurement.minQuality}+`;
    }

    return `<div class="encyclopedia-recipe-calculator-row">
      <span class="encyclopedia-recipe-calculator-item">
        <strong>${encyclopediaEscapeHtml(name)}</strong>
        <small class="${procurement.fullyAvailable ? '' : 'market-shortage'}">${procurementText}</small>
      </span>
      <span class="encyclopedia-recipe-calculator-required">
        <strong>${encyclopediaRecipeQuantity(required)}${unit ? ` ${encyclopediaEscapeHtml(unit)}` : ''}</strong>
      </span>
    </div>`;
  }).join('');

  const totalProcurementCost = procurementResults.reduce(
    (sum, item) => sum + Number(item.cost || 0),
    0
  );
  const allMarketAvailable = procurementResults.every(item => item.fullyAvailable);
  const missingCount = procurementResults.filter(item => !item.fullyAvailable).length;

  const context = parsed.context;
  const buildingText = context.usesOwnedBuilding
    ? `Berechnung mit deinem höchsten aktiven passenden Gebäude: Level ${context.level} · ${num(context.unitsPerHour)} Einheiten / Std.`
    : `Planungswert mit Gebäude Level 1: ${num(context.unitsPerHour)} Einheiten / Std.`;

  const durationText = parsed.hours !== null
    ? `${parsed.hours.toLocaleString(uiLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Std.`
    : '–';

  const targetText = parsed.targetTime
    ? ` · Ziel ${parsed.targetTime.toLocaleTimeString(uiLocale(), { hour:'2-digit', minute:'2-digit' })} Uhr`
    : '';

  const procurementSummary = allMarketAvailable
    ? `<strong>${money(totalProcurementCost)}</strong>`
    : `<strong>${money(totalProcurementCost)} bisher gedeckt</strong><small>${missingCount} Position${missingCount === 1 ? '' : 'en'} nicht vollständig verfügbar</small>`;

  result.innerHTML = `
    <div class="encyclopedia-recipe-calculator-summary">
      <div><span>Produktionsmenge</span><strong>${num(parsed.units)} Einheiten</strong></div>
      <div><span>Produktionsdauer</span><strong>${durationText}${targetText}</strong></div>
      <div class="${allMarketAvailable ? '' : 'market-shortage-summary'}">
        <span>Beschaffungskosten Warenbörse</span>
        ${procurementSummary}
      </div>
    </div>
    <div class="encyclopedia-recipe-calculator-materials">
      ${materialRows}
    </div>
    <p class="muted encyclopedia-recipe-calculator-note">${buildingText} · Marktpreise aus den aktuell geladenen Verkaufsorders; eigene Orders werden nicht als Beschaffung berücksichtigt.</p>
  `;

  applyLanguageToDom(result);
};

function encyclopediaRecipeText(product) {
  const rows = encyclopediaRecipeRows(product);
  if (!rows.length) return '<p class="muted">Für dieses Produkt ist aktuell kein Rezept in deinen geladenen Unternehmensdaten vorhanden.</p>';

  const items = rows.map(row => {
    const material = row.material_id
      ? (state.materials || []).find(item => item.id === row.material_id)
      : null;
    const component = row.component_product_id
      ? (state.products || []).find(item => item.id === row.component_product_id)
      : null;
    const name = material?.name || component?.name || 'Unbekannte Komponente';
    return `<li>${encyclopediaEscapeHtml(name)}: <strong>${num(row.quantity_per_unit || 0)}</strong> je produzierter Einheit</li>`;
  });

  return `<ul>${items.join('')}</ul>`;
}

function dynamicProductEncyclopediaArticles() {
  return encyclopediaProductCatalog().map(product => {
    const building = (state.buildingTypes || []).find(type => type.id === product.required_building_type_id);
    const retailBuilding = (state.buildingTypes || []).find(type => type.id === product.required_retail_building_type_id);
    const ownedProduct = (state.products || []).find(candidate =>
      candidate.id === product.id ||
      (candidate.name === product.name && candidate.category === product.category)
    );
    const currentQuality = ownedProduct ? productQuality(ownedProduct) : null;
    const productName = encyclopediaEscapeHtml(product.name || 'Produkt');
    const category = encyclopediaEscapeHtml(researchCategory(product));
    const id = `product-${encyclopediaSlug(product.name)}-${encyclopediaSlug(product.category || 'produkt')}`;

    return {
      id,
      category:'Produkte',
      title:product.name || 'Produkt',
      keywords:[
        'produkt','produktion','rezept',
        product.name,
        product.category,
        researchCategory(product),
        building?.name,
        retailBuilding?.name
      ].filter(Boolean),
      summary:`Automatisch aus den aktuellen Spieldaten erzeugter Produkteintrag für ${product.name || 'dieses Produkt'}.`,
      dynamic:true,
      body:() => encyclopediaArticleBody({
        short:`<strong>${productName}</strong> gehört zur Produktgruppe ${category}.`,
        how:`
          ${building ? `<p><strong>Produktionsgebäude:</strong> ${encyclopediaEscapeHtml(building.name)}</p>` : '<p><strong>Produktionsgebäude:</strong> –</p>'}
          ${retailBuilding ? `<p><strong>Verkaufsgebäude:</strong> ${encyclopediaEscapeHtml(retailBuilding.name)}</p>` : ''}
          ${Number(product.base_production_rate || 0) > 0 ? `<p><strong>Basis-Produktionsrate:</strong> ${num(product.base_production_rate)} Einheiten / Std.</p>` : ''}
          ${Number(product.base_retail_rate || 0) > 0 ? `<p><strong>Basis-Verkaufsrate:</strong> ${num(product.base_retail_rate)} Einheiten / Std.</p>` : ''}
          ${currentQuality ? `<p><strong>Deine aktuelle Qualität:</strong> Q${currentQuality} (+${rulePercent(qualityMultiplier(currentQuality)-1)} % Wertbonus)</p>` : '<p><strong>Dein Unternehmen:</strong> Dieses Produkt ist aktuell nicht in deinem eigenen Produktkatalog vorhanden.</p>'}
          <h3>Produktionsrezept</h3>
          ${encyclopediaRecipeText(product)}
          ${encyclopediaRecipeCalculatorHtml(product)}
        `,
        example: currentQuality
          ? `<p>Bei Q${currentQuality} beträgt der aktuelle Qualitätsbonus +${rulePercent(qualityMultiplier(currentQuality)-1)} %.</p>`
          : `<p>Sobald dein Unternehmen das Produkt besitzt, werden hier auch deine aktuelle Qualitätsstufe und – soweit vorhanden – dein Rezept angezeigt.</p>`,
        important:`<p>Dieser Artikel wird automatisch aus den geladenen Produkt-, Gebäude- und Rezeptdaten erzeugt und muss nicht manuell gepflegt werden.</p>`
      }),
      related:['production','recipes','quality','market-pricing'],
      targetView:'production'
    };
  });
}


function encyclopediaRetailProductLot(product, quality) {
  if (!product?.id) return null;
  return (state.inventory || []).find(row =>
    row.product_id === product.id &&
    Number(row.quality_level || 1) === Number(quality || 1) &&
    Number(row.average_unit_cost || 0) > 0
  ) || null;
}

function encyclopediaRetailReferencePrice(product, quality) {
  const q = Math.max(1, Number(quality || 1));
  const ownedProduct = (state.products || []).find(candidate =>
    candidate.id === product?.id ||
    (candidate.name === product?.name && candidate.category === product?.category)
  ) || product;

  const lot = encyclopediaRetailProductLot(ownedProduct, q);
  if (lot?.average_unit_cost > 0) {
    return { value:Number(lot.average_unit_cost) * 2 * qualityMultiplier(q), source:'inventory' };
  }

  const suggested = Number(ownedProduct?.suggested_retail_price || product?.suggested_retail_price || 0);
  if (suggested > 0) {
    return { value:suggested * qualityMultiplier(q), source:'suggested' };
  }

  const productionCost = Number(ownedProduct?.production_cost || product?.production_cost || 0);
  if (productionCost > 0) {
    return { value:productionCost * 2 * qualityMultiplier(q), source:'production' };
  }

  return { value:0, source:'none' };
}

function encyclopediaRetailInput(rawValue, unitsPerHour) {
  const raw = String(rawValue ?? '').trim().toLowerCase();
  const rate = Math.max(0, Number(unitsPerHour || 0));

  const hoursMatch = raw.match(/^(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:h|hr|hrs|std|stunden)$/i);
  if (hoursMatch && rate > 0) {
    const hours = Number(hoursMatch[1].replace(',', '.'));
    if (hours > 0 && hours <= 24) {
      return { valid:true, mode:'hours', hours, units:Math.floor(rate * hours), targetTime:null };
    }
  }

  const clock24Match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (clock24Match && rate > 0) {
    const now = new Date();
    const target = new Date(now);
    target.setHours(Number(clock24Match[1]), Number(clock24Match[2]), 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    const hours = (target.getTime() - now.getTime()) / 3600000;
    if (hours > 0 && hours <= 24.01) {
      return { valid:true, mode:'time', hours, units:Math.floor(rate * hours), targetTime:target };
    }
  }

  const amPmMatch = raw.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/i);
  if (amPmMatch && rate > 0) {
    let hour = Number(amPmMatch[1]);
    const minute = Number(amPmMatch[2] || 0);
    const meridiem = amPmMatch[3].toLowerCase();

    if (hour >= 1 && hour <= 12) {
      if (hour === 12) hour = 0;
      if (meridiem === 'pm') hour += 12;

      const now = new Date();
      const target = new Date(now);
      target.setHours(hour, minute, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);

      const hours = (target.getTime() - now.getTime()) / 3600000;
      if (hours > 0 && hours <= 24.01) {
        return { valid:true, mode:'time', hours, units:Math.floor(rate * hours), targetTime:target };
      }
    }
  }

  const numeric = Number(raw.replace(',', '.'));
  if (Number.isFinite(numeric) && numeric > 0 && rate > 0) {
    const units = Math.floor(numeric);
    const hours = units / rate;
    return {
      valid:units > 0 && hours <= 24,
      mode:'units',
      hours,
      units,
      targetTime:null,
      exceeds24Hours:hours > 24
    };
  }

  return { valid:false, mode:'invalid', hours:null, units:0, targetTime:null };
}

function encyclopediaRetailCalculatorHtml(buildingType, retailProducts) {
  if (buildingType?.building_category !== 'retail' || !retailProducts?.length) return '';

  const slug = encyclopediaSlug(buildingType.id || buildingType.name);
  const firstProduct = retailProducts[0];
  const initialQuality = Math.max(1, Number(firstProduct?.quality_level || 1));
  const initialReference = encyclopediaRetailReferencePrice(firstProduct, initialQuality);

  const productOptions = retailProducts.map(product =>
    `<option value="${encyclopediaEscapeHtml(product.id)}">${encyclopediaEscapeHtml(product.name)}</option>`
  ).join('');

  return `
    <div class="encyclopedia-retail-calculator">
      <h3>${translateUiString('Verkaufsrechner')}</h3>
      <p class="muted">Gebäudelevel, Produkt, Menge oder Zeit und Verkaufspreis eingeben. Die Berechnung nutzt dieselbe Preis-/Nachfrageformel wie der Handel.</p>

      <div class="encyclopedia-retail-calculator-grid">
        <label>${translateUiString('Produkt auswählen')}
          <select id="encyclopedia-retail-product-${slug}"
            onchange="syncEncyclopediaRetailCalculator('${encyclopediaEscapeHtml(buildingType.id)}','${slug}')">
            ${productOptions}
          </select>
        </label>

        <label>${translateUiString('Gebäudelevel')}
          <input id="encyclopedia-retail-level-${slug}" type="number" min="1" max="30" step="1" value="1"
            oninput="updateEncyclopediaRetailCalculator('${encyclopediaEscapeHtml(buildingType.id)}','${slug}')">
        </label>

        <label>Qualität
          <input id="encyclopedia-retail-quality-${slug}" type="number" min="1" max="10" step="1" value="${initialQuality}"
            oninput="syncEncyclopediaRetailCalculator('${encyclopediaEscapeHtml(buildingType.id)}','${slug}')">
        </label>

        <label>${translateUiString('Menge / Stunden / Uhrzeit')}
          <input id="encyclopedia-retail-amount-${slug}" type="text" autocomplete="off"
            placeholder="z. B. 500, 6hrs oder 18:00"
            oninput="updateEncyclopediaRetailCalculator('${encyclopediaEscapeHtml(buildingType.id)}','${slug}')">
        </label>

        <label>${translateUiString('Verkaufspreis')}
          <input id="encyclopedia-retail-price-${slug}" type="number" min="0.01" step="0.01"
            value="${initialReference.value > 0 ? Number(initialReference.value).toFixed(2) : ''}"
            oninput="updateEncyclopediaRetailCalculator('${encyclopediaEscapeHtml(buildingType.id)}','${slug}')">
        </label>
      </div>

      <div id="encyclopedia-retail-result-${slug}" class="encyclopedia-retail-calculator-result muted">
        Eingaben machen, um Verkaufsrate, Menge, Dauer und Umsatz zu berechnen.
      </div>
    </div>
  `;
}

window.syncEncyclopediaRetailCalculator = function(buildingTypeId, slug) {
  const productSelect = document.getElementById(`encyclopedia-retail-product-${slug}`);
  const qualityInput = document.getElementById(`encyclopedia-retail-quality-${slug}`);
  const priceInput = document.getElementById(`encyclopedia-retail-price-${slug}`);

  const product = (state.products || []).find(item => item.id === productSelect?.value)
    || (state.allProducts || []).find(item => item.id === productSelect?.value);
  if (!product) return;

  const quality = Math.max(1, Math.floor(Number(qualityInput?.value || product.quality_level || 1)));
  if (qualityInput) qualityInput.value = quality;

  const reference = encyclopediaRetailReferencePrice(product, quality);
  if (priceInput && reference.value > 0) priceInput.value = Number(reference.value).toFixed(2);

  updateEncyclopediaRetailCalculator(buildingTypeId, slug);
};

window.updateEncyclopediaRetailCalculator = function(buildingTypeId, slug) {
  const productSelect = document.getElementById(`encyclopedia-retail-product-${slug}`);
  const levelInput = document.getElementById(`encyclopedia-retail-level-${slug}`);
  const qualityInput = document.getElementById(`encyclopedia-retail-quality-${slug}`);
  const amountInput = document.getElementById(`encyclopedia-retail-amount-${slug}`);
  const priceInput = document.getElementById(`encyclopedia-retail-price-${slug}`);
  const result = document.getElementById(`encyclopedia-retail-result-${slug}`);
  if (!result) return;

  const product = (state.products || []).find(item => item.id === productSelect?.value)
    || (state.allProducts || []).find(item => item.id === productSelect?.value);
  const buildingType = (state.buildingTypes || []).find(item => item.id === buildingTypeId);

  const level = Math.max(1, Math.floor(Number(levelInput?.value || 1)));
  const quality = Math.max(1, Math.floor(Number(qualityInput?.value || 1)));
  const price = Number(priceInput?.value || 0);

  if (!product || !buildingType) {
    result.innerHTML = '<p class="status error">Produkt oder Verkaufsgebäude nicht gefunden.</p>';
    return;
  }

  const baseRetailRate = Math.max(0, Number(product.base_retail_rate || 0));
  const baseUnitsPerHour = baseRetailRate > 0
    ? Math.max(1, Math.floor(baseRetailRate * buildingLevelMultiplier(level)))
    : 0;

  const reference = encyclopediaRetailReferencePrice(product, quality);
  const referencePrice = Number(reference.value || 0);

  if (baseUnitsPerHour <= 0) {
    result.innerHTML = '<p class="status error">Für dieses Produkt ist keine Verkaufsrate verfügbar.</p>';
    return;
  }

  if (!(price > 0)) {
    result.innerHTML = '<p class="muted">Bitte einen Verkaufspreis größer als 0 OC$ eingeben.</p>';
    return;
  }

  if (!(referencePrice > 0)) {
    result.innerHTML = '<p class="status error">Für dieses Produkt ist kein Referenzpreis verfügbar. Die preisabhängige Nachfrage kann nicht berechnet werden.</p>';
    return;
  }

  const priceRatio = price / referencePrice;
  const demandFactor = Math.max(0.10, Math.min(2.00, 1 - (0.375 * (priceRatio - 1))));
  const unitsPerHour = Math.max(1, Math.floor(baseUnitsPerHour * demandFactor));

  const sourceText = reference.source === 'inventory'
    ? 'Referenzpreis aus deinem aktuellen Lager-Einstandswert'
    : reference.source === 'suggested'
      ? 'Planungs-Referenzpreis aus den Produktdaten'
      : 'Planungs-Referenzpreis aus den Produktionskosten';

  if (demandFactor < 0.70) {
    result.innerHTML = `
      <p class="status error">Die berechnete Nachfrage liegt bei ${Math.round(demandFactor * 100)} %. Im Spiel muss sie mindestens 70 % betragen.</p>
      <p class="muted">${sourceText}: ${money(referencePrice)} / Einheit.</p>
    `;
    return;
  }

  const rawAmount = String(amountInput?.value ?? '').trim();
  if (!rawAmount) {
    result.innerHTML = `
      <div class="encyclopedia-retail-calculator-summary">
        <div><span>${translateUiString('Basis-Verkaufsrate')}</span><strong>${num(baseUnitsPerHour)} Einheiten / Std.</strong></div>
        <div><span>${translateUiString('Nachfrage')}</span><strong>${Math.round(demandFactor * 100)} %</strong></div>
        <div><span>${translateUiString('Effektive Verkaufsrate')}</span><strong>${num(unitsPerHour)} Einheiten / Std.</strong></div>
        <div><span>${translateUiString('Referenzpreis')}</span><strong>${money(referencePrice)}</strong></div>
      </div>
      <p class="muted encyclopedia-retail-calculator-note">${sourceText}. Gebäudelevel ${level}, Qualität Q${quality}.</p>
    `;
    return;
  }

  const parsed = encyclopediaRetailInput(rawAmount, unitsPerHour);
  if (!parsed.valid) {
    result.innerHTML = parsed.exceeds24Hours
      ? '<p class="status error">Diese Menge würde länger als 24 Stunden dauern. Im Handel sind maximal 24 Stunden erlaubt.</p>'
      : '<p class="status error">Bitte eine gültige Menge oder Zeitangabe eingeben, z. B. 500, 6hrs, 6h, 18:00 oder 6pm.</p>';
    return;
  }

  const revenue = parsed.units * price;
  const durationText = `${parsed.hours.toLocaleString(uiLocale(), {
    minimumFractionDigits:0,
    maximumFractionDigits:2
  })} Std.`;
  const targetText = parsed.targetTime
    ? ` · Ziel ${parsed.targetTime.toLocaleTimeString(uiLocale(), { hour:'2-digit', minute:'2-digit' })} Uhr`
    : '';

  result.innerHTML = `
    <div class="encyclopedia-retail-calculator-summary">
      <div><span>${translateUiString('Basis-Verkaufsrate')}</span><strong>${num(baseUnitsPerHour)} Einheiten / Std.</strong></div>
      <div><span>${translateUiString('Nachfrage')}</span><strong>${Math.round(demandFactor * 100)} %</strong></div>
      <div><span>${translateUiString('Effektive Verkaufsrate')}</span><strong>${num(unitsPerHour)} Einheiten / Std.</strong></div>
      <div><span>${translateUiString('Referenzpreis')}</span><strong>${money(referencePrice)}</strong></div>
      <div><span>${translateUiString('Ausgewählte Menge')}</span><strong>${num(parsed.units)} Einheiten</strong></div>
      <div><span>${translateUiString('Verkaufsdauer')}</span><strong>${durationText}${targetText}</strong></div>
      <div><span>${translateUiString('Verkaufspreis')}</span><strong>${money(price)} / Einheit</strong></div>
      <div><span>${translateUiString('Erwarteter Umsatz')}</span><strong>${money(revenue)}</strong></div>
    </div>
    <p class="muted encyclopedia-retail-calculator-note">${sourceText}. Gebäudelevel ${level}, Qualität Q${quality}.</p>
  `;

  applyLanguageToDom(result);
};

function dynamicBuildingEncyclopediaArticles() {
  return (state.buildingTypes || [])
    .map(buildingType => {
      const ownedBuildings = (state.buildings || []).filter(building =>
        building.building_type_id === buildingType.id
      );
      const activeBuildings = ownedBuildings.filter(building => building.status === 'active');
      const levels = activeBuildings.map(building => Number(building.level || 1));
      const highestLevel = levels.length ? Math.max(...levels) : 0;
      const products = encyclopediaProductCatalog().filter(product =>
        product.required_building_type_id === buildingType.id ||
        product.required_retail_building_type_id === buildingType.id
      );
      const productionProducts = products.filter(product => product.required_building_type_id === buildingType.id);
      const retailProducts = products.filter(product => product.required_retail_building_type_id === buildingType.id);
      const buildingName = encyclopediaEscapeHtml(buildingType.name || 'Gebäude');

      const productLinks = items => items.length
        ? `<ul>${items.map(product => {
            const productId = `product-${encyclopediaSlug(product.name)}-${encyclopediaSlug(product.category || 'produkt')}`;
            return `<li><button type="button" class="encyclopedia-inline-article-link" onclick="openEncyclopediaArticle('${productId}')">${encyclopediaEscapeHtml(product.name)}</button></li>`;
          }).join('')}</ul>`
        : '<p class="muted">Keine Produkte zugeordnet.</p>';

      return {
        id:`building-${encyclopediaSlug(buildingType.name)}-${encyclopediaSlug(buildingType.id)}`,
        category:'Gebäude',
        title:buildingType.name || 'Gebäude',
        keywords:['gebäude','bau','ausbau',buildingType.name,buildingType.building_category].filter(Boolean),
        summary:`Automatisch aus den aktuellen Gebäudedaten erzeugter Eintrag für ${buildingType.name || 'diesen Gebäudetyp'}.`,
        dynamic:true,
        body:() => encyclopediaArticleBody({
          short:`<strong>${buildingName}</strong> ist ein Gebäudetyp in OpenCompany.`,
          how:`
            <p><strong>Kategorie:</strong> ${encyclopediaEscapeHtml(buildingType.building_category || '–')}</p>
            <p><strong>Baukosten Level 1:</strong> ${money(buildingType.construction_cost || 0)}</p>
            <p><strong>Bauzeit Level 1:</strong> ${formatBuildingConstructionTime(buildingConstructionHours(1))}</p>
            ${Number(buildingType.employees_per_building || 0) > 0 ? `<p><strong>Mitarbeiter Level 1:</strong> ${num(buildingType.employees_per_building)}</p>` : ''}
            <p><strong>In deinem Unternehmen:</strong> ${num(activeBuildings.length)} aktiv${activeBuildings.length === 1 ? 'es Gebäude' : 'e Gebäude'}${highestLevel ? ` · höchste Stufe L${highestLevel}` : ''}</p>
            ${productionProducts.length ? `<h3>Produzierbare Produkte</h3>${productLinks(productionProducts)}` : ''}
            ${retailProducts.length ? `<h3>Verkaufbare Produkte</h3>${productLinks(retailProducts)}` : ''}
            ${buildingType.building_category === 'retail'
              ? encyclopediaRetailCalculatorHtml(buildingType, retailProducts)
              : ''}
          `,
          example:`<p>Der Ausbau auf Level 2 benötigt ${formatBuildingConstructionTime(buildingConstructionHours(2))}. Die Baukosten und Leistungswerte werden entsprechend der Gebäudelevel-Regeln angepasst.</p>`,
          important:`<p>Dieser Artikel wird automatisch aus den geladenen Gebäudetypen, deinen Unternehmensgebäuden und den zugeordneten Produktdaten erzeugt.</p>`
        }),
        related:['buildings','building-levels','production'],
        targetView:'production'
      };
    })
    .sort((a,b) => a.title.localeCompare(b.title, uiLocale()));
}

function encyclopediaArticles() {
  return [
    ...ENCYCLOPEDIA_ARTICLES,
    ...dynamicProductEncyclopediaArticles(),
    ...dynamicBuildingEncyclopediaArticles()
  ];
}


const ENCYCLOPEDIA_FAVORITES_KEY = 'opencompany_encyclopedia_favorites';
const ENCYCLOPEDIA_RECENT_KEY = 'opencompany_encyclopedia_recent';
const ENCYCLOPEDIA_RECENT_LIMIT = 5;

function encyclopediaReadStoredIds(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
  } catch (_) {
    return [];
  }
}

function encyclopediaWriteStoredIds(key, ids) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...new Set(ids)]));
  } catch (_) {}
}

function encyclopediaFavoriteIds() {
  const validIds = new Set(encyclopediaArticles().map(article => article.id));
  const ids = encyclopediaReadStoredIds(ENCYCLOPEDIA_FAVORITES_KEY).filter(id => validIds.has(id));
  encyclopediaWriteStoredIds(ENCYCLOPEDIA_FAVORITES_KEY, ids);
  return ids;
}

function encyclopediaRecentIds() {
  const validIds = new Set(encyclopediaArticles().map(article => article.id));
  const ids = encyclopediaReadStoredIds(ENCYCLOPEDIA_RECENT_KEY)
    .filter(id => validIds.has(id))
    .slice(0, ENCYCLOPEDIA_RECENT_LIMIT);
  encyclopediaWriteStoredIds(ENCYCLOPEDIA_RECENT_KEY, ids);
  return ids;
}

function encyclopediaIsFavorite(articleId) {
  return encyclopediaFavoriteIds().includes(articleId);
}

function encyclopediaRememberArticle(articleId) {
  if (!encyclopediaArticleById(articleId)) return;
  const ids = encyclopediaRecentIds().filter(id => id !== articleId);
  ids.unshift(articleId);
  encyclopediaWriteStoredIds(ENCYCLOPEDIA_RECENT_KEY, ids.slice(0, ENCYCLOPEDIA_RECENT_LIMIT));
}

window.toggleEncyclopediaFavorite = function(articleId) {
  if (!encyclopediaArticleById(articleId)) return;

  const ids = encyclopediaFavoriteIds();
  const next = ids.includes(articleId)
    ? ids.filter(id => id !== articleId)
    : [articleId, ...ids];

  encyclopediaWriteStoredIds(ENCYCLOPEDIA_FAVORITES_KEY, next);
  renderEncyclopedia();
};

function encyclopediaDeepLink(articleId) {
  return `#encyclopedia/${encodeURIComponent(articleId)}`;
}

function setEncyclopediaDeepLink(articleId, { replace = false } = {}) {
  const hash = encyclopediaDeepLink(articleId);
  if (location.hash === hash) return;
  if (replace) history.replaceState(null, '', hash);
  else history.pushState(null, '', hash);
}

window.copyEncyclopediaDeepLink = async function(articleId) {
  const article = encyclopediaArticleById(articleId);
  if (!article) return;

  const url = new URL(window.location.href);
  url.hash = encyclopediaDeepLink(articleId);

  try {
    await navigator.clipboard.writeText(url.toString());
    await gameAlert('Link zum Enzyklopädie-Artikel wurde kopiert.');
  } catch (_) {
    await gamePrompt('Link zum Enzyklopädie-Artikel:', url.toString(), 'Deep Link');
  }
};

function renderEncyclopediaQuickLists() {
  const favoritesSection = document.getElementById('encyclopediaFavoritesSection');
  const favoritesHost = document.getElementById('encyclopediaFavorites');
  const favoritesCount = document.getElementById('encyclopediaFavoritesCount');
  const recentSection = document.getElementById('encyclopediaRecentSection');
  const recentHost = document.getElementById('encyclopediaRecent');
  if (!favoritesSection || !favoritesHost || !recentSection || !recentHost) return;

  const favorites = encyclopediaFavoriteIds()
    .map(encyclopediaArticleById)
    .filter(Boolean);
  const recent = encyclopediaRecentIds()
    .map(encyclopediaArticleById)
    .filter(Boolean);

  favoritesSection.classList.toggle('hidden', favorites.length === 0);
  recentSection.classList.toggle('hidden', recent.length === 0);
  if (favoritesCount) favoritesCount.textContent = String(favorites.length);

  favoritesHost.innerHTML = favorites.map(article => `
    <button type="button" class="encyclopedia-quick-link" onclick="openEncyclopediaArticle('${article.id}')">
      ★ ${translateUiString(article.title)}
    </button>
  `).join('');

  recentHost.innerHTML = recent.map(article => `
    <button type="button" class="encyclopedia-quick-link" onclick="openEncyclopediaArticle('${article.id}')">
      ${translateUiString(article.title)}
    </button>
  `).join('');
}

function encyclopediaArticleById(articleId) {
  return encyclopediaArticles().find(article => article.id === articleId) || null;
}

function encyclopediaCategories() {
  return ['Alle', ...new Set(encyclopediaArticles().map(article => article.category))];
}

function encyclopediaMatches(article, query) {
  if (!query) return true;
  const haystack = [
    article.title,
    article.category,
    article.summary,
    ...(article.keywords || [])
  ].join(' ').toLocaleLowerCase(uiLocale());
  return haystack.includes(query.toLocaleLowerCase(uiLocale()));
}

function renderEncyclopedia() {
  const search = document.getElementById('encyclopediaSearch');
  const categories = document.getElementById('encyclopediaCategories');
  const list = document.getElementById('encyclopediaArticleList');
  const articleHost = document.getElementById('encyclopediaArticle');
  if (!search || !categories || !list || !articleHost) return;

  if (search.value !== state.encyclopediaSearch) search.value = state.encyclopediaSearch || '';
  renderEncyclopediaQuickLists();

  const allCategories = encyclopediaCategories();
  if (!allCategories.includes(state.encyclopediaCategory)) state.encyclopediaCategory = 'Alle';

  categories.innerHTML = allCategories.map(category => `
    <button type="button"
      class="encyclopedia-category-btn ${category === state.encyclopediaCategory ? 'active' : ''}"
      data-encyclopedia-category="${category}">
      ${translateUiString(category)}
    </button>
  `).join('');

  const query = (state.encyclopediaSearch || '').trim();
  const articles = encyclopediaArticles();
  const visible = articles.filter(article =>
    (state.encyclopediaCategory === 'Alle' || article.category === state.encyclopediaCategory) &&
    encyclopediaMatches(article, query)
  );

  list.innerHTML = visible.length ? visible.map(article => `
    <button type="button"
      class="encyclopedia-list-item ${article.id === state.encyclopediaSelectedArticleId ? 'active' : ''}"
      data-encyclopedia-article="${article.id}">
      <strong>${translateUiString(article.title)}</strong>
      <span>${translateUiString(article.category)}${article.dynamic ? ` · ${translateUiString('Automatisch')}` : ''}</span>
    </button>
  `).join('') : `<div class="encyclopedia-empty">${translateUiString('Keine Artikel gefunden.')}</div>`;

  let article = encyclopediaArticleById(state.encyclopediaSelectedArticleId);
  if (!article) {
    article = visible[0] || articles[0];
    state.encyclopediaSelectedArticleId = article?.id || null;
  }

  if (!article) {
    articleHost.innerHTML = `<p class="muted">${translateUiString('Keine Artikel gefunden.')}</p>`;
    return;
  }

  const related = (article.related || [])
    .map(encyclopediaArticleById)
    .filter(Boolean);

  articleHost.innerHTML = `
    <header class="encyclopedia-article-header">
      <div class="encyclopedia-article-title-row">
        <h2>${translateUiString(article.title)}</h2>
        <div class="encyclopedia-article-tools">
          <button type="button"
            class="encyclopedia-favorite-btn ${encyclopediaIsFavorite(article.id) ? 'active' : ''}"
            onclick="toggleEncyclopediaFavorite('${article.id}')"
            aria-label="${translateUiString(encyclopediaIsFavorite(article.id) ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen')}"
            title="${translateUiString(encyclopediaIsFavorite(article.id) ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen')}">
            ${encyclopediaIsFavorite(article.id) ? '★' : '☆'}
          </button>
          <button type="button"
            class="encyclopedia-link-btn"
            onclick="copyEncyclopediaDeepLink('${article.id}')"
            aria-label="${translateUiString('Link kopieren')}"
            title="${translateUiString('Link kopieren')}">↗</button>
        </div>
      </div>
      <span class="encyclopedia-article-category">${translateUiString(article.category)}</span>
      ${article.dynamic ? `<span class="encyclopedia-article-category encyclopedia-dynamic-badge">${translateUiString('Automatisch')}</span>` : ''}
      <p class="muted">${translateUiString(article.summary)}</p>
    </header>
    <div class="encyclopedia-article-body">${typeof article.body === 'function' ? article.body() : article.body}</div>
    ${article.targetView ? `
      <div class="encyclopedia-article-actions">
        <button type="button" onclick="goToEncyclopediaTarget('${article.targetView}')">
          ${translateUiString('Zum Spielbereich')}
        </button>
      </div>` : ''}
    ${related.length ? `
      <div class="encyclopedia-related">
        <strong>${translateUiString('Verwandte Themen')}</strong>
        <div class="encyclopedia-related-links">
          ${related.map(item => `<button type="button" class="ghost" onclick="openEncyclopediaArticle('${item.id}')">${translateUiString(item.title)}</button>`).join('')}
        </div>
      </div>` : ''}
  `;
}

function activateView(view) {
  const target = document.getElementById(view);
  const navButton = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (!target || !navButton) return false;

  document.querySelectorAll('.nav-item').forEach(button => button.classList.remove('active'));
  navButton.classList.add('active');
  document.querySelectorAll('.view').forEach(item => item.classList.remove('active-view'));
  target.classList.add('active-view');
  document.getElementById('pageTitle').textContent = navButton.dataset.baseLabel || navButton.textContent;
  saveLastView(view);
  return true;
}

window.openEncyclopediaArticle = function(articleId, options = {}) {
  const article = encyclopediaArticleById(articleId);
  if (!article) return;

  state.encyclopediaSelectedArticleId = articleId;
  state.encyclopediaCategory = 'Alle';
  state.encyclopediaSearch = '';

  encyclopediaRememberArticle(articleId);
  activateView('encyclopedia');

  if (!options.fromHash) {
    setEncyclopediaDeepLink(articleId, { replace: !!options.replaceHash });
  }

  renderEncyclopedia();
  document.getElementById('encyclopediaArticle')?.scrollIntoView({ behavior:'smooth', block:'start' });
};

window.goToEncyclopediaTarget = function(view) {
  const requiredLevel = featureRequiredLevel(view);
  if (requiredLevel && !featureUnlocked(view)) {
    gameAlert(`${view} wird auf Unternehmenslevel ${requiredLevel} freigeschaltet.`);
    return;
  }
  activateView(view);
  const targetHash = `#${view}`;
  if (location.hash !== targetHash) {
    history.replaceState(null, '', targetHash);
  }
};

function renderAll() {
  const c = state.company;
  updateFeatureLocks();
  const statOcb = document.getElementById('statOcb');
  if (statOcb) statOcb.textContent = `⚡ ${num(state.ocbStatus?.balance ?? c.ocb_balance ?? 0)} OCB`;
  const cashValue = Number(c.cash_balance || 0);
  const statCash = document.getElementById('statCash');
  statCash.textContent = dashboardCashMoney(cashValue);
  statCash.classList.toggle('negative-balance', cashValue < 0);

  const automaticEmployees = state.buildings
    .filter(b => b.status === 'active')
    .reduce((sum, b) => {
      const type = state.buildingTypes.find(bt => bt.id === b.building_type_id);
      const multiplier = buildingLevelMultiplier(b.level);
      return sum + Math.round(Number(type?.employees_per_building || 0) * multiplier);
    }, 0);

  document.getElementById('statEmployees').textContent = `${num(automaticEmployees)} Mitarbeiter`;
  document.getElementById('statValue').textContent = money(c.company_value);

  const statStorageValue = document.getElementById('statStorageValue');
  const statPatentValue = document.getElementById('statPatentValue');
  const statDebt = document.getElementById('statDebt');
  const statBuildingValue = document.getElementById('statBuildingValue');

  if (statStorageValue) statStorageValue.textContent = money(currentStorageValue());
  if (statPatentValue) statPatentValue.textContent = money(Number(c.patent_value || 0));
  if (statDebt) statDebt.textContent = money(Math.max(0, Number(state.companyDebt || 0)));
  if (statBuildingValue) statBuildingValue.textContent = money(currentCompanyBuildingValue());

  renderDashboardValuationChanges();
  renderSettingsCompanyManagement();
  renderResearch();
  renderEncyclopedia();

  const xpCtx = xpProgressContext(c);
  const slotCount = buildingSlotsForLevel(c.company_level);
  const usedSlotCount = state.buildings.length;

  const companyRows = [
    `<div class="kv"><span>Name</span><strong>${c.name}</strong></div>`,
    `<div class="kv"><span>Unternehmens-ID</span><strong class="company-public-id">${c.company_code || '–'}</strong></div>`,
    `<div class="kv"><span>Status</span><strong class="company-online-status presence-status"></strong></div>`,
    `<div class="kv"><span>Ranking</span><strong id="companyRankingValue" class="company-ranking-value"></strong></div>`,
    `<div class="kv"><span>Level</span><strong>${num(c.company_level)}</strong></div>`,
    `<div class="kv"><span>Erfahrung</span><strong>${xpCtx.level >= 30 ? `${num(xpCtx.totalXp)} XP · Max-Level` : `${num(xpCtx.progress)} / ${num(xpCtx.needed)} XP`}</strong></div>`,
    `<div class="xp-progress"><span style="width:${xpCtx.percent}%"></span></div>`,
    `<div class="kv"><span>Gebäudeplätze</span><strong>${usedSlotCount} / ${slotCount}</strong></div>`
  ].join('');
  document.getElementById('companySummary').innerHTML = companyRows;
  renderCompanyRanking();

  const companyDebt = Math.max(0, Number(state.companyDebt || 0));
  const companyBuildingValue = currentCompanyBuildingValue();
  const renameAvailability = companyRenameAvailability();
  const renameTitle = renameAvailability.allowed
    ? 'Unternehmensnamen ändern'
    : `Namensänderung wieder ab ${renameAvailability.availableAt.toLocaleString(uiLocale())} möglich`;

  document.getElementById('companyDetails').innerHTML = renderTable(
    ['Unternehmen','Status',`Level <button type="button" class="encyclopedia-help-btn" onclick="openEncyclopediaArticle('company-level')" aria-label="Hilfe zu Level und XP" title="Enzyklopädie öffnen">?</button>`,'XP','Gebäudeplätze','Kontostand','Mitarbeiter',`Unternehmenswert <button type="button" class="encyclopedia-help-btn" onclick="openEncyclopediaArticle('company-value')" aria-label="Hilfe zum Unternehmenswert" title="Enzyklopädie öffnen">?</button>`,'Gebäudewert',`Patentwert <button type="button" class="encyclopedia-help-btn" onclick="openEncyclopediaArticle('patent-value')" aria-label="Hilfe zum Patentwert" title="Enzyklopädie öffnen">?</button>`,`Schulden <button type="button" class="encyclopedia-help-btn" onclick="openEncyclopediaArticle('bonds')" aria-label="Hilfe zu Schulden und Anleihen" title="Enzyklopädie öffnen">?</button>`],
    [`<tr>
      <td><span class="company-name-edit-wrap"><strong>${c.name}</strong><button type="button" class="company-name-edit-btn" onclick="renameCompanyFromCompanyTab()" title="${renameTitle}" aria-label="Unternehmensnamen ändern" ${renameAvailability.allowed ? '' : 'disabled'}>✎</button></span></td>
      <td><span class="company-online-status presence-status"></span></td>
      <td>${num(c.company_level)}</td>
      <td>${xpCtx.level >= 30 ? `${num(xpCtx.totalXp)} XP` : `${num(xpCtx.progress)} / ${num(xpCtx.needed)}`}</td>
      <td>${usedSlotCount} / ${slotCount}</td>
      <td id="companyCashBalance" class="${Number(c.cash_balance || 0) < 0 ? 'negative-balance' : ''}">${balanceMoney(Number(c.cash_balance || 0))}</td>
      <td>${num(automaticEmployees)} Mitarbeiter</td>
      <td title="Wird täglich um ${ruleTime('companyValuation')} Uhr neu berechnet">${money(c.company_value)}</td>
      <td>${money(companyBuildingValue)}</td>
      <td>${money(c.patent_value || 0)}</td>
      <td class="${companyDebt > 0 ? 'company-debt-negative' : 'company-debt-zero'}">${companyDebt > 0 ? `-${money(companyDebt)}` : money(0)}</td>
    </tr>`]
  );
  renderCompanyStatus();

  document.getElementById('recentTransactions').innerHTML = renderFinanceMovements(state.transactions.slice(0,8), 'dashboard-finance');
  renderFinanceSummary();
  renderBonds();
  renderStorage();

  renderBuildings();
  updateProductionProductsForSelectedBuilding();
  updateSellItemOptions();
  renderProductionRecipe();
  renderRetailSale();
  renderMarket();
  renderContracts();
  if (currentLanguage === 'en') applyLanguageToDom(document.getElementById('gameView'));

}


const storageSearchFilter = document.getElementById('storageSearchFilter');
const storageTypeFilter = document.getElementById('storageTypeFilter');
const storageFilterReset = document.getElementById('storageFilterReset');

storageSearchFilter?.addEventListener('input', event => {
  state.storageSearchFilter = event.target.value;
  renderStorage();
});

storageTypeFilter?.addEventListener('change', event => {
  state.storageTypeFilter = event.target.value;
  renderStorage();
});

storageFilterReset?.addEventListener('click', () => {
  state.storageSearchFilter = '';
  state.storageTypeFilter = 'all';
  if (storageSearchFilter) storageSearchFilter.value = '';
  if (storageTypeFilter) storageTypeFilter.value = 'all';
  renderStorage();
});

// Auth
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  state.openDashboardAfterLogin = true;

  const { error } = await sb.auth.signInWithPassword({
    email: document.getElementById('loginEmail').value.trim(),
    password: document.getElementById('loginPassword').value
  });

  if (error) state.openDashboardAfterLogin = false;
  msg(document.getElementById('authMessage'), error ? error.message : 'Angemeldet.', error ? 'error' : 'success');
});
document.getElementById('signupForm').addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await sb.auth.signUp({
    email: document.getElementById('signupEmail').value.trim(),
    password: document.getElementById('signupPassword').value,
    options: { emailRedirectTo: APP_URL }
  });
  msg(document.getElementById('authMessage'), error ? error.message : 'Account erstellt. Bitte ggf. E-Mail bestätigen.', error ? 'error' : 'success');
});
document.getElementById('forgotPasswordBtn').addEventListener('click', async () => {
  const input = document.getElementById('loginEmail');
  const email = input.value.trim();
  if (!email) { msg(document.getElementById('authMessage'),'Bitte zuerst E-Mail eingeben.','error'); input.focus(); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email,{redirectTo:APP_URL});
  msg(document.getElementById('authMessage'), error ? error.message : 'Passwort-Link wurde versendet.', error ? 'error' : 'success');
});
document.getElementById('recoveryForm').addEventListener('submit', async e => {
  e.preventDefault();
  const p = document.getElementById('newPassword').value;
  const c = document.getElementById('newPasswordConfirm').value;
  if (p !== c) { msg(document.getElementById('recoveryMessage'),'Die Passwörter stimmen nicht überein.','error'); return; }
  const { error } = await sb.auth.updateUser({password:p});
  if (error) { msg(document.getElementById('recoveryMessage'),error.message,'error'); return; }
  state.recoveringPassword = false;
  const { data:{session} } = await sb.auth.getSession();
  await handleSession(session);
  window.history.replaceState({},document.title,APP_URL);
});
document.getElementById('logoutBtn').addEventListener('click', async () => {
  const userId = state.session?.user?.id;
  if (state.company?.id) {
    await sb.rpc('set_company_offline', { p_company_id: state.company.id });
  }
  clearLastView(userId);
  history.replaceState(null, '', location.pathname + location.search);
  stopPresenceHeartbeat();
  stopNpcMarketHeartbeat();
  stopCompanyBalanceWatcher();
  stopInactivityWatcher();
  await sb?.auth.signOut({ scope: 'local' });
});

// Company
document.getElementById('companyForm').addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await sb.rpc('bootstrap_company',{
    p_name:document.getElementById('companyName').value.trim()
  });
  msg(document.getElementById('companyMessage'), error ? friendlyDatabaseError(error) : 'Unternehmen gegründet.', error ? 'error' : 'success');
  if (!error) await loadCompany();
});


document.getElementById('renameCompanyBtn').addEventListener('click', () => window.renameCompany());

document.getElementById('resetCompanyBtn').addEventListener('click', async () => {
  if (!state.company?.id) return;

  const confirmed = await gameConfirm(
    'Unternehmen wirklich zurücksetzen? Alle Gebäude, Lagerbestände, laufenden Produktionen, Marktaktivitäten und Finanzdaten werden gelöscht. Firmenname und Account bleiben erhalten. Startkapital danach: 100.000 OC$. Zusätzlich erhältst du eine Elektronikfabrik und ein Elektronikgeschäft.'
  );
  if (!confirmed) return;

  const secondConfirmed = await gameConfirm('Letzte Bestätigung: Unternehmensfortschritt jetzt vollständig zurücksetzen?');
  if (!secondConfirmed) return;

  const { error } = await sb.rpc('reset_company', { p_company_id: state.company.id });
  if (error) {
    gameAlert(error.message);
    return;
  }

  await loadCompany();
  gameAlert('Unternehmen wurde zurückgesetzt. Du startest wieder mit 100.000 OC$.');
});

document.getElementById('deleteCompanyBtn').addEventListener('click', async () => {
  if (!state.session) return;

  const confirmed = await gameConfirm(
    'Account wirklich löschen? Dein Unternehmen, der komplette Spielfortschritt und dein Login-Account werden dauerhaft gelöscht. Danach musst du dich neu registrieren.'
  );
  if (!confirmed) return;

  const typed = await gamePrompt('Zur Bestätigung bitte LÖSCHEN eingeben:');
  if (typed !== 'LÖSCHEN') {
    gameAlert('Löschen abgebrochen. Bestätigung war nicht korrekt.');
    return;
  }

  stopPresenceHeartbeat();
  stopNpcMarketHeartbeat();
  const { error } = await sb.rpc('delete_account');
  if (error) {
    gameAlert(error.message);
    return;
  }

  const deletedUserId = state.session?.user?.id;
  clearLastView(deletedUserId);
  history.replaceState(null, '', location.pathname + location.search);
  state.session = null;
  state.company = null;
  try { await sb.auth.signOut(); } catch (_) {}
  window.location.reload();
});


// Production
document.getElementById('productionProduct').addEventListener('change', renderProductionRecipe);
document.getElementById('productionUnits').addEventListener('input', handleProductionUnitsInput);
document.getElementById('productionMaxBtn').addEventListener('click', () => {
  const plan = productionPlan(0);
  setProductionUnits(plan.maxUnits);
});
document.getElementById('production24Btn').addEventListener('click', () => {
  const ctx = currentProductionContext();
  setProductionUnits(ctx.unitsPerHour * 24);
});

document.getElementById('productionForm').addEventListener('submit', async e => {
  e.preventDefault();
  const plan = productionPlan();

  if (plan.runningJob) {
    if (!await gameConfirm('Produktion wirklich abbrechen? Bereits fertiggestellte Einheiten werden übernommen. Von den noch nicht produzierten Einheiten werden 90% der zugehörigen Produktionskosten und Materialien erstattet.')) return;
    const { error } = await sb.rpc('cancel_production', {
      p_company_id: state.company.id,
      p_job_id: plan.runningJob.id
    });
    if (error) gameAlert(error.message); else await loadCompany();
    return;
  }

  if (!plan.runnable) {
    renderProductionRecipe();
    return;
  }

  const { error } = await sb.rpc('start_production_on_building_v2',{
    p_company_id:state.company.id,
    p_building_id:plan.building.id,
    p_product_id:document.getElementById('productionProduct').value,
    p_hours:plan.hours,
    p_input_text:document.getElementById('productionUnits').value,
    p_start_snapshot:{
      outputQty: plan.outputQty,
      hours: plan.hours,
      procurementCost: plan.procurementCost,
      baseProductionCost: plan.baseProductionCost,
      personnelCost: plan.personnelCost,
      productionCost: plan.productionCost
    }
  });
  if(error) gameAlert(error.message); else await loadCompany();
});
window.buyMissingProductionInput = async function(kind, itemId) {
  const plan = productionPlan();
  const input = plan.inputs.find(i =>
    (kind === 'material' && i.material_id === itemId) ||
    (kind === 'product' && i.component_product_id === itemId)
  );

  if (!input) return;

  let missing = Math.max(0, Number(input.required || 0) - Number(input.available || 0));
  if (missing <= 1e-9) {
    renderProductionRecipe();
    return;
  }

  const orders = marketOrdersForProductionInput(input);
  if (!orders.length) {
    gameAlert(`Aktuell gibt es keine passende Marktorder für ${input.name}.`);
    return;
  }

  let marketQty = 0;
  let estimatedCost = 0;
  let remaining = missing;
  for (const order of orders) {
    if (remaining <= 1e-9) break;
    const take = Math.min(remaining, Number(order.remaining_quantity || 0));
    marketQty += take;
    estimatedCost += take * Number(order.price_per_unit || 0);
    remaining -= take;
  }

  if (marketQty <= 1e-9) {
    gameAlert(`Aktuell ist keine Menge von ${input.name} am Markt verfügbar.`);
    return;
  }

  const unit = input.unit ? ` ${input.unit}` : '';
  const message = remaining > 1e-9
    ? `Es fehlen ${num(missing)}${unit} ${input.name}. Am Markt sind aktuell ${num(marketQty)}${unit} verfügbar. Diese Menge für ca. ${money(estimatedCost)} kaufen?`
    : `Fehlende ${num(missing)}${unit} ${input.name} für ca. ${money(estimatedCost)} kaufen?`;

  if (!await gameConfirm(message)) return;

  let toBuy = marketQty;
  for (const order of orders) {
    if (toBuy <= 1e-9) break;
    const take = Math.min(toBuy, Number(order.remaining_quantity || 0));
    if (take <= 1e-9) continue;

    const { error } = await sb.rpc('buy_market_order', {
      p_buyer_company_id: state.company.id,
      p_order_id: order.id,
      p_quantity: take
    });

    if (error) {
      gameAlert(error.message);
      break;
    }
    toBuy -= take;
  }

  await loadCompany();
};

window.claimProductionOutput = async function(jobId) {
  const job = state.productionJobs.find(j => j.id === jobId);
  if (!job) return;

  const claimable = productionClaimableQuantity(job);
  if (claimable <= 0) {
    renderProductionRecipe();
    return;
  }

  const { data, error } = await sb.rpc('claim_production_output', {
    p_company_id: state.company.id,
    p_job_id: jobId
  });

  if (error) {
    gameAlert(error.message);
    return;
  }

  const claimed = Number(data || 0);
  if (claimed > 0) {
    await loadCompany();
  } else {
    renderProductionRecipe();
  }
};

window.buildBuilding = async function(buildingTypeId) {
  const bt = state.buildingTypes.find(b => b.id === buildingTypeId);
  if (!bt) return;

  const buildHours = buildingConstructionHours(1);
  const finishText = buildingConstructionFinishText(buildHours);
  if (!await gameConfirm(`${bt.name} für ${money(bt.construction_cost)} bauen? Bauzeit: ${formatBuildingConstructionTime(buildHours)}. Voraussichtlich fertig am ${finishText}. Das Gebäude ist erst nach Fertigstellung verfügbar.`)) return;

  const { error } = await sb.rpc('build_building', {
    p_company_id: state.company.id,
    p_building_type_id: buildingTypeId
  });

  if (error) {
    gameAlert(error.message);
  } else {
    await loadCompany();
  }
};

window.upgradeBuilding = async function(buildingId, buildingTypeId) {
  const bt = state.buildingTypes.find(b => b.id === buildingTypeId);
  const building = state.buildings.find(b => b.id === buildingId);
  const nextLevel = Number(building?.level || 1) + 1;
  const increase = buildingUpgradePercent(nextLevel);
  const nextCost = Number(bt?.construction_cost || 0) * buildingLevelMultiplier(nextLevel);

  const buildHours = buildingConstructionHours(nextLevel);
  const finishText = buildingConstructionFinishText(buildHours);

  if (!await gameConfirm(
    `${bt?.name || 'Gebäude'} auf Level ${nextLevel} aufstufen? ` +
    `Kosten: ${money(nextCost)}. Bauzeit: ${formatBuildingConstructionTime(buildHours)}. ` +
    `Voraussichtlich fertig am ${finishText}. Während des Ausbaus ist das Gebäude nicht nutzbar. ` +
    `Mitarbeiter und vorhandene Gebäudekapazität nach Fertigstellung: +${num(increase)}%.`
  )) return;

  const { error } = await sb.rpc('upgrade_building', {
    p_company_id: state.company.id,
    p_building_id: buildingId
  });

  if (error) {
    gameAlert(error.message);
  } else {
    await loadCompany();
  }
};

window.cancelBuildingConstruction = async function(buildingId, buildingTypeId) {
  const building = state.buildings.find(b => b.id === buildingId);
  const bt = state.buildingTypes.find(b => b.id === buildingTypeId);
  if (!building || !bt) return;

  const targetLevel = Math.max(
    1,
    Number(building.construction_target_level || building.level || 1)
  );
  const isNewBuild = Number(building.level || 1) === 1 && targetLevel === 1;
  const constructionCost = targetLevel === 1
    ? Number(bt.construction_cost || 0)
    : Number(bt.construction_cost || 0) * buildingLevelMultiplier(targetLevel);
  const refund = constructionCost * 0.95;

  const actionText = isNewBuild
    ? `den Bau von ${bt.name} abbrechen`
    : `den Ausbau von ${bt.name} auf Level ${targetLevel} abbrechen`;

  const consequenceText = isNewBuild
    ? 'Das unfertige Gebäude wird entfernt.'
    : `Das Gebäude bleibt auf Level ${building.level}.`;

  if (!await gameConfirm(
    `${actionText}? Du erhältst ${money(refund)} zurück (95% der Kosten dieser Baustufe). ${consequenceText}`
  )) return;

  const { data, error } = await sb.rpc('cancel_building_construction', {
    p_company_id: state.company.id,
    p_building_id: buildingId
  });

  if (error) {
    await gameAlert(error.message);
    return;
  }

  await gameAlert(`Bau abgebrochen. Erstattung: ${money(Number(data?.refund || refund))}.`);
  await loadCompany();
};

window.downgradeBuilding = async function(buildingId, buildingTypeId) {
  const bt = state.buildingTypes.find(b => b.id === buildingTypeId);
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || !bt) return;

  const level = Number(building.level || 1);
  const isDemolition = level <= 1;
  const action = isDemolition ? 'abreißen' : `auf Level ${level - 1} abstufen`;

  const refundableCost = isDemolition
    ? Number(bt.construction_cost || 0)
    : Number(bt.construction_cost || 0) * buildingLevelMultiplier(level);
  const refund = refundableCost * 0.95;

  const warning = isDemolition
    ? `Das Gebäude wird vollständig entfernt. Erstattung: ${money(refund)} (95% der Baukosten).`
    : `Die letzte Aufstufung wird zurückgenommen. Erstattung: ${money(refund)} (95% der Kosten dieser Stufe).`;

  if (!await gameConfirm(`${bt.name} ${action}? ${warning}`)) return;

  const { error } = await sb.rpc('downgrade_building', {
    p_company_id: state.company.id,
    p_building_id: buildingId
  });

  if (error) {
    gameAlert(error.message);
  } else {
    await loadCompany();
  }
};

const buildingBuilderBtn = document.getElementById('openBuildingBuilderBtn');
const buildingBuilder = document.getElementById('buildingBuilder');
const buildingCategoryFilter = document.getElementById('buildingCategoryFilter');

buildingBuilderBtn?.addEventListener('click', () => {
  const opening = buildingBuilder.classList.contains('hidden');
  buildingBuilder.classList.toggle('hidden');
  buildingBuilderBtn.textContent = opening ? 'Schließen' : 'Bauen';
  if (opening) renderBuildingCatalog();
});

buildingCategoryFilter?.addEventListener('change', renderBuildingCatalog);

document.querySelectorAll('.building-overview-filter').forEach(button => {
  button.addEventListener('click', () => {
    state.buildingOverviewFilter = button.dataset.buildingFilter || 'all';
    renderBuildings();
  });
  enhanceAllCustomSelects(document);
  document.querySelectorAll('select.oc-select-native').forEach(syncCustomSelect);
});

// Market
function sellOrderContext() {
  const type = document.getElementById('sellItemType')?.value || 'product';
  const itemId = document.getElementById('sellProduct')?.value;
  const quality = Number(document.getElementById('sellQuality')?.value || 1);
  const quantity = Math.max(0, Number(document.getElementById('sellQty')?.value || 0));
  const price = Math.max(0, Number(document.getElementById('sellPrice')?.value || 0));

  if (type === 'material') {
    const item = state.materials.find(m => m.id === itemId);
    const lot = materialInventoryLots(itemId).find(l => Number(l.quality_level || 1) === quality);
    const unitCost = Number(lot?.average_unit_cost || 0);
    const referencePrice = unitCost * GAME_RULES.pricing.playerRecommendedCostMultiplier;
    const minimumPrice = unitCost * GAME_RULES.pricing.marketMinCostMultiplier;
    const freight = transportContainerFreight(quantity);
    return { type, item, lot, quality, quantity, price, unitCost, referencePrice, minimumPrice, freight };
  }

  const item = state.products.find(p => p.id === itemId);
  const lot = productLot(itemId, quality);
  const unitCost = Number(lot?.average_unit_cost || 0);
  const referencePrice = unitCost * GAME_RULES.pricing.playerRecommendedCostMultiplier;
  const minimumPrice = unitCost * GAME_RULES.pricing.marketMinCostMultiplier;
  const isTransportContainer = item?.name === 'Transportcontainer';
  const freight = isTransportContainer
    ? { required: 0, available: 0, cost: 0, sufficient: true, exempt: true }
    : transportContainerFreight(quantity);
  return { type, item, lot, quality, quantity, price, unitCost, referencePrice, minimumPrice, freight, isTransportContainer };
}

function renderSellOrderPreview() {
  const preview = document.getElementById('sellOrderPreview');
  if (!preview) return;

  const ctx = sellOrderContext();
  if (!ctx.item) {
    preview.innerHTML = '<p class="muted">Kein passender Lagerbestand für eine Marktorder vorhanden.</p>';
    return;
  }

  const gross = ctx.quantity * ctx.price;
  const fee = gross * GAME_RULES.fees.marketRate;
  const net = gross - fee;
  const unitCost = Number(ctx.unitCost || ctx.lot?.average_unit_cost || 0);
  const totalCost = ctx.quantity * unitCost;
  const freightCost = Number(ctx.freight?.cost || 0);
  const profit = net - totalCost - freightCost;
  const costLabel = ctx.type === 'material' ? 'Einstandskosten' : 'Produktionskosten';
  const profitClass = profit >= 0 ? 'retail-revenue-positive' : 'retail-cancel-fee';
  const freightClass = ctx.freight?.sufficient ? 'retail-cancel-fee' : 'missing-building-warning';

  preview.innerHTML = `
    <div class="kv"><span>Vorgeschlagener Preis</span><strong>${money(ctx.referencePrice)} / Einheit</strong></div>
    <div class="kv"><span>Mindestpreis</span><strong>${money(ctx.minimumPrice)} / Einheit</strong></div>
    <div class="kv"><span>Gewählter Orderpreis</span><strong>${money(ctx.price)} / Einheit</strong></div>
    <div class="kv"><span>Bruttoerlös</span><strong>${money(gross)}</strong></div>
    <div class="kv"><span>${translateUiString(costLabel)}</span><strong class="retail-cancel-fee">${totalCost > 0 ? `-${money(totalCost)}` : money(0)}</strong></div>
    <div class="kv"><span>Frachtkosten</span><strong class="${freightClass}">${freightCost > 0 ? `-${money(freightCost)}` : money(0)}</strong></div>
    <div class="kv"><span>Transportcontainer</span><strong class="${ctx.freight?.sufficient ? '' : 'missing-building-warning'}">${num(ctx.freight?.available || 0)} / ${num(ctx.quantity)} verfügbar</strong></div>
    <div class="kv"><span>Marktgebühr (${rulePercent(GAME_RULES.fees.marketRate)}%)</span><strong class="retail-cancel-fee">${fee > 0 ? `-${money(fee)}` : money(0)}</strong></div>
    <div class="kv"><span>Nettoerlös</span><strong class="retail-revenue-positive">${money(net)}</strong></div>
    <div class="kv"><span>${translateUiString('Gewinn / Verlust')}</span><strong class="${profitClass}">${profit >= 0 ? '+' : '-'}${money(Math.abs(profit))}</strong></div>
  `;
}

function updateSellQualityOptions() {
  const type = document.getElementById('sellItemType')?.value || 'product';
  const itemId = document.getElementById('sellProduct')?.value;
  const qualitySelect = document.getElementById('sellQuality');
  const priceInput = document.getElementById('sellPrice');
  if (!qualitySelect) return;

  const lots = type === 'material'
    ? materialInventoryLots(itemId).filter(l => Number(l.quantity || 0) > 0)
    : availableProductQualities(itemId);

  const previous = qualitySelect.value;
  qualitySelect.innerHTML = lots.length
    ? lots
        .sort((a,b) => Number(a.quality_level || 1) - Number(b.quality_level || 1))
        .map(l => `<option value="${Number(l.quality_level || 1)}">Q${Number(l.quality_level || 1)} – ${num(l.quantity)} verfügbar</option>`)
        .join('')
    : '<option value="1">Q1 – 0 verfügbar</option>';

  if (lots.some(l => String(l.quality_level) === String(previous))) {
    qualitySelect.value = previous;
  }

  const ctx = sellOrderContext();
  if (priceInput && ctx.referencePrice > 0) {
    priceInput.value = ctx.referencePrice.toFixed(2);
  }
  renderSellOrderPreview();
}

function updateSellItemOptions() {
  const type = document.getElementById('sellItemType')?.value || 'product';
  const select = document.getElementById('sellProduct');
  if (!select) return;

  const previous = select.value;

  if (type === 'material') {
    const availableMaterials = state.materials
      .filter(material => materialInventoryLots(material.id).some(l => Number(l.quantity || 0) > 0))
      .sort((a,b) => a.name.localeCompare(b.name, uiLocale()));

    select.innerHTML = availableMaterials.length
      ? availableMaterials.map(m => `<option value="${m.id}">${m.name}</option>`).join('')
      : '<option value="">Keine Rohstoffe im Lager</option>';

    if (availableMaterials.some(m => m.id === previous)) select.value = previous;
  } else {
    const products = stockedProducts();
    select.innerHTML = productOptionsGroupedByBuilding(products) || '<option value="">Keine Produkte im Lager</option>';
    if (products.some(p => p.id === previous)) select.value = previous;
  }

  updateSellQualityOptions();
}

document.getElementById('sellOrderForm').addEventListener('submit', async e => {
  e.preventDefault();

  const ctx = sellOrderContext();
  if (
    !ctx.item || !ctx.lot || ctx.quantity <= 0 ||
    ctx.price < Number(ctx.minimumPrice || 0) ||
    !ctx.freight?.sufficient
  ) {
    renderSellOrderPreview();
    if (ctx.quantity > 0 && !ctx.freight?.sufficient) {
      gameAlert(`Nicht genügend Transportcontainer. Benötigt: ${num(ctx.quantity)}, verfügbar: ${num(ctx.freight?.available || 0)}`);
    }
    return;
  }

  const args = ctx.type === 'material'
    ? {
        p_company_id: state.company.id,
        p_material_id: ctx.item.id,
        p_quality: ctx.quality,
        p_quantity: ctx.quantity,
        p_price: ctx.price
      }
    : {
        p_company_id: state.company.id,
        p_product_id: ctx.item.id,
        p_quality: ctx.quality,
        p_quantity: ctx.quantity,
        p_price: ctx.price
      };

  const rpc = ctx.type === 'material'
    ? 'place_material_sell_order_quality'
    : 'place_sell_order_quality';

  const { error } = await sb.rpc(rpc, args);
  if (error) gameAlert(error.message);
  else {
    closeMarketSellModal();
    await loadCompany();
  }
});

document.getElementById('sellItemType')?.addEventListener('change', updateSellItemOptions);
document.getElementById('sellProduct')?.addEventListener('change', updateSellQualityOptions);
document.getElementById('sellQuality')?.addEventListener('change', updateSellQualityOptions);
document.getElementById('sellQty')?.addEventListener('input', renderSellOrderPreview);
document.getElementById('sellPrice')?.addEventListener('input', renderSellOrderPreview);

document.getElementById('retailProduct').addEventListener('change', () => {
  const priceInput = document.getElementById('retailPrice');
  if (priceInput) delete priceInput.dataset.manualPrice;
  renderRetailSale();
  recalculateRetailQuantityFromRememberedExpression();
  renderRetailSale();
});
document.getElementById('retailQuality')?.addEventListener('change', () => {
  const priceInput = document.getElementById('retailPrice');
  if (priceInput) delete priceInput.dataset.manualPrice;
  renderRetailSale();
  recalculateRetailQuantityFromRememberedExpression();
  renderRetailSale();
});
document.getElementById('retailPrice')?.addEventListener('input', event => {
  event.target.dataset.manualPrice = '1';

  const qtyInput = document.getElementById('retailQty');
  const hadRememberedExpression = !!qtyInput?.dataset.quantityExpression;

  if (hadRememberedExpression) {
    recalculateRetailQuantityFromRememberedExpression();
  } else if (qtyInput) {
    const ctx = retailSaleContext();
    const requested = Math.max(0, Math.floor(Number(qtyInput.value || 0)));
    const available = Math.max(0, Math.floor(ctx.available || 0));
    const maxUnits24h = Math.max(0, Math.floor((ctx.unitsPerHour || 0) * 24));
    qtyInput.value = formatRetailQuantityInput(Math.min(requested, available, maxUnits24h));
    qtyInput.dataset.quantityMode = 'fixed';
  }

  // Preisänderungen können die Nachfrage und damit die Verkaufsrate verändern.
  // Die Menge wird deshalb automatisch auf maximal 24 Stunden Verkaufsdauer begrenzt.
  renderRetailSale();
});
document.getElementById('retailMaxBtn').addEventListener('click', () => {
  const ctx = retailSaleContext();
  const maxUnits = Math.max(0, Math.floor(ctx.available || 0));
  const qtyInput = document.getElementById('retailQty');
  qtyInput.dataset.quantityMode = 'fixed';
  delete qtyInput.dataset.quantityExpression;
  qtyInput.value = formatRetailQuantityInput(maxUnits);
  renderRetailSale();
});
document.getElementById('retail24Btn').addEventListener('click', () => {
  const ctx = retailSaleContext();
  const capacity24h = Math.max(0, Math.floor((ctx.unitsPerHour || 0) * 24));
  const available = Math.max(0, Math.floor(ctx.available || 0));
  const qtyInput = document.getElementById('retailQty');
  qtyInput.dataset.quantityMode = 'fixed';
  delete qtyInput.dataset.quantityExpression;
  qtyInput.value = formatRetailQuantityInput(Math.min(capacity24h, available));
  renderRetailSale();
});
document.getElementById('retailQty').addEventListener('input', e => {
  const rawValue = e.target.value;
  const parsed = retailQuantityFromInput(rawValue);
  rememberRetailQuantityExpression(e.target, rawValue, parsed);
  if (parsed.matchedHours || parsed.matchedTime) {
    const ctx = retailSaleContext();
    const available = Math.max(0, Math.floor(ctx.available || 0));
    e.target.value = formatRetailQuantityInput(Math.min(parsed.units, available));
  }
  renderRetailSale();
});
document.getElementById('retailSaleForm').addEventListener('submit', async e => {
  e.preventDefault();
  const ctx = retailSaleContext();

  if (ctx.runningJob) {
    const progress = retailSaleProgress(ctx.runningJob);
    if (!await gameConfirm(`Verkauf wirklich abbrechen? Noch nicht verkaufte Ware wird zurück ins Lager gelegt. Abbruchgebühr: ${money(progress.cancellationFee)} (${rulePercent(GAME_RULES.fees.retailCancellationRate)}% des erwarteten Erlöses).`)) return;

    const { error } = await sb.rpc('cancel_retail_sale', {
      p_company_id: state.company.id,
      p_job_id: ctx.runningJob.id
    });

    if (error) gameAlert(error.message);
    else await loadCompany();
    return;
  }

  const parsedQuantity = retailQuantityFromInput(document.getElementById('retailQty').value);
  const quantity = Number(parsedQuantity.units || 0);

  if (!ctx.product || !ctx.building || !Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
    renderRetailSale();
    return;
  }

  const saleHours = ctx.unitsPerHour > 0 ? quantity / ctx.unitsPerHour : 0;
  if (saleHours <= 0 || saleHours > 24) {
    await gameAlert('Die maximale Verkaufsdauer beträgt 24 Stunden.');
    renderRetailSale();
    return;
  }

  const { error } = await sb.rpc('start_retail_sale_on_building_v2', {
    p_company_id: state.company.id,
    p_building_id: ctx.building.id,
    p_product_id: ctx.product.id,
    p_quality: ctx.quality,
    p_quantity: quantity,
    p_unit_price: ctx.price,
    p_input_text: document.getElementById('retailQty').dataset.quantityExpression || document.getElementById('retailQty').value,
    p_start_snapshot: {
      quantity,
      quality: ctx.quality,
      hours: saleHours,
      unitPrice: ctx.price,
      referencePrice: ctx.referencePrice,
      demandFactor: ctx.demandFactor,
      totalValue: ctx.price * quantity,
      available: ctx.available,
      unitsPerHour: ctx.unitsPerHour,
      buildingTypeName: ctx.buildingType?.name || ''
    }
  });

  if (error) {
    gameAlert(error.message);
  } else {
    await loadCompany();
  }
});
window.cancelRetailSale = async function(jobId) {
  const job = state.retailSaleJobs.find(j => j.id === jobId && j.status === 'running');
  if (!job) return;

  const progress = retailSaleProgress(job);
  if (!await gameConfirm(`Verkauf wirklich abbrechen? Noch nicht verkaufte Ware wird zurück ins Lager gelegt. Abbruchgebühr: ${money(progress.cancellationFee)} (${rulePercent(GAME_RULES.fees.retailCancellationRate)}% des erwarteten Erlöses).`)) return;

  const { error } = await sb.rpc('cancel_retail_sale', {
    p_company_id: state.company.id,
    p_job_id: job.id
  });

  if (error) gameAlert(error.message);
  else await loadCompany();
};

window.collectRetailRevenue = async function(jobId) {
  const job = state.retailSaleJobs.find(j => j.id === jobId);
  if (!job) return;

  const progress = retailSaleProgress(job);
  if (progress.claimableUnits <= 0) {
    renderRetailSale();
    return;
  }

  const { data, error } = await sb.rpc('claim_retail_revenue', {
    p_company_id: state.company.id,
    p_job_id: jobId
  });

  if (error) {
    gameAlert(error.message);
    return;
  }

  if (Number(data || 0) > 0) await loadCompany();
  else renderRetailSale();
};

window.cancelOrder = async function(orderId) {
  if(!await gameConfirm('Verkaufsorder wirklich stornieren?')) return;
  const { error }=await sb.rpc('cancel_market_order',{p_order_id:orderId});
  if(error) gameAlert(error.message); else await loadCompany();
};

const marketCatalogSearch = document.getElementById('marketCatalogSearch');
const marketProductBuyQty = document.getElementById('marketProductBuyQty');
const marketProductBuyBtn = document.getElementById('marketProductBuyBtn');
const marketBackBtn = document.getElementById('marketBackBtn');
const marketSellOpenBtn = document.getElementById('marketSellOpenBtn');
const marketSellModal = document.getElementById('marketSellModal');

marketCatalogSearch?.addEventListener('input', event => {
  state.marketSearchFilter=event.target.value;
  renderMarketCatalog();
});

marketBackBtn?.addEventListener('click',()=>{
  state.marketView='catalog';
  state.marketSelectedItemKey='';
  state.marketQualityFilter='all';
  renderMarket();
});

document.querySelectorAll('.market-quality-btn').forEach(button=>button.addEventListener('click',()=>{
  state.marketQualityFilter=button.dataset.quality||'all';
  renderMarketProductPage();
}));

marketProductBuyQty?.addEventListener('input',updateMarketProductBuyPreview);

marketProductBuyBtn?.addEventListener('click', async ()=>{
  const plan=marketProductBuyPlan();
  if (!plan.item || !(plan.qty>0) || plan.remaining>0) return;
  if (!await gameConfirm(`${num(plan.qty)} × ${plan.item.name} automatisch aus den günstigsten verfügbaren Angeboten für insgesamt ${money(plan.total)} kaufen?`)) return;
  marketProductBuyBtn.disabled=true;
  let bought=0, paid=0;
  try {
    for (const fill of plan.fills) {
      const { error }=await sb.rpc('buy_market_order',{
        p_buyer_company_id:state.company.id,
        p_order_id:fill.order.id,
        p_quantity:fill.quantity
      });
      if (error) {
        await gameAlert(`${error.message}${bought>0?` Bereits gekauft: ${num(bought)} Einheiten.`:''}`);
        break;
      }
      bought += fill.quantity;
      paid += fill.quantity*Number(fill.order.price_per_unit||0);
    }
    await loadCompany();
    if (bought>0) await gameAlert(`${num(bought)} × ${plan.item.name} für ${money(paid)} gekauft.`, 'Kauf abgeschlossen');
  } finally {
    updateMarketProductBuyPreview();
  }
});

function closeMarketSellModal() {
  marketSellModal?.classList.add('hidden');
  marketSellModal?.setAttribute('aria-hidden','true');
}
window.closeMarketSellModal=closeMarketSellModal;

function openMarketSellModal() {
  const item=marketItemDescriptor();
  if (!item || !marketCanSellItem(item)) return;
  const typeSelect=document.getElementById('sellItemType');
  const itemSelect=document.getElementById('sellProduct');
  if (!typeSelect || !itemSelect) return;
  typeSelect.value=item.type;
  updateSellItemOptions();
  if (item.type==='material') {
    itemSelect.value=item.id;
  } else {
    const playerProduct=state.products.find(p=>marketProductIdentity(p)===item.key.replace(/^product:/,'') && hasProductInventory(p.id));
    if (!playerProduct) return;
    itemSelect.value=playerProduct.id;
  }
  updateSellQualityOptions();
  const title=document.getElementById('marketSellItemTitle');
  if (title) title.textContent=item.name;
  marketSellModal?.classList.remove('hidden');
  marketSellModal?.setAttribute('aria-hidden','false');
  renderSellOrderPreview();
}
marketSellOpenBtn?.addEventListener('click',openMarketSellModal);
document.getElementById('marketSellCloseBtn')?.addEventListener('click',closeMarketSellModal);
marketSellModal?.addEventListener('click',event=>{ if (event.target===marketSellModal) closeMarketSellModal(); });

document.querySelectorAll('.finance-period-btn').forEach(btn => btn.addEventListener('click', () => {
  state.financePeriod = btn.dataset.period;
  state.financePeriodOffset = 0;
  renderFinanceSummary();
}));

document.getElementById('financePrevPeriod')?.addEventListener('click', () => {
  state.financePeriodOffset -= 1;
  renderFinanceSummary();
});

document.getElementById('financeNextPeriod')?.addEventListener('click', () => {
  if (state.financePeriodOffset >= 0) return;
  state.financePeriodOffset += 1;
  renderFinanceSummary();
});

// Research investment
const researchInvestmentForm = document.getElementById('researchInvestmentForm');
const researchInvestmentAmount = document.getElementById('researchInvestmentAmount');
const researchInvestmentMaxBtn = document.getElementById('researchInvestmentMaxBtn');
const researchProduct = document.getElementById('researchProduct');
const researchProductSearch = document.getElementById('researchProductSearch');

researchProductSearch?.addEventListener('input', event => {
  state.researchSearchFilter = event.target.value;
  renderResearch();
});

researchInvestmentAmount?.addEventListener('input', () => {
  const whole = Math.max(0, Math.floor(Number(researchInvestmentAmount.value || 0)));
  if (String(whole) !== researchInvestmentAmount.value && researchInvestmentAmount.value !== '') {
    researchInvestmentAmount.value = String(whole);
  }
  renderResearch();
});

researchInvestmentMaxBtn?.addEventListener('click', () => {
  const ctx = researchInventoryContext();
  researchInvestmentAmount.value = String(Math.max(0, Math.floor(ctx.quantity)));
  renderResearch();
});

if (researchInvestmentForm) {
  researchInvestmentForm.addEventListener('submit', async e => {
    e.preventDefault();
    const ctx = researchInventoryContext();
    const target = state.products.find(p => p.id === researchProduct?.value);
    const quantity = Math.max(0, Math.floor(Number(researchInvestmentAmount.value || 0)));
    if (!ctx.product || !target || quantity < 1 || quantity > Math.floor(ctx.quantity)) {
      renderResearch();
      return;
    }

    if (!await gameConfirm(`${num(quantity)} Forschungseinheiten in „${target.name}“ investieren?`)) return;

    const { data, error } = await sb.rpc('invest_product_research', {
      p_company_id: state.company.id,
      p_product_id: target.id,
      p_quantity: quantity
    });

    if (error) {
      gameAlert(error.message);
      return;
    }

    gameAlert(data?.upgraded ? `${target.name} hat Qualität Q${Number(data.quality_level || productQuality(target)+1)} erreicht.` : `${num(quantity)} Forschungseinheiten wurden in ${target.name} investiert.`);
    researchInvestmentAmount.value = '1';
    await loadCompany();
  });
}

// Contracts
document.getElementById('contractPartnerSearch')?.addEventListener('input', () => {
  const hiddenInput = document.getElementById('contractPartner');
  const displayInput = document.getElementById('contractPartnerDisplay');
  if (hiddenInput) hiddenInput.value = '';
  if (displayInput) displayInput.value = '';
  updateContractPartnerOptions();
});
document.getElementById('contractPartnerSearchResults')?.addEventListener('click', event => {
  const button = event.target.closest('.contract-partner-result[data-company-id]');
  if (!button) return;
  selectContractPartner(button.dataset.companyId);
});
document.getElementById('contractItemType')?.addEventListener('change', updateContractGoods);
document.getElementById('contractItem')?.addEventListener('change', updateContractQualityOptions);
document.getElementById('contractQuality')?.addEventListener('change', () => {
  const priceInput = document.getElementById('contractPrice');
  const ctx = contractOfferContext();
  if (priceInput && ctx.referencePrice > 0) {
    priceInput.value = ctx.referencePrice.toFixed(2);
  }
  renderContractPreview();
});
document.getElementById('contractQty')?.addEventListener('input', renderContractPreview);
document.getElementById('contractPrice')?.addEventListener('input', renderContractPreview);

document.getElementById('contractForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const partner=document.getElementById('contractPartner').value;
  if(!partner) { gameAlert('Bitte wähle zuerst über die Partnersuche ein Unternehmen aus.'); return; }

  const type=document.getElementById('contractItemType').value;
  const item=document.getElementById('contractItem').value;
  if(!item) {
    gameAlert('Für diesen Verkauf ist kein passender Lagerbestand vorhanden.');
    return;
  }

  const ctx = contractOfferContext();
  if (!ctx.lot || Number(ctx.lot.quantity || 0) <= 0) {
    gameAlert('Für diesen Verkauf ist kein passender Lagerbestand vorhanden.');
    return;
  }
  if (ctx.quantity <= 0 || ctx.quantity > Number(ctx.lot.quantity || 0)) {
    gameAlert(`Die Vertragsmenge darf höchstens ${num(ctx.lot.quantity || 0)} betragen.`);
    return;
  }
  if (!ctx.freight?.sufficient) {
    gameAlert(`Nicht genügend Transportcontainer. Benötigt: ${num(ctx.quantity)}, verfügbar: ${num(ctx.freight?.available || 0)}`);
    return;
  }

  const { error }=await sb.rpc('create_contract_quality',{
    p_proposer_company_id:state.company.id,
    p_seller_company_id:state.company.id,
    p_buyer_company_id:partner,
    p_product_id:type==='product' ? item : null,
    p_material_id:type==='material' ? item : null,
    p_quality:ctx.quality,
    p_quantity:ctx.quantity,
    p_unit_price:ctx.price
  });
  if(error) gameAlert(error.message); else await loadCompany();
});
window.acceptContract=async id=>{
  const {error}=await sb.rpc('accept_and_fulfill_contract',{p_contract_id:id});
  if(error) gameAlert(error.message); else await loadCompany();
};
window.rejectContract=async id=>{
  const {error}=await sb.rpc('reject_contract',{p_contract_id:id});
  if(error) gameAlert(error.message); else await loadCompany();
};
window.cancelContract=async id=>{
  const {error}=await sb.rpc('cancel_contract',{p_contract_id:id});
  if(error) gameAlert(error.message); else await loadCompany();
};



document.addEventListener('click', event => {
  const button = event.target.closest('.password-toggle');
  if (!button) return;

  const input = document.getElementById(button.dataset.passwordTarget || '');
  if (!input) return;

  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.setAttribute('aria-label', show ? 'Passwort verbergen' : 'Passwort anzeigen');
  button.setAttribute('title', show ? 'Passwort verbergen' : 'Passwort anzeigen');
  button.textContent = show ? '🙈' : '👁';
});

document.getElementById('accountEditBtn')?.addEventListener('click', () => {
  setAccountEditMode(true);
});

document.getElementById('accountEditCancelBtn')?.addEventListener('click', () => {
  setAccountEditMode(false);
});

document.getElementById('accountEditForm')?.addEventListener('submit', updateAccountData);

document.getElementById('pushEnabled')?.addEventListener('change', async event => {
  const enabled = event.target.checked;
  event.target.disabled = true;
  try {
    if (enabled) {
      const ok = await enablePushNotifications();
      event.target.checked = ok;
    } else {
      await disablePushNotifications();
    }
  } catch (error) {
    console.error('Push:', error);
    event.target.checked = !enabled;
    setPushStatus(`Push-Benachrichtigungen konnten nicht geändert werden: ${error.message || error}`, 'error');
  } finally {
    event.target.disabled = false;
  }
});

window.addEventListener('hashchange', openViewFromHash);
window.addEventListener('popstate', openViewFromHash);

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    touchPresence();
    refreshCompanyBalance();
    updateMarketRefreshTimer();
    if (document.getElementById('market')?.classList.contains('active-view')) {
      await loadGameData();
    }
  }
});


const customSelectDocumentObserver = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach(node => {
      if (!(node instanceof Element)) return;
      if (node.matches?.('select')) enhanceCustomSelect(node);
      enhanceAllCustomSelects(node);
    });
  }
});
customSelectDocumentObserver.observe(document.documentElement, { childList: true, subtree: true });


init();


const DASHBOARD_HISTORY_METRICS = {
  cash_balance: {
    label: 'Kontostand',
    historyValue: row => Number(row.cash_balance || 0),
    currentValue: () => Number(state.company?.cash_balance || 0)
  },
  company_value: {
    label: 'Unternehmenswert',
    historyValue: row => Number(row.company_value || 0),
    currentValue: () => Number(state.company?.company_value || 0)
  },
  storage_value: {
    label: 'Lagerwert',
    historyValue: row => Number(row.material_value || 0) + Number(row.product_value || 0),
    currentValue: () => Number(currentStorageValue() || 0)
  },
  patent_value: {
    label: 'Patentwert',
    historyValue: row => Number(row.patent_value || 0),
    currentValue: () => Number(state.company?.patent_value || 0)
  },
  loan_debt: {
    label: 'Schulden',
    theme: 'debt',
    historyValue: row => Number(row.loan_debt || 0),
    currentValue: () => Math.max(0, Number(state.companyDebt || 0))
  },
  building_value: {
    label: 'Gebäudewert',
    historyValue: row => Number(row.building_value || 0),
    currentValue: () => Number(currentCompanyBuildingValue() || 0)
  }
};

function dashboardHistoryDateLabel(value, withToday = false) {
  if (withToday) return translateUiString('Heute');
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString(uiLocale(), { day: '2-digit', month: '2-digit' });
}

function dashboardHistorySvg(points, metricLabel, metricKey) {
  if (!points.length) return `<p class="muted">${translateUiString('Keine Verlaufsdaten verfügbar.')}</p>`;

  const width = 760;
  const height = 330;
  const pad = { left: 72, right: 24, top: 24, bottom: 52 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const values = points.map(p => Number(p.value || 0));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const spread = Math.max(1, Math.abs(max) * 0.08);
    min -= spread;
    max += spread;
  } else {
    const spread = (max - min) * 0.12;
    min -= spread;
    max += spread;
  }

  const x = i => pad.left + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW);
  const y = value => pad.top + ((max - value) / (max - min)) * chartH;
  const polyline = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');

  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const ratio = i / 4;
    const value = max - ratio * (max - min);
    const yy = pad.top + ratio * chartH;
    return `
      <line x1="${pad.left}" y1="${yy}" x2="${width-pad.right}" y2="${yy}" class="dashboard-chart-grid"/>
      <text x="${pad.left-10}" y="${yy+4}" text-anchor="end" class="dashboard-chart-axis">${new Intl.NumberFormat(uiLocale(), { notation:'compact', maximumFractionDigits:1 }).format(value)}</text>
    `;
  }).join('');

  const labels = points.map((p, i) => {
    const xx = x(i);
    return `<text x="${xx}" y="${height-18}" text-anchor="middle" class="dashboard-chart-axis">${p.label}</text>`;
  }).join('');

  const dots = points.map((p, i) => {
    const xx = x(i);
    const yy = y(p.value);
    const title = `${p.fullLabel}: ${money(p.value)}`;
    return `
      <g class="dashboard-chart-point" tabindex="0"
         data-history-index="${i}"
         data-history-value="${Number(p.value || 0)}"
         data-history-label="${p.fullLabel.replace(/"/g, '&quot;')}"
         aria-label="${title}">
        <circle cx="${xx}" cy="${yy}" r="7"></circle>
        <title>${title}</title>
      </g>
    `;
  }).join('');

  const areaPoints = [
    `${x(0).toFixed(1)},${(pad.top + chartH).toFixed(1)}`,
    ...points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`),
    `${x(points.length - 1).toFixed(1)},${(pad.top + chartH).toFixed(1)}`
  ].join(' ');

  return `
    <div class="dashboard-history-chart-scroll ${metricKey === 'loan_debt' ? 'dashboard-history-debt' : ''}">
      <svg class="dashboard-history-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${metricLabel}: Verlauf der letzten 7 Tage">
        ${gridLines}
        <polygon points="${areaPoints}" class="dashboard-chart-area"/>
        <line x1="${pad.left}" y1="${pad.top+chartH}" x2="${width-pad.right}" y2="${pad.top+chartH}" class="dashboard-chart-axis-line"/>
        <polyline points="${polyline}" class="dashboard-chart-line" fill="none"/>
        ${dots}
        ${labels}
      </svg>
    </div>
  `;
}


function selectDashboardHistoryPoint(point) {
  if (!point) return;

  document.querySelectorAll('#dashboardHistoryChart .dashboard-chart-point.is-selected')
    .forEach(el => el.classList.remove('is-selected'));

  point.classList.add('is-selected');

  const value = Number(point.dataset.historyValue || 0);
  const label = point.dataset.historyLabel || '';
  const selected = document.getElementById('dashboardHistorySelected');
  if (!selected) return;

  selected.innerHTML = `
    <span>${label}</span>
    <strong>${money(value)}</strong>
  `;
  selected.classList.remove('hidden');
}

function wireDashboardHistoryPoints() {
  document.querySelectorAll('#dashboardHistoryChart .dashboard-chart-point').forEach(point => {
    point.addEventListener('click', event => {
      event.stopPropagation();
      selectDashboardHistoryPoint(point);
    });

    point.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectDashboardHistoryPoint(point);
      }
    });
  });
}

async function openDashboardHistory(metricKey) {
  const config = DASHBOARD_HISTORY_METRICS[metricKey];
  const modal = document.getElementById('dashboardHistoryModal');
  const title = document.getElementById('dashboardHistoryTitle');
  const subtitle = document.getElementById('dashboardHistorySubtitle');
  const current = document.getElementById('dashboardHistoryCurrent');
  const chart = document.getElementById('dashboardHistoryChart');

  if (!config || !modal || !state.company?.id) return;

  const label = translateUiString(config.label);
  const dialog = modal.querySelector('.dashboard-history-dialog');
  dialog?.classList.toggle('dashboard-history-dialog-debt', metricKey === 'loan_debt');

  title.textContent = label;
  subtitle.textContent = translateUiString('Entwicklung der letzten 7 Tage');
  current.innerHTML = `<span>${translateUiString('Aktueller Wert')}</span><strong>${money(config.currentValue())}</strong>`;
  const selected = document.getElementById('dashboardHistorySelected');
  if (selected) {
    selected.classList.add('hidden');
    selected.innerHTML = '';
  }
  chart.innerHTML = `<p class="muted">${translateUiString('Verlauf wird geladen …')}</p>`;

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('dashboard-history-open');
  document.getElementById('dashboardHistoryClose')?.focus();

  const { data, error } = await sb
    .from('company_valuation_history')
    .select('valuation_date,cash_balance,material_value,product_value,building_value,patent_value,loan_debt,company_value')
    .eq('company_id', state.company.id)
    .order('valuation_date', { ascending: false })
    .limit(7);

  if (error) {
    console.error('Dashboard-Verlauf:', error);
    chart.innerHTML = `<p class="status error">${error.message}</p>`;
    return;
  }

  const history = [...(data || [])].reverse();
  const points = history.map(row => ({
    value: config.historyValue(row),
    label: dashboardHistoryDateLabel(row.valuation_date),
    fullLabel: new Date(`${row.valuation_date}T12:00:00`).toLocaleDateString(uiLocale(), { day:'2-digit', month:'2-digit', year:'numeric' })
  }));

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  if (history.length && history[history.length - 1]?.valuation_date === todayKey) {
    points[points.length - 1] = {
      value: config.currentValue(),
      label: dashboardHistoryDateLabel(todayKey, true),
      fullLabel: translateUiString('Heute')
    };
  } else {
    points.push({
      value: config.currentValue(),
      label: dashboardHistoryDateLabel(todayKey, true),
      fullLabel: translateUiString('Heute')
    });
  }

  while (points.length > 7) points.shift();
  chart.innerHTML = dashboardHistorySvg(points, label, metricKey);
  wireDashboardHistoryPoints();
}

function closeDashboardHistory() {
  const modal = document.getElementById('dashboardHistoryModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('dashboard-history-open');
}

document.querySelectorAll('.dashboard-history-card').forEach(card => {
  card.addEventListener('click', () => openDashboardHistory(card.dataset.dashboardHistory));
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDashboardHistory(card.dataset.dashboardHistory);
    }
  });
});

document.getElementById('dashboardHistoryClose')?.addEventListener('click', closeDashboardHistory);
document.getElementById('dashboardHistoryModal')?.addEventListener('click', event => {
  if (event.target?.id === 'dashboardHistoryModal') closeDashboardHistory();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.getElementById('dashboardHistoryModal')?.classList.contains('hidden')) {
    closeDashboardHistory();
  }
});

