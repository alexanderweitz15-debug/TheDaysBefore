# Übergabe sim-engine (Stand M1 A1 + A2)

## Architektur
- math/trig.ts: Sin/Cos-Tabelle 4096 Einheiten, atan2Angle; nur + − × ÷ sqrt.
- map/generate.ts: terrain → main-roads → districts (mit Bahn) → blocks (rekursive Teilung) → roads (Wasser-Schnitt, Brücken, Rastern) → graph → sites (Stadion, Schlüsselorte, Evakuierung) → sewer-sectors; Ufer-Reparatur in validate.ts, Prüfung, Retry mit deriveSeed. hashCityMap.
- horde/: pool.ts (SoA, Free-List LIFO), spatial-hash.ts (8-m mit Summentabelle; CellBuckets 4 m), flow-field.ts, zombie-move.ts, engine.ts.
- world.ts (CityWorld): Karte, Bewohner, erstes Flow-Field vor Tick 0 fertig.

## Tick
Zivilisten-Hash nur bei civiliansDirty; alle 40 Ticks Zielprüfung (nur wenn kein Flow-Feld läuft); Flow-Feld mit maxCellsPerTick, Austausch am Stück; Zombie-Buckets; moveZombies: Zielsuche 25 m gestaffelt ((slot+tick)%10==0), sonst Flow, Rauschen, Separation (max 8 Nachbarn), Tempo-Klemme, Gleiten mit Zellprüfung (begehbar, < maxPerCell).

## Determinismus
Nur core/rng; Sim-Strom deriveSeed(seed, 1). Slots aufsteigend. Map/Set nie iterieren mit Wirkung. fround vor Zellberechnung, 5 % Rand beim Spawn. Kein Potenzoperator. hash(): Karten-Hash, RNG, Pools, Zellzähler, Flow-Zustand inkl. dist.

## Leistung
7–10 ms bei 30.000 Zombies + 20.000 Zivilisten; 70 % Separation in dichten Mengen; Bucket-Aufbau ~1 ms. Generierung mittel ~50 ms.

## Abweichungen vom GDD
1. Flow-Field nur neu bei Änderung der Ziel-Blöcke, dann ganze Karte (über Ticks verteilt), keine Teil-Neuberechnung je Block.
2. Separation über 4-m-Zellen statt 8-m-Hash; 8-m-Hash nur für Zivilisten.

## Offen
- A3 Zivilisten-Alltag (cell/civilianCells pflegen, civiliansDirty); Ziel-Signatur gröber machen, sonst rechnet das Flow-Field dauernd.
- LAYOUT (map/layout.ts) und ENGINE (horde/engine.ts) nach src/data; eigener Dichtewert für Zivilisten.

## Fallen
graph.ts: Brückenstücke enden exakt an Uferpunkten (4 m Überstand nur beim Malen). cellAt klemmt am Rand. Ziel-Blöcke im Flow-Field sind Flags. writeSection endet bei out.count.

## Nachtrag A3 (Zivilisten-Alltag)
- population/routine.ts, pathing/cost-field.ts: gemeinsame Flow-Fields je Kategorie (Wohnen, Arbeit, Markt) und 4x4-Cluster (medium 29 Felder, ~7 MB), Ziel Türzellen, Straßen halbe Kosten (81 % gehen auf Straßen). Einmalig mit Budget in den ersten ~95 Ticks.
- Kein Dichtelimit in der Zivilisten-Bewegung (Gegenströme blockieren sonst). Eigener Wert CIVILIAN_MOVEMENT.maxPerCell = 6 nur beim Platzieren.
- Zombie-Flow-Ziel: Signatur über Ziel-Blöcke, Hysterese 1,0/0,5, Neustart höchstens alle 400 Ticks, Auffrischung nach 1200. Zivilisten-Hash alle 5 Ticks.
- map/layout.ts und horde/engine.ts gelöscht, Werte in src/data. Nächster Leistungshebel: Separation (~10 ms von ~11,5).
