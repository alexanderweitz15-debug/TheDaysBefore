# Entscheidungen

Format: Datum | Annahme | verworfene Alternative | Grund

- 2026-11-26 | GDD-Formatierung rekonstruiert: Der eingefügte Prompt kam als Klartext ohne Markdown (Tabellen in Einzelzeilen, keine Überschriften, keine Codeblöcke). Inhalt wörtlich übernommen, Überschriften als `## N.`, Tabellen und Codeblöcke wiederhergestellt. | Rohtext 1:1 speichern | Ohne `## `-Überschriften funktioniert der Index-Befehl aus CLAUDE.md nicht, und die eingebetteten CLAUDE.md-Zeilen wären als Kapitel gelesen worden.
- 2026-11-26 | CLAUDE.md, Regeln, Agent-Dateien, settings.json und Hook wurden per Skript aus den Codeblöcken des GDD extrahiert, damit sie byte-gleich zur Vorgabe sind. | Von Hand abtippen | Keine Tippfehler.
- 2026-11-26 | Plan-Dateien heißen `docs/plans/M0.md`, `M1.md` … (ohne führende Null). | `M00.md` | Passt zum Regex des Hooks und zur Schreibweise im GDD.
- 2026-11-26 | Unit-Tests der Simulationsregeln liegen neben dem Code als `src/sim/**/*.test.ts` (Besitz sim-engine). `tests/` (qa-review) enthält Core-Tests, Integration, Determinismus. | Alle Tests in `tests/` | Widerspruch im GDD: sim-engine soll zu jeder Regel Tests schreiben, darf aber nur in src/sim und src/ai schreiben. Vitest sammelt beide Orte.
- 2026-11-26 | Subagenten werden in dieser Session als general-purpose-Agenten mit Modell/Effort laut Tabelle und dem Rollentext ihrer Agent-Datei gestartet. | Custom-Agententyp `sim-engine` usw. | Agent-Dateien in .claude/agents/ werden erst beim nächsten Sessionstart registriert. Ab M1 greifen die Dateien direkt.
- 2026-11-26 | Spieltempo ist ein Befehl (`SetGameSpeed`) und wird im SimHost auf die Schleife angewendet, nicht in der Welt. | Tempo als reine UI-Einstellung | Steht im Befehlslog, Replays laufen im selben Tempo ab; Weltzustand bleibt tempo-unabhängig.
- 2026-11-26 | Befehle werden vom Host auf den nächsten auszuführenden Tick gestempelt; Reihenfolge innerhalb eines Ticks: (tick, playerId, Ankunft). | Zeitstempel durch den Absender | Absender kennt den Worker-Tick nicht exakt; für Lockstep-Co-op (M14) wird später ein Eingabe-Verzug ergänzt.
- 2026-11-26 | Schnappschuss wird pro gesendetem Stand neu allokiert und übertragen (Transfer). | Buffer-Pool mit Rückgabe | Bei 20 Hz und M0-Größe vernachlässigbar; Pool kommt, wenn der Benchmark es verlangt (M1).
- 2026-11-26 | Kein Git-Remote vorhanden. Commits nur lokal im Container. | Pushen | Der Ordner war leer und ohne Repository. Der Container ist flüchtig: Ohne Remote geht die Arbeit beim Sessionende verloren.
