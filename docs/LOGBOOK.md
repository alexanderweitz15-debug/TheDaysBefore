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
