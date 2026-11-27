# Plan M5b: Auftragssystem statt RTS (Einschub vor M5-Abschluss)

Anlass: Entscheidung des Menschen 2026-11-27 (DECISIONS): kein RTS, nur Befehle. GDD-Bezug: 2 (kein Mikromanagement), 9 (Infanterie besetzt Gebäude, Deckung +50 %, Haltungen), 7 (Sicht: Höhe), 14 (wird durch Auftragssystem ersetzt, PROPOSALS).

## Ziel
- Trupps werden in eine Reserve am HQ gekauft. Der Spieler gibt Aufträge: Linie verteidigen, Zone halten, Gebäude besetzen. Die Sim teilt Trupps aus der Reserve zu, verteilt sie und ersetzt Verluste.
- Gebäude besetzen: Trupp verschwindet im Gebäude, feuert aus dem Gebäude, Deckung und Sichtbonus nach Stockwerken, Zombies setzen dem Gebäude zu (Integrität), bei 0 muss die Besatzung raus.
- Keine Einheitenauswahl/Rechtsklick-Bewegung in der UI. Feuerunterstützung (Mörser) bleibt als Zielklick.

## Schnittstellen (Hauptagent, fertig)
- Befehle DefendLine, HoldZone, OccupyBuilding, UpdateOrder, CancelOrder (SquadRequest je Typ, Stance). MoveUnits bleibt intern (Bots/Sandbox), UI nutzt ihn nicht.
- src/core/types/orders.ts: OrderView, ReserveView, GarrisonView. SimWorld.ordersVersion, orders(). Worker sendet 'orders', SimView.orders/reserve/garrisons.

## Pakete
| Paket | Agent | Inhalt |
|---|---|---|
| A Aufträge | sim-engine | Reserve, Zuteilung, Verteilung entlang Linie/Zone, Gebäudebesatzung mit Integrität, Ersatz, Rückkehr, Haltungen je Auftrag, Hash/Serialize |
| B UI | gameplay-ui | Auftragswerkzeuge (Linie ziehen, Zone aufziehen, Gebäude anklicken) mit Stärke-Auswahl je Typ, Auftragsliste/-panel, Reserve-Anzeige, Darstellung besetzter Gebäude, Entfernen von Auswahl/Rechtsklick-Bewegen, Tutorial Lektion 1 auf Aufträge umschreiben |
| C Tests | qa-review | Aufträge halten eine Straße (wie M3-Abnahme, aber nur per Auftrag), Gebäudebesatzung, Ersatz aus Reserve; dann M5-Abnahme fortsetzen |
