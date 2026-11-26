# Verbesserungsvorschläge zum GDD

Format: Datum | Abschnitt | Vorschlag | Grund

- 2026-11-26 | 1a / CLAUDE.md | Index-Befehl auf `grep -n "^## [0-9]" docs/GAME_DESIGN.md` ändern. | Die im GDD eingebettete CLAUDE.md enthält selbst `## `-Zeilen, die im Index als Scheinkapitel auftauchen.
- 2026-11-26 | 1a | Testbesitz klären: sim-engine soll Tests schreiben, darf aber nicht in `tests/`. Vorschlag: Unit-Tests co-located (`src/sim/**/*.test.ts`), so wie in DECISIONS umgesetzt.
- 2026-11-26 | 9 | „Vier Epochen mit insgesamt zwölf Fraktionen“: Die Tabelle enthält 13 Zeilen (NATO doppelt, Kalter Krieg und Gegenwart). Entweder „13 Fraktionen“ schreiben oder NATO als eine Fraktion mit zwei Epochen-Varianten führen.
- 2026-11-26 | 1a | Effort je Agent lässt sich für den Hauptagenten nicht aus der Session heraus umstellen (xhigh bei M0/M1). Das muss der Mensch beim Start der Session wählen.
