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

## Nachtrag M2 A0/A1 (für A2)
- Struktur: world.ts (CityWorld, Systeme in GDD-4-Reihenfolge) auf gemeinsamem SimState (state.ts: Pools, Zellzähler, ct CivilianTraits, zt ZombieTraits, corpses, routine, zones, noise, density, flow, outbreak, infection, counters, placeAround). world-setup.ts (Bewohner, Spawns, Zentrum), horde/goals.ts (Zombie-Ziele mit Hysterese), population/routine-move.ts.
- infection/: attack.ts (Angriffe, hitCivilian, killCivilian, removeCivilian, initCivilian), incubation.ts (startOutbreak, Verwandlung, aufstehende Leichen, Infektionsfeld), outbreak.ts (Patient Null, Verlangsamung, Reifegrad, Tabelle), corpses.ts.
- horde/: zombie-traits.ts (Typtabellen, spawnZombie, killZombie), zombie-density.ts (Anzahl/Schwerpunkt je 16-m-Zelle jeden Tick, für Wahrnehmung und Abstoßung), screamer.ts. Lärm: systems/noise.ts (Abklingen alle 20 Ticks).
- Zustände: pool.kind = Verhalten (CS_* in population/civilian-traits.ts); Infektion getrennt in ct.turnTick (>= 0 infiziert), writeCivilians schreibt Infizierte als incubating. Heute gesetzt nur sheltered (zones.tryShelter, noch von keiner Bewegung aufgerufen) und panic/alerted (zones.breach/remove). Treffer setzt ct.panic = 1. Panik-Logik fehlt.
- population/zones.ts: feste Slots, zoneOfCell, Korridor-Maske, Führungsmaske guided (16 m), Kapazität aus Gebäudezellen, Breach, publish (Version höchstens alle 20 Ticks), views(). Befehle in applyCommand verdrahtet, ungetestet. debugField('safety') = null.
- A2-Einhaken: Wahrnehmung/Panik als Schritt 5 am Anfang von step über s.density.query und s.noise.sample, gestaffelt (CIVILIAN_ALERT.scanIntervalTicks). Stadtalarm outbreak.startTick + cityAlarmDelayS. Fluchtbewegung nach moveRoutine; Routine bewegt nur kind == routine. Unbegleitete Alarmierte nach Hause über routine.home-Felder.
- Sicherheitsfeld: eigener CostFieldSolver (pathing/cost-field.ts) mit eigenem Kosten-Array: stepCost x 4, Korridor x corridorCostFactor, Abstoßung aus density + 30 m. Kosten nur zwischen Jobs ändern. Doppelpuffer Richtungen. Start bei zones.goalsVersion-Wechsel oder alle recomputeEveryTicks, Saat zones.goalCells, Budget SAFETY_FIELD.cellsPerTick.
- Zähler: sheltered über zones.tryShelter/leave/Freigabe; incubating, civiliansDead in attack.ts; zombiesKilled killZombie; outbreakTick startOutbreak. Neue Arrays in world.hash.
- Leistung: Ausbruch ~2 ms; + 30.000 Zombies 12,8 ms avg, p95 17,5 ms (Separation ~10 ms). Mess-Skript scratchpad/ob.mts (EXTRA, TICKS).
- Fallen: Free-List LIFO (Tests: s.placed[0], nicht Slot 0). Zivilisten nur über removeCivilian entfernen, Zombies nur über spawnZombie/initZombie. applyCommand setzt s.tick = max(s.tick, cmd.tick). zones.rebuild erzeugt Closures (nur bei Änderung). findTarget überspringt Inkubierende.

## Nachtrag M2 A2/A3
- Neu: pathing/safety-field.ts (eigener CostFieldSolver, Doppelpuffer, Debug 255 an Zone bis 1, 0 unerreichbar; Neustart nur bei Zieländerung oder Zombie-Maske in ≥ 12 groben Zellen, Kostenpass über mehrere Ticks), population/perception.ts (Schritt 5, gestaffelt), population/flight-move.ts. s.safety auf SimState; perceive zuerst in step, moveFlight nach moveRoutine.
- Regeln: unwissende Routine-Zivilisten ignorieren Zombies; gewarnte verstecken sich zuhause, Zombies brechen ein (0,5 je Angriff, Türlärm); Inkubierende verhalten sich normal; Rennen nur unter Bedrohung, Ausdauer 15 s bei 5 m/s, Erholung 0,25/s; Stadtalarm 30 s + bis 180 s gestaffelt, 70 % folgen; Führung bleibt nach Eintritt in Führungsbereich; Korridor-Führung 100 m.
- Viral vorläufig: infectChance 0,6, Inkubation 10–30 s, Patient Null 1,8 m/s (siehe DECISIONS).
- Leistung: volle Ausbreitung bis 19.800 Zombies 6,0 ms avg; + 30.000 extra 12–14 ms avg, p95 ≤ 18 ms.
- Tests: infection/spread.test.ts (~90 s), civilians.test.ts (~50 s) – schwer, ggf. getrennt laufen lassen.
