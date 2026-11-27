# Logbuch SPERRZONE
Format: Zeit | Meilenstein | wer | Typ | was | Dateien | Ergebnis
2026-11-26 15:38 | M0 | hauptagent | START | Session und Meilenstein M0 Fundament begonnen | - | -
2026-11-26 15:38 | M0 | hauptagent | FERTIG | Prompt ab Abschnitt 1 als GDD abgelegt, CLAUDE.md, Regeln, Agent-Dateien, Hook angelegt | docs/GAME_DESIGN.md CLAUDE.md .claude/ | 1694 Zeilen GDD
2026-11-26 15:41 | M0 | hauptagent | FERTIG | Projektgerüst und Core-Schnittstellen (RNG, Hash, Befehle, Events, Loop, SimHost, Worker, SimClient, Speicher) | package.json tsconfig.json biome.json src/core/ src/main.ts index.html | noch ohne Tests
2026-11-26 15:41 | M0 | hauptagent | PLAN | Plan M0 mit Paketen A1 B1 B2 C1 C2 C3 D | docs/plans/M0.md | -
2026-11-26 15:41 | M0 | hauptagent | ENTSCHEIDUNG | 9 Annahmen (GDD-Formatierung, Testorte, Agententyp, kein Remote u. a.) | docs/DECISIONS.md | -
2026-11-26 15:42 | M0 | sim-engine | AUFTRAG | Paket A1 Dummy-Welt, Trig-Tabelle, Tests | src/sim/ | -
2026-11-26 15:43 | M0 | gameplay-ui | AUFTRAG | Pakete B1 Renderer mit Kamera und Testraster, B2 Hauptmenü, Einstellungen, Leistungsanzeige, i18n | src/render/ src/ui/ src/data/ | -
2026-11-26 15:43 | M0 | qa-review | AUFTRAG | Paket C1 Core-Tests (RNG, Hash, Befehle, Loop, Events, Speicher, SimHost) | tests/core/ | -
2026-11-26 15:43 | M0 | hauptagent | COMMIT | Gerüst, GDD, Agenten-Setup, Core-Schnittstellen | - | 8d779b4
2026-11-26 15:44 | M0 | qa-review | FERTIG | Paket C1 Core-Tests, 7 Dateien | tests/core/ | 78/78 grün, keine Fehler in src/core
2026-11-26 15:44 | M0 | hauptagent | FIX | Kommentar in versioned-storage korrigiert, Verhalten war richtig, Beschreibung falsch | src/core/save/versioned-storage.ts | -
2026-11-26 15:44 | M0 | qa-review | AUFTRAG | Paket C1b Tests für Snapshot-Layout und Headless-Runner | tests/core/ | -
2026-11-26 15:45 | M0 | qa-review | FERTIG | Paket C1b Snapshot- und Headless-Tests | tests/core/ | 96/96 grün
2026-11-26 15:45 | M0 | hauptagent | COMMIT | Core-Tests C1 und C1b | tests/core/ | 6c888df
2026-11-26 15:45 | M0 | qa-review | AUFTRAG | Paket C2 Determinismus-Test 6000 Ticks und Benchmark-Gerüst | tests/determinism.test.ts bench/ | -
2026-11-26 15:45 | M0 | gameplay-ui | FERTIG | Pakete B1 Renderer und B2 UI | src/render/ src/ui/ src/data/menu.ts src/data/i18n/ | Biome und tsc sauber, im Browser ungetestet
2026-11-26 15:46 | M0 | sim-engine | FERTIG | Paket A1 Dummy-Welt, Wander-System, Trig-Tabelle ohne Math.sin | src/sim/ | 16 Tests grün, 30.000 Agenten 1,1 ms pro Tick
2026-11-26 15:46 | M0 | hauptagent | ABNAHME | Sichtprüfung im Browser (Playwright): Hauptmenü, Testraster, Agenten, Zoom, 20 Ticks pro Sekunde | - | bestanden, FPS im Container nur Software-Rendering
2026-11-26 15:46 | M0 | hauptagent | COMMIT | Dummy-Welt, Renderer, UI | src/sim/ src/render/ src/ui/ src/data/ | 57a711a
2026-11-26 15:46 | M0 | qa-review | FERTIG | Paket C2 Determinismus-Test 6000 Ticks und Benchmark mit Referenz | tests/determinism.test.ts bench/ | 102 Tests grün, Bench 30.000 Agenten 0,93 ms Schnitt, Streuung 1,8 %
2026-11-26 15:46 | M0 | hauptagent | COMMIT | Determinismus-Test und Benchmark | tests/ bench/ | f76adc8
2026-11-26 15:46 | M0 | qa-review | AUFTRAG | Paket C3 Review A1 Dummy-Welt, B1 Renderer, B2 UI gegen Regeln | src/sim/ src/render/ src/ui/ src/data/ | -
2026-11-26 15:46 | M0 | gameplay-ui | AUFTRAG | Paket B3 lokale Schriften Inter und JetBrains Mono | src/ui/ | -
2026-11-26 15:46 | M0 | gameplay-ui | FERTIG | Paket B3 Inter und JetBrains Mono lokal, latin-Subset | src/ui/app.tsx src/ui/styles.css | Build sauber, 94 kB woff2, keine externen Requests
2026-11-26 15:46 | M0 | hauptagent | COMMIT | Lokale Schriften | src/ui/ | 900ee26
2026-11-26 15:49 | M0 | qa-review | REVIEW | A1, B1, B2 geprüft | docs/progress/M0.md | bestanden, keine Blocker, 6 niedrige Punkte
2026-11-26 15:49 | M0 | hauptagent | ABNAHME | Alle sechs Kriterien von M0 geprüft | docs/progress/M0.md | bestanden
2026-11-26 15:49 | M0 | hauptagent | COMMIT | Bericht M0 | docs/ | 14bae3f
2026-11-26 15:49 | M0 | hauptagent | STOPP | M0 abgeschlossen. Nächster Schritt: M1 Stadt und Horde, Plan docs/plans/M1.md anlegen | - | -
2026-11-26 15:52 | M0 | hauptagent | COMMIT | Alle M0-Commits nach GitHub TheDaysBefore gepusht, Branch main | - | 30f960e
2026-11-26 15:57 | M0 | hauptagent | FIX | Pages zeigte kein Bild, weil Quellcode statt Build ausgeliefert wurde. Workflow baut und deployt dist/ | .github/workflows/pages.yml | Build unter Unterpfad lokal geprüft
2026-11-26 15:58 | M0 | hauptagent | FIX | CI-Test fehlgeschlagen, weil leere Ordner wie src/ai nicht im Repo landen. Platzhalter .gitkeep angelegt | src/**/.gitkeep | -
2026-11-26 15:59 | M0 | hauptagent | ABNAHME | Pages-Workflow grün: Lint, 118 Tests, Build, Deploy | .github/workflows/pages.yml | bestanden
2026-11-26 16:01 | M1 | hauptagent | START | Meilenstein M1 Stadt und Horde in derselben Session wie M0 begonnen | - | -
2026-11-26 16:01 | M1 | hauptagent | ENTSCHEIDUNG | Mensch wünscht M1 in derselben Session trotz Regel ein Meilenstein pro Session | docs/DECISIONS.md | -
2026-11-26 16:04 | M1 | hauptagent | PLAN | Plan M1 mit A1-A3, B1-B4, C1-C3; Schnittstellen map, snapshot v2, sim v2, messages | docs/plans/M1.md src/core/types/ src/data/city/ src/data/agents/ | -
2026-11-26 16:04 | M1 | sim-engine | AUFTRAG | A1 Stadtgenerator, danach A2 Horde mit Flow-Fields und echter Welt | src/sim/ | -
2026-11-26 16:04 | M1 | gameplay-ui | AUFTRAG | B1 Kartenrender, B2 Agenten, B3 Dichte-Textur, B4 Debug und HUD | src/render/ src/ui/ src/data/ | -
2026-11-26 16:04 | M1 | qa-review | AUFTRAG | C1 Tests an Schnittstellen v2 anpassen, C2 Benchmark-Szenarien vorbereiten | tests/ bench/ | -
2026-11-26 16:04 | M1 | hauptagent | COMMIT | M1-Schnittstellen (lokal, nicht gepusht bis Build grün) | src/core/ | 9c30fe3
2026-11-26 16:06 | M1 | qa-review | FERTIG | C1 Core-Tests auf v2 umgestellt, C2 Bench-Szenarien medium-30k-10k und gen-medium vorbereitet | tests/core/ bench/run.ts | 108 Tests grün, Determinismus-Test wartet auf echte Welt
2026-11-26 16:06 | M1 | hauptagent | ENTSCHEIDUNG | Mensch: Meilensteine nacheinander durcharbeiten bis zum Limit, ohne Stopp nach jedem Meilenstein | docs/DECISIONS.md | -
2026-11-26 16:11 | M1 | gameplay-ui | FERTIG | B1 Kartenrender in Kacheln mit 3D-Wirkung, B2 Agenten per ID, B3 Dichte-Textur, B4 Overlays O, Debug-Panel F10 | src/render/ src/ui/ src/data/render.ts src/data/dev/debug-spawn.ts | Biome und tsc sauber, mit Fixture geprüft
2026-11-26 16:11 | M1 | qa-review | AUFTRAG | C3a Review B1-B4 | src/render/ src/ui/ | -
2026-11-26 16:12 | M1 | gameplay-ui | AGENT-NEU | Übergabe gesichert, Kontext bei 200.000 Tokens voll; nächster Auftrag geht an frischen Agenten | docs/handover/gameplay-ui.md | -
2026-11-26 16:13 | M1 | qa-review | REVIEW | B1-B4 bestanden mit Auflagen: Taste Z, Dichte zählt alle statt sichtbare, Esc doppelt, Farbenblind, Slot-Sprung, Debug im Release, verstreute Werte | docs/progress/M1.md | 0 Blocker, 2 mittel, 5 niedrig
2026-11-26 16:13 | M1 | gameplay-ui | AUFTRAG | B5 Review-Auflagen B1-B4 beheben (frischer Agent mit Übergabe) | src/render/ src/ui/ src/data/ | -
2026-11-26 16:14 | M1 | qa-review | AGENT-NEU | Übergabe gesichert, Kontext bei 215.000 Tokens voll; nächster Auftrag geht an frischen Agenten | docs/handover/qa-review.md | -
2026-11-26 16:14 | M1 | gameplay-ui | FERTIG | B5 sieben Review-Auflagen behoben (Taste J, Dichte nach sichtbaren, Esc einmal, Formen Raute/Punkt, Sprung > 10 m, Debug nur Dev oder Einstellung, Werte zentral) | src/render/ src/ui/ src/data/ | Biome, tsc, vite build sauber
2026-11-26 16:24 | M1 | sim-engine | FERTIG | A1 Stadtgenerator 7 Schritte mit Prüfregeln, A2 Horde mit Pool, Flow-Field, Separation, Dichtecap | src/sim/map/ src/sim/horde/ src/sim/world.ts | 31 Tests grün, Generierung mittel 45-60 ms, 30.000 Zombies + 20.000 Zivilisten 7-10 ms pro Tick
2026-11-26 16:25 | M1 | sim-engine | AGENT-NEU | Übergabe gesichert, Kontext bei 260.000 Tokens | docs/handover/sim-engine.md | -
2026-11-26 16:25 | M1 | hauptagent | ABNAHME | Browser: Stadt mit Flüssen, Brücken, Bezirken, H-Krankenhaus; 30.000 Zombies + 20.000 Zivilisten, 20 Ticks/s, Tick 9,6 ms | - | teilweise, Alltag und Bench offen
2026-11-26 16:25 | M1 | sim-engine | AUFTRAG | A3 Zivilisten-Alltag, Werte LAYOUT/ENGINE nach src/data (Ausnahme Dateibesitz für diese zwei Dateien) | src/sim/ src/data/city/generator.ts src/data/agents/horde.ts | -
2026-11-26 16:25 | M1 | qa-review | AUFTRAG | Determinismus-Test auf echte Welt, Bench C2, Review A1/A2 | tests/ bench/ docs/progress/M1.md | -
2026-11-26 20:11 | M1 | hauptagent | FEHLER | 5-Stunden-Nutzungslimit erreicht (Reset 20:10 UTC). sim-engine stoppte in A3 beim Verschieben von LAYOUT/ENGINE, qa-review vor dem Benchmark | - | Arbeit beider Agenten ungeprüft im Arbeitsbaum
2026-11-26 20:11 | M1 | hauptagent | STOPP | Nächster Schritt: A3 (Zivilisten-Alltag, Datenverschiebung) und qa-review (Determinismus-Test, Bench, Review A) fortsetzen, dann M1-Abnahme, Merge nach main | docs/plans/M1.md docs/handover/ | -
2026-11-26 20:11 | M1 | hauptagent | START | Limit zurückgesetzt, sim-engine (A3) und qa-review (Determinismus, Bench, Review A) werden fortgesetzt | - | -
2026-11-26 20:15 | M1 | qa-review | FERTIG | Determinismus-Test auf echte Welt (small, 6000 Ticks), Bench C2, Test Horde fließt zu Zivilisten | tests/determinism.test.ts tests/horde-flow.test.ts bench/ | 149 Tests grün, 30.000 Z + 20.000 Ziv avg 9,1 ms p95 11,1 ms, gen-medium 136-151 ms
2026-11-26 20:15 | M1 | qa-review | REVIEW | A1/A2 bestanden mit Auflagen: Generator-Literale in src/sim/map nach LAYOUT, magische Zahl zombie-move.ts:121, Zivilisten nutzen Zombie-Dichte | docs/progress/M1.md | 0 Blocker
2026-11-26 20:24 | M1 | sim-engine | FERTIG | A3 Zivilisten-Alltag mit gemeinsamen Flow-Fields je Kategorie und Cluster, Review-A-Auflagen behoben, Werte in src/data | src/sim/population/ src/sim/pathing/ src/data/ | 40 Sim-Tests grün, Tick 11,2-12,2 ms, Bench-Referenz von anderer Maschine
2026-11-26 20:24 | M1 | qa-review | AUFTRAG | horde-flow-Test an Alltag anpassen, Bench-Referenz auf dieser Maschine neu, Review A3 | tests/ bench/ docs/progress/M1.md | -
2026-11-26 20:28 | M1 | qa-review | REVIEW | A3 bestanden, Bench-Referenz neu (11,85 ms, gen 213 ms), horde-flow-Test angepasst | tests/ bench/ docs/progress/M1.md | 158 Tests grün
2026-11-26 20:28 | M1 | hauptagent | ABNAHME | M1 bestanden bis auf 60 FPS (im Container nicht messbar, Mensch prüft) | docs/progress/M1.md | bestanden mit Einschränkung
2026-11-26 20:28 | M1 | hauptagent | COMMIT | M1 in vier Commits, Push nach main | - | c858af4
2026-11-26 20:30 | M1 | hauptagent | STOPP | M1 auf main und Pages deployt. Nächster Schritt M2 Infektion und Zivilisten | - | -
2026-11-26 20:30 | M2 | hauptagent | START | Meilenstein M2 Infektion und Zivilisten begonnen | - | -
2026-11-26 20:32 | M2 | hauptagent | PLAN | Plan M2, Schnittstellen (Befehle, Zonen, Snapshot v3, counters) und Daten (viral, Typen, Zivilisten, Lärm) | docs/plans/M2.md src/core/ src/data/ | -
2026-11-26 20:32 | M2 | sim-engine | AUFTRAG | A0 world.ts aufteilen, A1 Infektion viral Typ 1-4, Patient Null, Leichen, Lärm; A2 Zivilisten-Zustände, Panik, Sicherheitsfeld, Zonen | src/sim/ | -
2026-11-26 20:32 | M2 | gameplay-ui | AUFTRAG | B1 Werkzeuge Korridor/Schutzzone/Sammelpunkt, Ausbruch im Debug; B2 Darstellung Zonen, Typ-Formen, Panik, Leichen, Overlays, HUD | src/render/ src/ui/ src/data/ | -
2026-11-26 20:32 | M2 | qa-review | AUFTRAG | Tests auf Snapshot v3, Abnahmetest Korridor und Ausbreitung vorbereiten, Bench outbreak-medium | tests/ bench/ | -
2026-11-26 20:32 | M2 | hauptagent | ENTSCHEIDUNG | Zwischenstände nur noch auf Branch wip, main erst nach grüner Abnahme | - | -
2026-11-26 20:35 | M2 | qa-review | FERTIG | Tests auf Snapshot v3, Abnahmetest M2 vorbereitet (RUN_M2=1), Bench outbreak-medium (BENCH_OUTBREAK=1) | tests/ bench/ | 121 grün, 3 übersprungen, Schwellen noch unkalibriert
2026-11-26 20:36 | M2 | gameplay-ui | FERTIG | B1 Werkzeuge K/Z/V, Entfernen, Ausbruch im Debug; B2 Zonen, Korridore, Typ-Formen, Panik, Leichen-Decals, Overlays, Status-HUD | src/render/ src/ui/ src/data/ | Biome, tsc, vite build sauber, keine Sichtprüfung
2026-11-26 20:36 | M2 | hauptagent | FIX | Worker sendet Zonen zusätzlich jede Sekunde, damit die Belegung aktuell bleibt | src/core/worker.ts | -
2026-11-26 20:45 | M2 | sim-engine | FERTIG | A0 world.ts aufgeteilt, A1 Infektion viral Typ 1-4, Patient Null, Leichen, Brüller, Lärmfeld | src/sim/ | 51 Sim-Tests grün, Ausbruch + 30.000 Zombies 12,8 ms avg p95 17,5 ms
2026-11-26 20:46 | M2 | sim-engine | AGENT-NEU | Übergabe nach A1 gesichert (243.000 Tokens), A2 an frischen Agenten | docs/handover/sim-engine.md | -
2026-11-26 20:46 | M2 | sim-engine | AUFTRAG | A2 Zivilisten-Zustände, Panik, Sicherheitsfeld, Zonen, Sammelpunkte | src/sim/ | -
2026-11-26 21:04 | M2 | sim-engine | FERTIG | A2 Zivilisten-Zustände, Wahrnehmung, Panik, Sicherheitsfeld, Flucht, Zonen und Breach | src/sim/pathing/safety-field.ts src/sim/population/ | 65 Sim-Tests grün, 11,2-12,6 ms avg, p95 <= 18,7 ms; Ausbreitung halb so schnell wie in A1
2026-11-26 21:04 | M2 | qa-review | AUFTRAG | Abnahmetests M2 scharf schalten und kalibrieren, horde-flow anpassen, Bench-Zählprüfung, Review A1/A2/B | tests/ bench/ docs/progress/M2.md | -
2026-11-26 21:19 | M2 | qa-review | REVIEW | Abnahme M2 teilweise: Ausbreitung zusammenhängend aber sehr langsam (27 Zombies nach 6 min), Korridor nur +1,1 % (Test it.fails); Review A/B ohne Blocker | docs/progress/M2.md tests/m2-acceptance.test.ts | 191 grün, 1 absichtlich rot
2026-11-26 21:19 | M2 | hauptagent | ENTSCHEIDUNG | Ausbreitungsziel und Korridor-Führung festgelegt | docs/DECISIONS.md | -
2026-11-26 21:19 | M2 | sim-engine | AUFTRAG | A3 Ausbreitung beschleunigen (Zuhause nicht sicher, Inkubierende mischen sich, Ausdauer), Korridor-Führung; Review-A-Literale | src/sim/ src/data/ | -
2026-11-26 21:20 | M2 | gameplay-ui | AUFTRAG | B3 Review-B-Punkte: Korridor-Punktgrenze, Löschen mit Bestätigung/Rückgängig, Leichen-Signatur, Last bei vielen Leichen | src/render/ src/ui/ src/data/ | -
2026-11-26 21:20 | M2 | qa-review | AGENT-NEU | Kontext 264.000 Tokens, nächster Prüfauftrag an frischen Agenten mit docs/handover/qa-review.md | - | -
2026-11-26 21:21 | M2 | gameplay-ui | FERTIG | B3 Korridor-Punktgrenze, Zone löschen mit 4 s Rückgängig und Einstellung, Leichen-Signatur als Zahlen-Hash, keine Allokation im Frame | src/render/ src/ui/ src/data/ | Biome, tsc, vite build sauber
2026-11-26 21:21 | M2 | gameplay-ui | AUFTRAG | B4 Kamera-Culling für Agenten-Sprites | src/render/layers/ | -
2026-11-26 21:22 | M2 | gameplay-ui | FERTIG | B4 Kamera-Culling im AgentSet, ohne Allokation pro Frame | src/render/layers/agent-set.ts src/data/render.ts | Übersicht 1,02 ms bei 55.230 Partikeln, Nahzoom 0,37 ms
2026-11-26 21:45 | M2 | sim-engine | FERTIG | A3 Ausbreitung (Einbruch zuhause, Inkubierende mischen sich, Ausdauer, gestaffelter Alarm), Korridor-Führung 100 m, Review-A-Punkte | src/sim/ src/data/ | 68 Sim-Tests grün; 1342-2316 Infizierte nach 5 min, 99,8 % nach 15 min; Korridor +42 bis +58 %; 12-14 ms avg mit 49.500 Zombies
2026-11-26 21:45 | M2 | hauptagent | ENTSCHEIDUNG | Viral-Werte vorläufig abweichend, Balancing in M4/M5 | docs/DECISIONS.md | -
2026-11-26 21:45 | M2 | qa-review | AUFTRAG | Frischer Agent: Abnahmetests auf neue Zeitfenster, Gesamtlauf, Bench-Referenz, Abschlussreview | tests/ bench/ docs/progress/M2.md | -
2026-11-26 21:45 | M2 | sim-engine | AGENT-NEU | Kontext 251.000 Tokens, Übergabe ergänzt; nächster Sim-Auftrag an frischen Agenten | docs/handover/sim-engine.md | -
2026-11-26 22:06 | M2 | qa-review | REVIEW | Abschluss M2: Abnahmetests kalibriert (Korridor +68 %, jeder Seed höher; >= 1.000 Infizierte nach 6000 Ticks), Bench p95 13-16 ms, Review ohne Blocker | tests/ bench/ docs/progress/M2.md | 197 Tests grün, Laufzeit 130 s
2026-11-26 22:06 | M2 | hauptagent | ABNAHME | M2 bestanden; Korridor wirkt nur an dichten Wohnblöcken außerhalb der Zonenführung, Balancing offen bis M4/M5 | docs/progress/M2.md | bestanden
2026-11-26 22:09 | M2 | hauptagent | COMMIT | M2 in fünf Commits auf main, Pages-Workflow grün (Build 2:14 min inkl. Tests) | - | fb2d410
2026-11-26 22:09 | M2 | hauptagent | STOPP | M2 auf main und Pages. Nächster Schritt M3 Kampf und Bau | - | -
2026-11-26 22:09 | M3 | hauptagent | START | Meilenstein M3 Kampf und Bau begonnen | - | -
2026-11-26 22:11 | M3 | hauptagent | PLAN | Plan M3, Schnittstellen (Befehle, combat.ts, Snapshot v4) und Daten (Einheiten Gegenwart, Bauwerke) | docs/plans/M3.md src/core/ src/data/ | -
2026-11-26 22:11 | M3 | sim-engine | AUFTRAG | A1 Einheiten, A2 Bauwerke, A3 Kollateral (frischer Agent) | src/sim/ | -
2026-11-26 22:11 | M3 | gameplay-ui | AUFTRAG | B1 HUD-Grundgerüst, Auswahl, Gruppen, Tasten, Minikarte | src/ui/ src/render/ src/data/i18n/ | -
2026-11-27 01:11 | M3 | hauptagent | FEHLER | 5-Stunden-Limit erreicht, alle drei Agenten gestoppt | - | Arbeit im Arbeitsbaum
2026-11-27 01:11 | M3 | hauptagent | START | Limit zurückgesetzt, sim-engine (A1-A3), gameplay-ui (B1), qa-review (C1) werden fortgesetzt | - | -
2026-11-27 01:16 | M3 | gameplay-ui | FERTIG | B1 obere Leiste, Befehlsleiste, Kontextpanel, Minikarte, Auswahl, Gruppen, Tasten, Platzierung | src/ui/hud/ src/ui/tools/ src/data/hud.ts | Biome, tsc, vite build sauber, nicht im Browser geprüft
2026-11-27 01:16 | M3 | gameplay-ui | AUFTRAG | B2 frischer Agent: Darstellung Einheiten, Bauwerke, Projektile, FX, Bau-Vorschau, AttackArea | src/render/ src/ui/ | -
2026-11-27 01:17 | M3 | qa-review | FERTIG | C1 Tests auf Snapshot v4, Abnahmetest M3 vorbereitet (M3_ACCEPTANCE=1), Bench combat-medium (BENCH_COMBAT=1) | tests/ bench/ | 199 grün, 6 übersprungen
2026-11-27 01:17 | M3 | hauptagent | ENTSCHEIDUNG | WorldOptions.startBudget optional; FX sammeln sich bis writeFx (kein Verlust bei Tempo > 1x) | src/core/types/sim.ts | -
2026-11-27 01:29 | M3 | gameplay-ui | FERTIG | B2 Einheiten (Symbole, Silhouetten), Bauwerke mit Zuständen, Projektile, FX mit Pools, Bau-Vorschau mit Live-Kosten, AttackArea (Taste G) mit Zivilisten-Schätzung | src/render/layers/ src/ui/tools/attack-tool.ts src/data/render-combat.ts | Biome, vite build sauber, im Harness geprüft
2026-11-27 01:29 | M3 | hauptagent | ENTSCHEIDUNG | FX-Param, Projektil-kind, Tor-flag als Konvention in combat.ts festgelegt | src/core/types/combat.ts | -
2026-11-27 01:47 | M3 | sim-engine | FERTIG | A1 Einheiten mit A*, Zielwahl, Projektile, Munition, Depots, Moral; A2 Bauwerke mit Druck, Klettern, Toren, Minen, Ladungen; A3 Kollateral | src/sim/combat/ src/sim/structures/ | 238 Tests grün, check sauber, p95 17,3-18,5 ms
2026-11-27 01:47 | M3 | qa-review | AUFTRAG | Abschluss M3: Abnahmetests scharf und kalibrieren, Bench combat-medium mit startBudget und Referenz bereinigen, Review A/B | tests/ bench/ docs/progress/M3.md | -
2026-11-27 02:18 | M3 | qa-review | REVIEW | Abschluss M3: Abnahme bestanden (0 von 300 hinter Linie, Mauer -19 % unter Druck, Kollateral 8 / 0), Bench p95 13-16,6 ms; 4 Dateien über 400 Zeilen | docs/progress/M3.md tests/ bench/ | 248 grün, 1 erwarteter Fehlschlag
2026-11-27 02:18 | M3 | hauptagent | FIX | Tests in Vitest-Projekte fast/slow getrennt, CI mit zwei parallelen Test-Jobs vor dem Build | vitest.config.ts .github/workflows/pages.yml | fast 42 s, slow 2:16 min
2026-11-27 02:18 | M3 | sim-engine | AUFTRAG | Dateien fire.ts, structures.ts, units.ts unter 400 Zeilen, PlaceUnit außerhalb der Karte ablehnen, Zones.nextId in Hash | src/sim/ | -
2026-11-27 02:18 | M3 | gameplay-ui | AUFTRAG | render/layers/structures.ts teilen, build-preview Allokation und Alpha-Werte, Befehlsleiste 1280x720, Platzieren außerhalb der Karte verhindern | src/render/ src/ui/ src/data/ | -
2026-11-27 02:19 | M3 | gameplay-ui | FIX | Review B: structures.ts geteilt (372), build-preview ohne Allokation und Werte in Daten, Befehlsleiste einzeilig bei 1280x720, kein Befehl bei unzulässiger Platzierung | src/render/ src/ui/ src/data/render-combat.ts | Biome, vite build sauber
2026-11-27 02:24 | M3 | sim-engine | FIX | fire.ts 303, units.ts 323, structures.ts 392 (neu targeting.ts, unit-damage.ts, kinds.ts, cells.ts), Hash bitgleich; PlaceUnit/PlaceStructure außerhalb der Karte oder auf Gebäude abgelehnt | src/sim/combat/ src/sim/structures/ | fast 209/210 (nur it.fails rot), Bench im Ziel
2026-11-27 02:24 | M3 | hauptagent | ENTSCHEIDUNG | Platzierung auf unzulässigen Zellen bleibt abgelehnt (kein stilles Verschieben); Bench-Raster wird angepasst | - | -
2026-11-27 02:28 | M3 | qa-review | FIX | it.fails-Marker entfernt, Bench-Gitter auf begehbare Zellen (200 Trupps), Sanity-Grenze Trupps nach Kampf 80 % | tests/m3-robustness.test.ts bench/run.ts | fast 226 grün, Bench grün
2026-11-27 02:32 | M3 | sim-engine | FIX | civilians.test.ts und combat.test.ts thematisch geteilt, corridors.test.ts langsam | src/sim/population/ src/sim/combat/ | fast 226 grün
2026-11-27 02:32 | M3 | hauptagent | ABNAHME | M3 bestanden, 252 Tests grün, alle Dateien < 400 Zeilen | docs/progress/M3.md | bestanden
2026-11-27 02:35 | M3 | hauptagent | COMMIT | M3 in fünf Commits auf main, CI grün (fast 48 s, slow 2:29 min) | - | 9821917
2026-11-27 02:35 | M3 | hauptagent | STOPP | M3 auf main und Pages. Nächster Schritt M4 Farmphase und Wirtschaft | - | -
2026-11-27 02:35 | M4 | hauptagent | START | Meilenstein M4 Farmphase und Wirtschaft begonnen | - | -
2026-11-27 02:37 | M4 | hauptagent | PLAN | Plan M4, Schnittstellen (Wirtschaftsbefehle, mission.ts, restart) und Daten economy.ts | docs/plans/M4.md src/core/ src/data/economy/ | -
2026-11-27 02:37 | M4 | sim-engine | AUFTRAG | A1 Wirtschaft, A2 Bevölkerung und Moral, A3 Phasen und Warnzeichen | src/sim/ src/data/economy/ | -
2026-11-27 02:37 | M4 | gameplay-ui | AUFTRAG | B1 Szenarien, Briefing, Ladebildschirm, Neustart; B2 HUD Ressourcen, Wirtschaft, Bevölkerung, Erlasse, Warnzeichen (frischer Agent) | src/ui/ src/render/ src/data/ | -
2026-11-27 02:37 | M4 | qa-review | AUFTRAG | C1 fake-world mission(), Abnahmetest M4 vorbereiten | tests/ | -
2026-11-27 02:39 | M4 | qa-review | FERTIG | fake-world mission(), Abnahmetest M4 vorbereitet (M4_ACCEPT=1, 5 Tests) | tests/core/fake-world.ts tests/m4-acceptance.test.ts | fast 223 grün, 5 übersprungen
2026-11-27 06:11 | M4 | hauptagent | FEHLER | 5-Stunden-Limit erreicht, sim-engine und gameplay-ui gestoppt | - | Arbeit im Arbeitsbaum
2026-11-27 06:11 | M4 | hauptagent | START | Fortsetzung nach Limit: sim-engine (A1-A3), gameplay-ui (B1/B2) | - | -
2026-11-27 06:15 | M4 | gameplay-ui | FERTIG | B1 Szenarien mit zod, Briefing, Ladebildschirm, Pausenmenü/Neustart; B2 Ressourcenleiste, Phase/Countdown, Fenster Wirtschaft/Bevölkerung/Erlasse, Warnzeichen | src/ui/ src/data/scenarios/ src/render/ | Biome, tsc, vite build grün, im Browser geprüft
2026-11-27 06:15 | M4 | hauptagent | ENTSCHEIDUNG | Kartenvorschau über core/map-worker (UI importiert kein sim); main.ts nutzt FREE_MODE; Strom = Nettobilanz | src/core/map-worker.ts src/core/map-preview.ts src/main.ts | -
2026-11-27 06:16 | M4 | gameplay-ui | FIX | Briefing-Vorschau über core/map-preview, UI importiert kein sim mehr | src/ui/screens/briefing.tsx | Biome, vite build grün, im Browser geprüft
2026-11-27 06:19 | M4 | sim-engine | FERTIG | A1-A3 Wirtschaft, Bevölkerung, Moral, Erlasse, Phasen, Warnzeichen, klassischer Start | src/sim/economy/ | fast 248 grün, M4-Abnahme 3/5 (2 Testaufbau/Balance)
2026-11-27 06:19 | M4 | hauptagent | ENTSCHEIDUNG | Miliz als eigener UnitTypeId militia (GDD 9); Patient Null soll bei Menschen erscheinen statt Testschwelle senken | src/core/commands.ts src/data/units/present.ts | -
2026-11-27 06:19 | M4 | sim-engine | AGENT-NEU | Kontext 210.000 Tokens; Nachtrag aus Bericht in Übergabe; Folgeauftrag an frischen Agenten | docs/handover/sim-engine.md | -
2026-11-27 06:19 | M4 | sim-engine | AUFTRAG | Miliz-Typ, Patient Null in Menschenmenge (<= 2400 Ticks bis Verteidigung), Panik-Erlasse | src/sim/ | -
2026-11-27 06:19 | M4 | gameplay-ui | AUFTRAG | Miliz in Render-Daten und i18n, nicht kaufbar | src/data/ src/render/ src/ui/ | -
2026-11-27 06:19 | M4 | qa-review | AUFTRAG | Abnahmetest M4 Aufbau korrigieren, Playwright-Durchlauf | tests/ docs/progress/M4.md | -
2026-11-27 06:19 | M4 | gameplay-ui | FERTIG | Miliz in Render-Daten, Symbol, i18n, aus Einheitenliste ausgeblendet | src/data/render-combat.ts src/render/layers/units.ts src/ui/hud/command-bar.tsx | tsc und Biome grün
2026-11-27 06:26 | M4 | qa-review | REVIEW | M4 headless 4/5 (rot: Ausbruch->Verteidigung > 2400 Ticks, wartet auf Sim-Fix), Playwright-Durchlauf bestanden; 3 UI-Befunde | tests/m4-acceptance.test.ts docs/progress/M4.md | teilweise
2026-11-27 06:26 | M4 | gameplay-ui | AUFTRAG | Befunde: i18n morale.success, Kamera nach Restart einpassen, Freimodus-HUD hinter Briefing ausblenden | src/ui/ src/render/ src/data/i18n/ | -
2026-11-27 06:26 | M4 | qa-review | AUFTRAG | Fehlende Tests: Restart-Pfad, zod-Szenarien, +25 % nach Ausbruch, Streik, Freiwillige | tests/ | -
2026-11-27 06:28 | M4 | gameplay-ui | FIX | morale.success i18n, Kamera passt nach Restart ein, HUD nur im Spiel | src/ui/app.tsx src/render/camera.ts src/data/ | im Browser geprüft, Biome grün
2026-11-27 06:28 | M4 | qa-review | FERTIG | m4-rules.test.ts: zod-Szenarien, Restart-Hash, +25 % nach Ausbruch, Streik, Freiwillige | tests/m4-rules.test.ts | fast 261 grün, 5 übersprungen
2026-11-27 06:30 | M4 | sim-engine | FIX | Miliz als eigener Typ, Patient Null in Menschenmenge mit erster Kette (942-1906 Ticks bis Verteidigung), Panik-Erlasse und Moral-Panik | src/sim/economy/ src/sim/infection/attack.ts src/sim/population/perception.ts | fast 261 grün, Freimodus bitgleich, Bench im Ziel
2026-11-27 06:30 | M4 | hauptagent | ENTSCHEIDUNG | Erste Infektionskette angenommen (GDD 6) | docs/DECISIONS.md | -
2026-11-27 06:35 | M4 | qa-review | REVIEW | M4-Abnahme ohne Variable grün (5/5), 295 Tests, Bench im Ziel (gen-medium streut) | tests/m4-acceptance.test.ts docs/progress/M4.md | bestanden
2026-11-27 06:35 | M4 | hauptagent | ABNAHME | M4 bestanden: Briefing -> Farmphase -> Ausbruch -> Verteidigung headless und im Browser durchgängig | docs/progress/M4.md | bestanden
2026-11-27 06:39 | M4 | hauptagent | COMMIT | M4 auf main, CI grün (fast 59 s, slow 2:45 min) | - | 7b2bc7b
2026-11-27 06:39 | M4 | hauptagent | STOPP | M4 auf main und Pages. Nächster Schritt M5 Spielbares Spiel | - | -
2026-11-27 06:39 | M5 | hauptagent | START | Meilenstein M5 Spielbares Spiel begonnen | - | -
2026-11-27 06:41 | M5 | hauptagent | PLAN | Plan M5; Schnittstellen outcome.ts, save.ts, debrief/save/load/replay im Worker, save-store mit IndexedDB und gzip; Daten scoring.ts | docs/plans/M5.md src/core/ src/data/scoring.ts | -
2026-11-27 06:41 | M5 | sim-engine | AUFTRAG | A1 Sieg/Niederlage/Wertung, A2 Auswertungsdaten, A3 serialize/restoreWorld (frischer Agent) | src/sim/ | -
2026-11-27 06:41 | M5 | gameplay-ui | AUFTRAG | B1 Pausenmenü, Speichern/Laden, Autosave, Auswertung, Einstellungen; B2 Szenarien, Schnelles Gefecht, Tutorial 1+2, Sound (frischer Agent) | src/ui/ src/render/ src/data/ | -
2026-11-27 06:41 | M5 | qa-review | AUFTRAG | C1 fake-world, Abnahme Replay-Hash, Save/Load, Siegbedingungen vorbereiten | tests/ | -
2026-11-27 06:42 | M5 | qa-review | FERTIG | fake-world debrief/serialize, Abnahme M5 vorbereitet (M5_ACCEPT=1): Replay-Hash, Save/Load bitgleich, vier Siege, zwei Niederlagen | tests/core/fake-world.ts tests/m5-acceptance.test.ts | 10 übersprungen, Rezepte teils Platzhalter
2026-11-27 06:52 | M5 | gameplay-ui | FERTIG | B1 Pausenmenü, Speicherstände, Einstellungen in 5 Reitern, Auswertung; B2 drittes Szenario, Schnelles Gefecht, Tutorial 1+2, Audio | src/ui/ src/data/ src/render/ | nur im Harness geprüft (Sim noch ohne restoreWorld)
2026-11-27 06:52 | M5 | hauptagent | ENTSCHEIDUNG | Feste Key-Listen für Wertung/Momente/Ursachen, Frame-Layout dokumentiert, ScenarioDef.unlosable für Tutorial | src/core/types/outcome.ts src/core/types/mission.ts | -
2026-11-27 06:53 | M5 | gameplay-ui | FIX | Feste Keys in i18n mit Vollständigkeitsprüfung, unlosable in Tutorial-Szenarien, K/Z/V/P frei belegbar | src/ui/ src/data/ | tsc und Biome grün
2026-11-27 07:01 | M5 | hauptagent | ENTSCHEIDUNG | Mensch wünscht übersichtlichere GUI; Analyse per Screenshot, Paket B3 HUD-Überarbeitung innerhalb GDD 14 | docs/plans/M5.md | -
2026-11-27 07:01 | M5 | gameplay-ui | AUFTRAG | B3 HUD-Überarbeitung (frischer Agent) | src/ui/ src/render/ src/data/ | -
2026-11-27 07:03 | M5 | sim-engine | FERTIG | A1 Sieg/Niederlage/Wertung, A2 Auswertungsdaten, A3 serialize/restoreWorld bitgleich | src/sim/outcome/ src/sim/save/ | 319 grün, Stand 1,17 MiB gzip, Bench im Ziel
2026-11-27 07:03 | M5 | hauptagent | ENTSCHEIDUNG | Ursachen-Keys populationLost/timeLimit/collateral/lowMorale und Momente ammoOut/firstSoldierLost ergänzt | src/core/types/outcome.ts | -
2026-11-27 07:05 | M5 | hauptagent | FIX | CAUSE_KEYS-Ergänzung nachgeholt (Ersetzen war an Formatierung gescheitert) | src/core/types/outcome.ts | -
2026-11-27 07:05 | M5 | sim-engine | FIX | Jede Niederlage außer Aufgeben hat eine Ursache, Momente ammoOut/firstSoldierLost | src/sim/outcome/ | 21 Tests grün
2026-11-27 07:16 | M5 | gameplay-ui | FERTIG | B3 HUD-Überarbeitung: Ressourcen-Chips, großer Countdown, Lage-Karte mit Zielen, Befehlsleiste mit Symbolen, Leistungsanzeige aus, neue Keys in i18n | src/ui/hud/ src/ui/styles.css src/data/ | tsc grün, 1280/1600/1920 geprüft; ein Test im ersten Lauf rot (instabil?)
2026-11-27 07:16 | M5 | hauptagent | FEHLER | Möglicher instabiler Test (3 Fehler in einer Datei im ersten Lauf, zweiter Lauf grün) – Untersuchung durch qa-review | - | -
2026-11-27 11:15 | M5 | hauptagent | FIX | Mensch hatte wip nach main gemergt (PR 1), Deploy scheiterte an Format; main stand wieder auf M4. Arbeitsstand formatiert, alle Tests grün, als M5-Zwischenstand nach main | - | fast 303, slow 29 grün
2026-11-27 11:19 | M5 | hauptagent | COMMIT | M5-Zwischenstand auf main (neue Oberfläche, Sieg/Speichern), CI grün; Sicherungs-Branch heißt jetzt backup-nicht-mergen | - | bc00bb9
2026-11-27 11:44 | M5 | hauptagent | ENTSCHEIDUNG | Mensch: kein RTS, nur Aufträge; Umbau vor M5-Abschluss | docs/DECISIONS.md docs/PROPOSALS.md | -
2026-11-27 11:44 | M5 | hauptagent | PLAN | Plan M5b Auftragssystem, Schnittstellen orders.ts und Befehle DefendLine/HoldZone/OccupyBuilding/UpdateOrder/CancelOrder | docs/plans/M5b.md src/core/ | -
2026-11-27 11:44 | M5 | sim-engine | AUFTRAG | M5b-A Auftragssystem: Reserve, Zuteilung, Linie, Zone, Gebäudebesatzung (frischer Agent) | src/sim/ src/data/orders.ts | -
2026-11-27 11:44 | M5 | gameplay-ui | AUFTRAG | M5b-B Auftragswerkzeuge, Auftragsliste, Reserve, besetzte Gebäude, Auswahl entfernen, Tutorial 1 umschreiben, B3-Nacharbeit | src/ui/ src/render/ src/data/ | -
2026-11-27 11:44 | M5 | qa-review | AUFTRAG | Instabilen Test finden, M5-Abnahme scharf, M5b-Tests vorbereiten | tests/ | -
2026-11-27 11:53 | M5 | gameplay-ui | FERTIG | M5b-B Auftrags-UI (Reserve-Kauf, Reiter Aufträge, Stärke-Dialog, Auftragsliste, Karte), Auswahl/RTS entfernt, Tutorial 1 umgeschrieben, B3-Nacharbeit | src/ui/ src/render/ src/data/ | tsc/Biome grün, nur im Harness geprüft
2026-11-27 11:53 | M5 | qa-review | REVIEW | Instabiler Test = Zeitlimit unter Last (m5-acceptance Bevölkerungs-Niederlage), kein Nicht-Determinismus; M5-Abnahme scharf (11 Tests), M5b-Tests vorbereitet; Balance: Trupps verfolgen nicht | tests/ docs/progress/M5.md | 332 grün in 4 Läufen
2026-11-27 11:53 | M5 | hauptagent | FIX | m5-acceptance ins slow-Projekt | vitest.config.ts | -
2026-11-27 12:13 | M5 | sim-engine | FERTIG | M5b-A Auftragssystem: Reserve, Zuteilung/Ersatz, Linie, Zone mit Säubern, Gebäudebesatzung mit Integrität, HQ-Verteidigung | src/sim/orders/ src/data/orders.ts | 349 grün, check ohne Fehler, Bench im Ziel
2026-11-27 12:13 | M5 | qa-review | AUFTRAG | Frischer Agent: m5b-Kontrollarm, m5-acceptance auf Aufträge, M5b scharf, Gesamtlauf | tests/ | -
2026-11-27 12:23 | M5 | qa-review | REVIEW | M5b-Tests scharf (8/8), m5-acceptance auf HoldZone/DefendLine, Bench combat-medium mit Aufträgen; 357 grün | tests/ bench/run.ts | bestanden
2026-11-27 12:23 | M5 | hauptagent | ABNAHME | M5b Auftragssystem im Browser gegen echte Sim geprüft (Kauf in Reserve, Linie verteidigen aktiv); Befund: Startmunition reicht für ~2 Trupps | - | bestanden, Balance offen
2026-11-27 12:26 | M5 | hauptagent | COMMIT | M5b Auftragssystem auf main, CI grün | - | d6f5bb3
2026-11-27 12:26 | M5 | sim-engine | AUFTRAG | Munition beim Kauf: Erstausstattung im Preis statt aus dem Lager | src/sim/ src/data/ | -
2026-11-27 12:26 | M5 | qa-review | AUFTRAG | M5-Abschluss: Tutorial-Durchlauf per Playwright ohne Hilfe, Mission bis Sieg/Niederlage, Abnahmetabelle | tests/ docs/progress/M5.md | -
2026-11-27 12:29 | M5 | sim-engine | FIX | Erstausstattung Munition im Kaufpreis, Lager nur zum Nachfüllen; Freimodus bitgleich | src/sim/combat/units.ts src/sim/economy/economy.test.ts | fast 318 grün; gen-medium +11 % Rauschen
2026-11-27 13:21 | M5 | qa-review | REVIEW | Abnahme-Durchlauf NICHT bestanden: B1 Pause endgültig, B2 Tutorial L1 hängt, B3 Autopause beim Ausbruch; diverse Hänger ohne Vorwissen; Speichern/Laden bestanden | docs/progress/M5.md | nicht bestanden
2026-11-27 13:21 | M5 | hauptagent | FIX | B1: SetGameSpeed wirkt sofort auch in der Pause, Aufgeben in der Pause läuft einen Tick | src/core/sim-host.ts | core 114 grün
2026-11-27 13:21 | M5 | gameplay-ui | AUFTRAG | Befunde Durchlauf: Tutorial L1, Autopause, Marker L2, Texte, Auftragsdialog-Standard, Verdeckung, Budget-Trend, Rückmeldung Ablehnung | src/ui/ src/data/ | -
2026-11-27 13:21 | M5 | sim-engine | AUFTRAG | Linien-Bauwerke über Straßen: begehbare Teilstücke bauen statt ablehnen | src/sim/structures/ | -
2026-11-27 13:26 | M5 | sim-engine | FIX | Linien-Bauwerke über Gebäude: nur freie Teilstücke gebaut und bezahlt | src/sim/structures/structures.ts | fast 320 grün, freie Linien bitgleich
2026-11-27 13:36 | M5 | gameplay-ui | FIX | Tutorial-Texte/Marker, Pause-Banner, Auftragsdialog halbe Reserve, Auftragsliste nicht verdeckt, Linien mit Teilstücken und Rückmeldung, Budget-Trend vorerst aus | src/ui/ src/data/ src/render/layers/build-preview.ts | Biome/tsc grün
2026-11-27 13:36 | M5 | hauptagent | FIX | Worker sendet nach SetGameSpeed und in der Pause sofort einen Snapshot (UI sah die Pause nicht) | src/core/worker.ts | -
