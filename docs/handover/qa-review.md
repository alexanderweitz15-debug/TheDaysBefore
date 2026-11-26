# Übergabe qa-review (Stand M1)

## Teststruktur
- tests/core/*.test.ts: rng, hash, commands, loop, events, versioned-storage, sim-host, headless, snapshot v2. 108 grün.
- tests/core/fake-world.ts: tinyMap() (valide Mini-CityMapData), FakeWorld (SimWorld v2, Aufrufprotokoll, appliedAt), createFakeWorld(seed, options). Importiert nichts aus src/sim.
- tests/determinism.test.ts: noch ALTE Schnittstelle. 6 Tests (gleicher Seed gleicher Hash nach 6000 Ticks, anderer Seed/Befehle anders, Reihenfolge egal, zwei SimHost-Hälften, SetGameSpeed ohne Wirkung auf Hash).
- bench/run.ts: SCENARIOS mit Typ "tick" (Warm-up 100, 600 Messticks, Ziel 20 ms p95, Agentenzahlen exakt) und "gen" (1 Warm-up, 3 Läufe, Ziel < 5000 ms max). medium-30k-10k (28 x 1000 Zombies, 10 x 1000 Zivilisten, 5x5-Raster, Tick 0), gen-medium. reference.json gelöscht, entsteht beim ersten Lauf. > 10 % avg schlechter = Exit 1, --update schreibt neu.

## Offene Aufträge
1. Determinismus-Test auf echte world.ts: runHeadless(createWorld, seed, {size:'small'}, 6000, cmds), SimHost(seed, options, createWorld). Einige Tausend Zombies + Zivilisten per DebugSpawn.
2. C2: pnpm bench zweimal, Streuung melden, Schwelle nie ändern, Referenz mit --update anlegen. Bei falscher Agentenzahl Bursts anpassen.
3. Review A1/A2 (Generator, Horde): Determinismus, keine Allokation in step, Werte nur in src/data, Tests je Regel, < 400 Zeilen. Ergebnis in docs/progress/M1.md.

## Werkzeuge
- Playwright: require('playwright') (oder /opt/node-tools/node_modules/playwright), chromium.launch(), Skripte .cjs im Scratchpad. Dev-Server Port 5173. Harness /src/render/dev/harness.html?z=25000.
- Screenshots /tmp/claude-0/shots, mit Read ansehen.
- pnpm vitest run tests/core 2>&1 | tail -30; npx biome check tests bench; npx tsc --noEmit. Zyklencheck cyc.mjs im Scratchpad.

## Fallen
- Loop-Deckel 16 Ticks pro advance ist gewollt: in Schritten <= 50 ms füttern.
- FPS im Container sind Software-GL, ohne Aussage.
- biome organizeImports: npx biome check --write tests bench.
- snapshot.ts: Weltmaße als Uint32 (ganzzahlig).
