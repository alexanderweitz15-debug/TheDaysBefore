# SPERRZONE
2D-Top-down-Zombie-Stadtverteidigung, Browser, TypeScript.
Spec: `docs/GAME_DESIGN.md` (lang). Index: `grep -n "^## " docs/GAME_DESIGN.md`, dann gezielt Abschnitte lesen.
Stand: `tail -40 docs/LOGBOOK.md` und neuester Plan in `docs/plans/`.

## Pflicht bei Sessionstart und nach jeder Kompaktierung
1. Logbuch-Ende lesen: `tail -40 docs/LOGBOOK.md`.
2. Aktuellen Plan `docs/plans/Mxx.md` lesen.
3. Die dort genannten GDD-Abschnitte neu lesen. Nie aus einer Zusammenfassung weiterarbeiten.
4. Logbuch-Eintrag START oder KOMPAKT schreiben.

## Logbuch und Speichern
- `docs/LOGBOOK.md`: nur anhängen, eine Zeile pro wichtiger Aktion, Format GDD Abschnitt 1b.
- Sofort schreiben, nie am Ende sammeln. Nur der Hauptagent schreibt.
- Plan, Entscheidungen, Fortschritt sofort als Datei sichern, nicht nur im Chat.

## Befehle
- `pnpm dev` Dev-Server
- `pnpm test` Vitest, vor jedem Commit grün
- `pnpm bench` Headless-Sim-Benchmark (Zielwerte GDD Abschnitt 4)
- `pnpm check` Lint + Typecheck

## Struktur und Besitz
- `src/core/` Loop, Events, RNG, Save, Typen: Hauptagent
- `src/sim/`, `src/ai/` Simulation, KI: sim-engine
- `src/render/`, `src/ui/`, `src/data/` Grafik, UI, Spieldaten: gameplay-ui
- `tests/`, `bench/` Tests, Benchmarks: qa-review

## Regeln
- Ein Meilenstein pro Session. Danach Bericht in `docs/progress/Mxx.md`, stoppen.
- Spielwerte nur in `src/data/`, nie in Systemen.
- Texte nur über `t('key')`, Keys in `src/data/i18n/`.
- Code und Kommentare Englisch, knapp. Keine Platzhalter-Features.
- Kleine Conventional Commits, Hash ins Logbuch.

## Agenten
- Weiterverwenden per SendMessage an sim-engine, gameplay-ui, qa-review. Nicht neu starten, nicht stoppen.
- Auftrag: Ziel, Dateien, GDD-Abschnitte, Abnahme. Kein bekannter Kontext erneut.
- Rückmeldung max. 10 Zeilen, kein Code.
- Fremde Bereiche nur über den Hauptagenten.

## Token sparen
- Erst grep/glob, dann gezielte Zeilenbereiche lesen.
- Logs kürzen: `pnpm test 2>&1 | tail -40`.
- Im Chat Diffs und Dateinamen, keine ganzen Dateien.
