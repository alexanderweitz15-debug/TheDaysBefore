# SPERRZONE – Game Design Document

> Wörtliche Ablage des Prompts ab Abschnitt 1 (Stand 2026-11-26). Formatierung (Überschriften, Tabellen, Codeblöcke) aus dem eingefügten Klartext rekonstruiert, Inhalt unverändert. Siehe docs/DECISIONS.md.

## 1. Rolle, Ziel und Arbeitsweise

Ab hier beginnt der eigentliche Prompt für Claude Code.

Abschnitt 0 ist eine Notiz an den Menschen. Ignoriere ihn.

Dein allererster Schritt, wenn du diesen Prompt erhältst: Speichere den kompletten Prompt ab Abschnitt 1 wörtlich als docs/GAME_DESIGN.md. Lege danach CLAUDE.md und die Agent-Dateien aus Abschnitt 1a exakt wie vorgegeben an. Erst dann beginnst du mit M0. In späteren Sessions liest du docs/GAME_DESIGN.md statt eines eingefügten Prompts.

Du bist Lead-Entwickler und Game Designer für SPERRZONE (Arbeitstitel), ein 2D-Top-down-Strategiespiel im Browser. Der Spieler verteidigt eine Stadt gegen riesige Zombie-Armeen: erst Aufbau und Farmen, dann Ausbruch, Verteidigung, Rückzug und Evakuierung. Ziel ist ein vollständiges, poliertes, performantes Spiel, gebaut in klar abgegrenzten Meilensteinen.

### Arbeitsregeln

1. Dieses Dokument ist die einzige Quelle der Wahrheit. Lies es vor jedem Meilenstein vollständig. Danach liest du nur noch die Abschnitte, die der aktuelle Meilenstein braucht.
2. Arbeite strikt meilensteinweise (Abschnitt 17). Pro Session genau ein Meilenstein. Am Ende prüfst du jedes Abnahmekriterium, schreibst einen kurzen Bericht nach docs/progress/Mxx.md und stoppst.
3. Vor jedem Meilenstein legst du einen Plan in docs/plans/Mxx.md an: betroffene Dateien, neue Datentypen, Risiken, Reihenfolge, Aufteilung auf die Agenten (Abschnitt 1a).
4. Nichts vortäuschen. Was nicht fertig ist, erscheint im UI als gesperrt („ab M9“), nie als halb funktionierender Knopf.
5. Datengetrieben bauen. Einheiten, Zombies, Erreger, Epochen, Fraktionen, Gebäude, Forschung, Tutorials, Funksprüche und Mutatoren liegen als typisierte Datendateien unter src/data/. Systeme lesen Daten, sie enthalten keine Spielwerte.
6. Bei Unklarheiten triffst du eine begründete Annahme, trägst sie in docs/DECISIONS.md ein (Datum, Annahme, verworfene Alternative) und machst weiter. Nachfragen nur, wenn eine Entscheidung die Architektur oder das Speicherformat ändert.
7. Performance ist ein Feature. Die Zielwerte aus Abschnitt 4 gelten ab dem ersten Meilenstein, nicht erst am Ende.
8. Jede Simulationsregel bekommt Unit-Tests mit festem Seed. Ein Meilenstein ohne grüne Tests ist nicht fertig.
9. Kleine Commits mit Conventional-Commit-Nachrichten (feat(sim): flow field for hordes).
10. Code, Bezeichner und Kommentare auf Englisch. Alle Spieltexte über i18n, Deutsch als Standard, Englisch als zweite Sprache.
11. Zombies Aren't Real ist Inspiration für Mechaniken (Abschnitt 3). Du übernimmst keinen Namen, keine Grafiken, Texte, Sounds und kein 1:1-Layout.
12. Du änderst dieses Dokument nicht eigenmächtig. Verbesserungsvorschläge kommen nach docs/PROPOSALS.md.

### Definition of Done für jedes Feature

- Funktioniert im Spiel, nicht nur im Test.
- Hat Daten statt Konstanten, Tests für die Regeln und einen Eintrag im Tutorial oder Kodex, falls es eine neue Mechanik ist.
- Hält das Frame-Budget bei der Ziel-Last.
- Ist über Einstellungen abschaltbar oder skalierbar, falls es Leistung kostet (Partikel, Licht, Wetter).

## 1a. Agenten-Setup, CLAUDE.md und Token-Disziplin

Du arbeitest als Hauptagent mit genau drei Subagenten. Du startest jeden einmal pro Session und beauftragst ihn danach immer wieder per SendMessage, statt neue Agenten zu starten. So müssen die Agenten Code und Dokument nicht bei jeder Aufgabe neu einlesen.

| Agent | Modell | Effort | Zuständig für | Dateibesitz |
|---|---|---|---|---|
| Hauptagent (du) | Opus | high, xhigh bei M0, M1 und harten Bugs | Planung, Architektur, Schnittstellen, Integration, Abnahme | src/core/, src/main.ts, docs/ |
| sim-engine | opus | high | Simulation, Pathfinding, Infektion, Zombie-KI, Bot-KI, Performance | src/sim/, src/ai/ |
| gameplay-ui | sonnet | medium | Rendering, Effekte, HUD, Menüs, Einstellungen, Tutorial, Spieldaten, i18n | src/render/, src/ui/, src/data/ |
| qa-review | sonnet | high | Tests, Benchmarks, Code-Review, Balancing-Checks | tests/, bench/, docs/progress/ |

Opus steht dort, wo Fehler teuer und schwer zu sehen sind: Determinismus, Performance, Architektur. Sonnet steht dort, wo die Arbeit breit und klar spezifiziert ist (UI, Daten) oder gegen feste Kriterien geprüft wird (Tests).

### Regeln für den Hauptagenten

1. Erstauftrag pro Session: Die Rolle steht in der Agent-Datei. Der Auftrag nennt nur Meilenstein, die nötigen GDD-Abschnitte und das erste Arbeitspaket.
2. Jeder weitere Auftrag geht per SendMessage an denselben Agentennamen. Du startest nie einen zweiten Agenten derselben Rolle und stoppst keinen Agenten.
3. Halte alle drei ausgelastet. Sobald ein Agent meldet, gibst du ihm sofort das nächste Arbeitspaket aus dem Plan. Schneide die Pakete so, dass alle drei parallel arbeiten können.
4. Folgeaufträge enthalten nur Neues: Ziel, Dateien, Abnahmekriterium. Du erklärst keinen Kontext erneut, den der Agent schon hat, und schickst ihn nicht erneut durch das ganze GDD.
5. Dateibesitz ist hart. Braucht ein Agent eine Änderung in einem fremden Bereich, meldet er sie, und du gibst sie an den Besitzer weiter.
6. Schnittstellen zuerst. Arbeiten zwei Agenten an einem Feature, legst du vorher Typen und Events in src/core/ fest.
7. Einzige Ausnahme vom Weiterverwenden: Läuft der Kontext eines Agenten voll oder wird er sichtbar ungenau (wiederholt Fehler, vergisst Regeln), schreibt er eine Übergabe von höchstens 20 Zeilen. Du startest einen frischen Agenten derselben Rolle mit dieser Übergabe.
8. Rückmeldungen der Agenten haben höchstens 10 Zeilen: geänderte Dateien, Teststatus, offene Punkte, Schnittstellenwünsche. Keine Code-Auszüge.
9. qa-review prüft jedes fertige Paket der anderen beiden, bevor du es als erledigt abhakst.

### Ablauf eines Meilensteins

1. Du liest die GDD-Abschnitte, die der Meilenstein nennt, und schreibst docs/plans/Mxx.md mit Arbeitspaketen je Agent.
2. Du legst die Schnittstellen in src/core/ an.
3. Du beauftragst die Agenten parallel.
4. Meldung, dann Prüfung durch qa-review, dann sofort das nächste Paket.
5. Du integrierst, prüfst im Dev-Server und im Headless-Benchmark und hakst die Abnahmekriterien ab.
6. Du schreibst den Bericht nach docs/progress/Mxx.md und stoppst.

### Dateien, die du exakt so anlegst

CLAUDE.md (unter 60 Zeilen halten; sie wird in jeder Session und in jeden Subagenten geladen)

```markdown
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
```

.claude/rules/sim.md (lädt nur, wenn Simulationsdateien bearbeitet werden)

```markdown
---
paths:
  - "src/sim/**"
  - "src/ai/**"
---
- Deterministisch: nur `rng` aus `src/core/rng.ts`, kein Math.random, kein Date.now, kein performance.now.
- Fester Tick 20 Hz. Zeit nur über `tick`.
- Kein Import aus `src/render/` oder `src/ui/`. Kein DOM.
- Agenten als Structure of Arrays in TypedArrays, keine Objekte pro Zombie oder Zivilist.
- Keine Allokationen im Tick (Pools, vorab reservierte Buffer).
- Jede Regel hat einen Test mit festem Seed.
```

.claude/rules/ui.md

```markdown
---
paths:
  - "src/render/**"
  - "src/ui/**"
---
- Render liest den Sim-Zustand nur lesend, interpoliert zwischen zwei Ticks.
- Farben nur aus `src/render/palette.ts`. Jede Farbe mit Bedeutung hat eine farbenblind-sichere Alternative.
- Jeder Effekt (Partikel, Licht, Wetter, Blut) ist über eine Einstellung abschalt- oder skalierbar.
- Alle UI-Texte über `t('key')`. UI skaliert 75 bis 200 Prozent.
```

.claude/agents/sim-engine.md

```markdown
---
name: sim-engine
description: Deterministische Simulation, Pathfinding, Infektion, Zombie- und Bot-KI, Performance. Alles in src/sim/ und src/ai/.
tools: Read, Edit, Write, Bash, Grep, Glob
model: opus
effort: high
color: red
---
Du baust die Simulation von SPERRZONE. Du arbeitest nur in src/sim/ und src/ai/.
Lies GDD-Abschnitte nur, wenn der Auftrag sie nennt und du sie noch nicht kennst.
Schreibe zu jeder Regel einen Test mit festem Seed und prüfe `pnpm bench` gegen die Zielwerte.
Brauchst du Änderungen außerhalb deines Bereichs, melde sie, statt sie zu machen.
Antwort am Ende, max. 10 Zeilen: geänderte Dateien, Tests, Benchmark-Werte, offene Punkte.
```

.claude/agents/gameplay-ui.md

```markdown
---
name: gameplay-ui
description: Rendering, Effekte, HUD, Menüs, Einstellungen, Tutorial, Spieldaten und i18n. Alles in src/render/, src/ui/, src/data/.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
effort: medium
color: blue
---
Du baust Grafik, Oberfläche und Spieldaten von SPERRZONE. Du arbeitest nur in src/render/, src/ui/ und src/data/.
Halte dich an Stil und GUI aus dem GDD. Werte gehören in Datendateien, Texte in i18n.
Brauchst du Änderungen außerhalb deines Bereichs, melde sie, statt sie zu machen.
Antwort am Ende, max. 10 Zeilen: geänderte Dateien, was sichtbar neu ist, offene Punkte.
```

.claude/agents/qa-review.md

```markdown
---
name: qa-review
description: Tests, Benchmarks, Code-Review und Balancing-Checks. Prüft jedes fertige Arbeitspaket.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
effort: high
color: green
---
Du prüfst die Arbeit von sim-engine und gameplay-ui. Du schreibst nur in tests/, bench/ und docs/progress/.
Prüfe gegen die Abnahmekriterien des Auftrags, die Regeln in CLAUDE.md und .claude/rules/.
Fehler meldest du mit Datei, Zeile und Ursache. Du behebst keinen Code in src/.
Antwort am Ende, max. 10 Zeilen: bestanden oder nicht, Fundstellen, fehlende Tests.
```

### Token-Disziplin für alle

- Erst suchen (grep, glob), dann gezielte Zeilenbereiche lesen. Große Dateien nie komplett.
- Dieses Dokument nach dem ersten Durchgang nur noch abschnittsweise lesen.
- Test- und Build-Ausgaben kürzen. Nur Fehlerzeilen lesen.
- Im Chat keine ganzen Dateien ausgeben, nur Dateinamen und kurze Diffs.
- Kleine, fokussierte Dateien (Richtwert unter 400 Zeilen), damit Agenten wenig lesen müssen.
- Sprechende Namen statt Kommentaren. Kommentare nur für das Warum.

## 1b. Logbuch, Speichern und Kompaktierung

Alles, was über den Moment hinaus zählt, steht in Dateien und nicht nur im Chat. Kompaktiert Claude Code den Kontext, geht Wissen aus dem Gespräch verloren, die Dateien bleiben.

### Das Logbuch docs/LOGBOOK.md

Das Logbuch ist das Gedächtnis des Projekts. Es wird nur angehängt, älteste Einträge oben, neueste unten, damit tail reicht. Eine Zeile pro Aktion:

```
2026-11-26 14:32 | M3 | sim-engine | FERTIG | Flow-Field für Horden | src/sim/flowfield.ts | Tests 14/14, Bench 2,1 ms
```

Felder: Zeit, Meilenstein, wer, Typ, was, Dateien, Ergebnis. Die Zeit holst du per `date '+%Y-%m-%d %H:%M'`.

| Typ | Wann |
|---|---|
| START | Session oder Meilenstein beginnt |
| PLAN | Plan docs/plans/Mxx.md geschrieben oder geändert |
| AUFTRAG | Arbeitspaket an einen Agenten vergeben |
| FERTIG | Agent meldet ein Paket als fertig |
| REVIEW | qa-review hat geprüft, mit Ergebnis |
| FEHLER | Test rot, Bug gefunden, Build kaputt |
| FIX | Fehler behoben, mit Ursache in einem Halbsatz |
| ENTSCHEIDUNG | Annahme getroffen, Verweis auf docs/DECISIONS.md |
| COMMIT | Commit mit Hash |
| AGENT-NEU | Agent mit Übergabe neu gestartet, mit Grund |
| KOMPAKT | Kontext kompaktiert, danach Wiederherstellung |
| ABNAHME | Abnahmekriterien geprüft, bestanden oder nicht |
| STOPP | Session endet, mit nächstem Schritt |

Regeln:

- Sofort schreiben, nie am Ende sammeln. Eine Kompaktierung kann jederzeit kommen.
- Nur der Hauptagent schreibt. Subagenten melden, du trägst ein.
- Jede Zeile muss ohne Kontext verständlich sein. Keine Abkürzungen außer den Typen.
- Rotation: Über 400 Zeilen verschiebst du alles außer dem laufenden Meilenstein nach docs/logbook/Mxx.md und lässt je Meilenstein eine Zusammenfassungszeile stehen.

### Speichern

1. Der Prompt liegt wörtlich in docs/GAME_DESIGN.md (dein allererster Schritt).
2. Plan, Entscheidungen, Fortschritt und Logbuch schreibst du in dem Moment, in dem sie entstehen.
3. Vor jedem langen Schritt (großer Refactor, Agentenrunde) hältst du den Stand im Logbuch fest.
4. Jedes fertige Arbeitspaket wird committet, der Hash kommt ins Logbuch.

### Nach jeder Kompaktierung

Die CLAUDE.md im Projektordner wird nach einer Kompaktierung automatisch neu geladen. Anweisungen, die nur im Gespräch standen, gehen verloren. Deshalb steht die Pflichtroutine in der CLAUDE.md, und ein Hook erzwingt sie zusätzlich.

1. Logbuch-Ende lesen.
2. Aktuellen Plan lesen.
3. Die GDD-Abschnitte des aktuellen Meilensteins neu lesen. Bist du bei einer Regel unsicher, liest du den Abschnitt und rätst nicht.
4. Den Stand der Agenten aus dem Logbuch rekonstruieren und laufende Aufträge per SendMessage fortsetzen.
5. KOMPAKT-Eintrag mit „Kontext wiederhergestellt“ schreiben.

.claude/settings.json

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/restore-context.mjs\" compact",
            "timeout": 30,
            "statusMessage": "Stelle Projektkontext wieder her..."
          }
        ]
      },
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/restore-context.mjs\" startup",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

.claude/hooks/restore-context.mjs (Node statt Bash, damit es auch unter Windows läuft)

```js
// Gibt nach Sessionstart oder Kompaktierung den Projektstand als Kontext aus.
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const source = process.argv[2] ?? 'startup';
const log = join(root, 'docs/LOGBOOK.md');
if (!existsSync(log)) process.exit(0);

const now = new Date().toLocaleString('sv-SE').slice(0, 16);
if (source === 'compact') {
  appendFileSync(log, `${now} | - | hook | KOMPAKT | Kontext kompaktiert, Wiederherstellung nötig | - | -\n`);
}

const dir = join(root, 'docs/plans');
const plans = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => /^M\d+.*\.md$/.test(f))
      .sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs)
  : [];
const tail = readFileSync(log, 'utf8').trimEnd().split('\n').slice(-30).join('\n');

console.log([
  `PFLICHT (${source}): Nicht aus einer Zusammenfassung weiterarbeiten.`,
  `1. Aktuellen Plan lesen: ${plans[0] ? 'docs/plans/' + plans[0] : 'noch keiner'}`,
  '2. Die dort genannten Abschnitte aus docs/GAME_DESIGN.md neu lesen.',
  '3. Laufende Agentenaufträge per SendMessage fortsetzen.',
  '4. Logbuch-Eintrag START oder KOMPAKT schreiben.',
  '--- Letzte Logbuch-Einträge ---',
  tail,
].join('\n'));
```

## 2. Spielvision und Kernschleife

SPERRZONE ist eine Horden-Verteidigung mit Ausbruchssimulation. Du baust eine Stadt in Ruhe auf, dann bricht ein Erreger aus. Du musst Zehntausende Infizierte aufhalten, Zivilisten retten und notfalls die Stadt Ring für Ring aufgeben, bis die Evakuierung steht.

Pitch: Eine echte oder generierte Stadt von oben. Ein paar Minuten Ruhe, um Wirtschaft, Mauern und Truppen aufzubauen. Dann der erste Fall im Krankenhaus, und die Karte färbt sich Straße für Straße ein. Jede Epoche bringt eigene Truppen, jeder Erreger eigene Regeln, und die Horde lernt aus deinen Waffen.

### Designsäulen

1. Lesbarkeit vor Detail. Auf einen Blick siehst du, wo die Infektion ist, wo Zivilisten sind und wo die Linie hält. Jede Optik ordnet sich dem unter.
2. Planen, dann reagieren. Die Vorbereitung entscheidet die Mission. Im Ausbruch korrigierst du, statt alles zu mikromanagen.
3. Masse fühlbar machen. Horden von 10.000 bis 50.000 Zombies drücken sich wie eine Flüssigkeit durch Straßen, stauen sich an Mauern und brechen an Schwachstellen durch.
4. Jeder Erreger spielt sich anders. Gegen Pilze kämpfst du anders als gegen Bakterien oder Parasiten. Der Erreger ist die wichtigste Variable einer Mission.
5. Systeme greifen ineinander. Wetter steuert Erreger, Funk steuert Befehle, Moral steuert Wirtschaft, Waffeneinsatz steuert Mutation.
6. Scheitern ist Lernen. Kurze Missionen, schneller Neustart, Zeitraffer-Replay der Niederlage. Verlieren ist eingeplant.

### Kernschleife einer Mission

1. Briefing: Stadt, Epoche, Fraktion, Erreger-Hinweise, Ziele, verfügbare Bots.
2. Farmphase: Wirtschaft, Bevölkerung, Expeditionen, Forschung, Bau der Verteidigung. Der Ausbruch kommt nach Countdown oder früher, wenn du Warnzeichen ignorierst.
3. Ausbruch: Patient Null erscheint, Infektion breitet sich aus.
4. Verteidigung: Echtzeit mit Pause und Tempo 0,5x bis 4x. Bauen, Einheiten befehligen, Unterstützung anfordern, Korridore für Zivilisten ziehen.
5. Rückzug und Evakuierung: Sektoren fallen, du ziehst dich auf innere Ringe zurück und evakuierst.
6. Auswertung: Wertung, Heatmap, Zeitraffer, Belohnungen.
7. Meta: Forschungspunkte und Freischaltungen, nächste Mission.

### Rahmen

| Punkt | Festlegung |
|---|---|
| Plattform | Desktop-Browser (Chrome, Firefox, Edge), Maus und Tastatur. Später optional Desktop-Build per Tauri |
| Missionslänge | Standard 25 bis 40 Minuten, davon Farmphase 8 bis 15. Schnelles Gefecht 10 bis 15 Minuten |
| Spieler | Solo mit bis zu 3 KI-Bots. Online-Co-op für 2 Spieler als optionaler letzter Meilenstein |
| Sprache | Deutsch und Englisch |
| Vorbilder für das Gefühl | Zombies Aren't Real (Kern), They Are Billions (Druck der Masse), Frostpunk (harte Entscheidungen) |

### Was SPERRZONE nicht ist

- Kein Shooter und kein Survival mit einer Einzelfigur.
- Kein Mikromanagement jeder Kugel. Einheiten kämpfen selbst, du gibst Ziele und Haltungen vor.
- Kein Online-PvP, keine Mikrotransaktionen, kein Grind. Freischaltungen kommen über Spielen, nicht über Wiederholen.

## 3. Inspiration: Zombies Aren't Real

Zombies Aren't Real (ZAR) von Jogamedev, seit Mitte November 2026 im Early Access auf Steam, ist das Vorbild für Spielkern und Lesbarkeit. SPERRZONE übernimmt Mechaniken und Prinzipien, keine Inhalte. Du kennst das Spiel nicht aus eigener Anschauung, deshalb steht hier, was es ausmacht (Quelle).

### So spielt sich ZAR

- Missionen in echten Städten aus öffentlichen Kartendaten, mit echten Straßen, Flüssen und Brücken. Der Leveleditor baut Karten aus Postleitzahlen.
- Planungsphase aus der Vogelperspektive mit begrenztem Budget. Nichts passiert, bis der Spieler bereit meldet.
- Das Budget geht in Bodeneinheiten: Garnisonen, Scharfschützen, Geschütztürme, Mörser, Minenfelder, C4.
- Mauern, Tore und Schutzzonen für Zivilisten.
- Nach dem Ausbruch Live-Fähigkeiten: Fallschirmjäger, Luftschläge, Raketen, Gas, Helikopter, gepanzerte Fahrzeuge. Treffer auf Zivilisten senken die Wertung.
- Optik: Top-down, Stadt mit 3D-Wirkung, Infektion lila, Zivilisten als weiße Punkte, Schutzzonen blau leuchtend, eigene Verteidigung grün. Eher schlicht und funktional als poliert.
- Zombies breiten sich Block für Block aus und verwandeln jeden, den sie erwischen.
- Gewertet wird nach geretteten Zivilisten. Der Spieler zieht Korridore und Haltepunkte, um panische Menschenmengen in Sicherheit zu lenken.
- Sieg, wenn alle Zombies tot sind. Verlieren ist eingeplant, Neustart mit neuem Plan gehört zum Design.
- Skillpunkte und Upgrades zwischen Missionen.
- Spieltempo von halber bis vierfacher Geschwindigkeit.
- Solo oder Online-Co-op für zwei. Karten und Mutatoren (etwa Zombiezahl, Brückenfestigkeit) aus dem Steam Workshop.

### Übernehmen und erweitern

| ZAR-Element | In SPERRZONE |
|---|---|
| Echte Städte aus Kartendaten | Übernehmen, aber erst als OpenStreetMap-Import in M12. Bis dahin prozedurale Städte |
| Planungsphase mit festem Budget | Wird zur Farmphase. Budget wird erwirtschaftet, dazu Bevölkerung, Expeditionen, Forschung |
| Bereit-Knopf, vorher passiert nichts | Als Option „Klassischer Start“. Standard ist ein Countdown mit Warnzeichen, die einen früheren Ausbruch auslösen können |
| Garnison, Sniper, Türme, Mörser, Minen, C4 | Übernehmen als Grundkategorien, je Epoche und Fraktion in eigener Ausprägung |
| Mauern, Tore, Schutzzonen | Übernehmen, erweitert um Verteidigungsringe, Quarantäne, Dekontamination und Sektoren, die fallen können |
| Live-Fähigkeiten | Übernehmen, gekoppelt an Funk, Befehlskette, Abklingzeiten und Epoche |
| Kollateralschaden senkt Wertung | Übernehmen, zusätzlich sinkt die Moral der Bevölkerung |
| Ein Erreger, Block für Block | Ausbreitungsprinzip übernehmen. Daraus werden sechs Erregerfamilien mit 18 Zombie-Typen, Wetter-Einfluss und Mutation |
| Wertung nach geretteten Zivilisten | Übernehmen, Evakuierung wird eine eigene Siegbedingung |
| Korridore und Haltepunkte | Übernehmen als zentrale Mechanik, erweitert um Panik und Moral |
| Sieg nur durch Ausrottung | Eine von vier Siegbedingungen (Abschnitt 10) |
| Skillpunkte zwischen Missionen | Erweitert zu Forschungsbaum und Kampagnenkarte |
| Tempo 0,5x bis 4x | Übernehmen, dazu aktive Pause mit Befehlen |
| Co-op für zwei | Ersetzt durch bis zu drei KI-Bots. Online-Co-op optional als letzter Meilenstein |
| Workshop, Mutatoren, Editor | Mutatoren und Editor übernehmen. Teilen per Datei-Export statt Workshop |
| Schlichte Optik | Lesbarkeit übernehmen, Atmosphäre ergänzen (Abschnitt 5) |

### Abgrenzung

- Kein Name, kein Logo, keine Texte, keine Sounds, keine Screenshots als Layout-Vorlage.
- Eigene Farblogik: Die Infektion ist nach Erregerfamilie eingefärbt statt einheitlich lila. Das ist zugleich ein Gameplay-Gewinn, weil der Spieler sofort sieht, womit er es zu tun hat.
- Eigene Benennung aller Einheiten, Gebäude und Fähigkeiten.

## 4. Technik und Architektur

TypeScript im Browser, PixiJS für WebGL-Rendering, die Simulation läuft deterministisch in einem Web Worker mit festem 20-Hz-Tick. Alle Eingaben, ob vom Spieler oder von Bots, sind Befehle in einer Warteschlange. Das macht Replays, faire Bots und späteren Online-Co-op möglich.

Auslieferung: eine reine Web-App aus HTML, CSS und JavaScript. TypeScript ist nur die Entwicklungssprache und wird beim Build zu normalem JavaScript. pnpm build erzeugt einen Ordner dist/ mit index.html, CSS- und JS-Dateien. Der läuft ohne Server-Logik auf jedem statischen Hosting: GitHub Pages, itch.io, eigener Webspace. Reines JavaScript ohne TypeScript wäre möglich, ist bei diesem Umfang mit mehreren Agenten aber deutlich fehleranfälliger, weil die Typen die Schnittstellen zwischen den Agenten absichern.

### Stack

| Bereich | Wahl | Grund |
|---|---|---|
| Sprache | TypeScript, strict | Großes Projekt, viele Agenten, Typen sind die Schnittstellen |
| Build | Vite, pnpm | Schnell, Worker-Support eingebaut |
| Rendering | PixiJS v8 (WebGL2, WebGPU wo verfügbar) | Zehntausende Sprites per Batching, Filter für Licht und Wärmebild |
| Menüs und HUD | Preact mit Signals als DOM-Overlay über dem Canvas | Echte Texte, Barrierefreiheit, schnelle UI-Entwicklung |
| Simulation | Eigener Code im Web Worker | Hauptthread bleibt für Rendering frei |
| Daten-Validierung | zod-Schemas für alle Definitionen | Sandbox und Editor schreiben dasselbe Format, Fehler fallen beim Laden auf |
| Tests und Benchmarks | Vitest, Headless-Sim per Node-Skript in bench/ | Simulation läuft ohne Browser |
| Lint und Format | Biome | Ein Werkzeug, schnell |
| Audio | Web Audio API, prozedurale Klänge plus wenige CC0-Samples | Keine Lizenzprobleme |
| Speichern | IndexedDB, Export und Import als Datei | Große Spielstände, teilbar |

### Schichten

1. core: Spielschleife, Befehlswarteschlange, Event-Bus, seeded RNG (xoshiro128**), Zeit, Speichern, gemeinsame Typen.
2. sim: Weltzustand und Systeme. Läuft im Worker, kennt kein DOM und kein Rendering.
3. ai: Bot-Kommandanten und Adjutant. Sie lesen denselben Zustand wie der Spieler und geben dieselben Befehle ab, ohne Sonderrechte (außer eine Schwierigkeitsstufe erlaubt es ausdrücklich).
4. render: Liest Schnappschüsse, interpoliert zwischen zwei Ticks, zeichnet Ebenen und Effekte.
5. ui: Menüs, HUD, Einstellungen, Tutorial. Gibt Befehle ab, ändert nie direkt den Zustand.
6. data: Alle Definitionen und Texte.

Datenfluss: UI und Bots erzeugen Befehle, der Worker wendet sie zu Beginn des nächsten Ticks an, simuliert und schickt einen Schnappschuss als übertragbaren ArrayBuffer zurück. Rendering läuft mit Bildwiederholrate und interpoliert. SharedArrayBuffer ist optional, falls COOP/COEP-Header verfügbar sind.

### Befehle

Jeder Befehl hat tick, playerId, type und payload. Beispiele: PlaceBuilding, MoveUnits, SetStance, DrawCorridor, CallSupport, SetResearch, AssignWorkers, LaunchExpedition, AbandonSector, SetGameSpeed. Ein Spielstand plus Seed plus Befehlsliste ergibt exakt dieselbe Partie. Darauf bauen Replay, Zeitraffer in der Auswertung, Bug-Reports und Online-Co-op auf.

### Reihenfolge der Systeme pro Tick

1. Befehle anwenden
2. Wetter und Tageszeit
3. Funknetz und Befehlskette
4. Wirtschaft und Produktion (alle 20 Ticks)
5. Bevölkerung, Moral, Panik
6. Lärmfeld
7. Flow-Fields (inkrementell, mit Zeitbudget pro Tick)
8. Bewegung Zivilisten
9. Bewegung Zombies mit Separation
10. Einheiten-KI und Bewegung
11. Kampf: Zielwahl, Projektile, Schaden, Explosionen
12. Infektion: Kontakt, Inkubation, Sporen, Umwelt
13. Mutation (alle 30 Sekunden Spielzeit)
14. Bau, Reparatur, Zerstörung
15. Sektorstatus, Rückzug, Evakuierung, Siegbedingungen
16. Statistik und Schnappschuss

### Datenmodell

- Agenten als Structure of Arrays in TypedArrays mit festen Kapazitäten: Zombies 60.000, Zivilisten 30.000, Einheiten 2.000, Projektile 10.000, Partikel nur im Renderer.
- Pro Zombie u. a. posX, posY, velX, velY (Float32), hp (Float32), type, state, pathogen (Uint8), flags (Uint16), targetId (Int32), mutationMask (Uint32).
- Freie Slots über Free-Lists, keine Allokation im Tick.
- Nachbarschaftsabfragen über ein Spatial Hash Grid mit 8 m Zellen.
- Karte als Raster mit 4 m Zellen. Standard 2 x 2 km (500 x 500 Zellen), groß 4 x 4 km. Pro Zelle: Gelände, Gebäude-ID, Durchlässigkeit, Lärm, Sporendichte, Infektionsdichte, Sektor-ID.
- Zusätzlich ein Straßengraph für Fahrzeuge und Evakuierungsrouten.
- Horden bewegen sich über Flow-Fields zu Zielen (Lärm, Menschen, Schwachstellen), berechnet auf einem groben Raster in Blöcken von 32 x 32 Zellen und nur dort neu, wo sich etwas ändert. Einheiten und Fahrzeuge nutzen A* auf dem Straßengraphen.

### Determinismus

- Fester Tick, seeded RNG, stabile Iterationsreihenfolge.
- Kein Math.random, kein Date.now, keine Iteration über Map oder Set in der Simulation, wo die Reihenfolge das Ergebnis beeinflusst.
- Trigonometrie über eigene Lookup-Tabellen, damit verschiedene Browser dasselbe Ergebnis liefern.
- Ein Test lässt dieselbe Partie zweimal laufen und vergleicht den Hash des Zustands nach 6.000 Ticks.

### Rendering

- Ebenen von unten nach oben: Gelände und Wasser, Straßen, Infektions- und Sporen-Overlay, Gebäude mit Dächern, Zivilisten, Zombies, Einheiten, Projektile und Effekte, Licht und Wetter, Markierungen und Zonen, Overlays (Funk, Lärm, Moral).
- Gebäude bekommen eine leichte 3D-Wirkung: Dach versetzt zur Grundfläche, sichtbare Seitenwände, Schattenwurf je Tageszeit.
- Zombies, Zivilisten und Einheiten als instanzierte Sprites. Ab einer Zoomstufe oder über 20.000 sichtbaren Zombies wechselt die Darstellung auf eine Dichte-Textur. Die Simulation läuft unverändert weiter.
- Alle Grafiken werden per Code gezeichnet oder zur Ladezeit in Texturatlanten gerendert. Keine externen Assets nötig.

### Leistungsziele

| Messgröße | Ziel |
|---|---|
| Sim-Tick bei 30.000 Zombies, 10.000 Zivilisten, 500 Einheiten | höchstens 20 ms im Worker |
| Bildrate bei dieser Last, 1080p, Effekte „Mittel“, Laptop mit integrierter GPU | 60 FPS |
| Sandbox-Maximum 50.000 Zombies | mindestens 30 FPS |
| Laden einer prozeduralen 2-x-2-km-Stadt | unter 5 Sekunden |
| Arbeitsspeicher | unter 1 GB |
| Spielstand | unter 5 MB |

### Speichern

- Spielstand = versionierter Schnappschuss mit Migrationen zwischen Versionen.
- Replay = Seed, Startzustand, Befehlsliste.
- Autosave beim Phasenwechsel und alle 5 Minuten, drei rotierende Autosave-Plätze plus manuelle Plätze.
- Einstellungen getrennt in localStorage.

### Ordnerstruktur

```
src/
  main.ts
  core/      loop.ts commands.ts events.ts rng.ts save/ types/
  sim/       world.ts systems/ map/ pathing/ infection/ combat/ economy/ population/ radio/ weather/ mutation/
  ai/        bots/ adjutant/ personalities/
  render/    layers/ effects/ atlas/ palette.ts camera.ts
  ui/        screens/ hud/ settings/ tutorial/ components/
  data/      eras/ factions/ units/ buildings/ pathogens/ zombies/ research/ support/ scenarios/ mutators/ tutorial/ radio/ i18n/
tests/
bench/
docs/       GAME_DESIGN.md LOGBOOK.md DECISIONS.md PROPOSALS.md plans/ progress/ logbook/
```

## 5. Stil, Präsentation, Audio und Ton

Die Stadt ist bei Tag eine nüchterne Lagekarte und bei Nacht ein brennendes, verrauchtes Kriegsgebiet. Zivilisten, Infektion und eigene Linien bleiben dabei jederzeit auf einen Blick erkennbar. Lesbarkeit schlägt Atmosphäre, immer.

### Farblogik (src/render/palette.ts)

| Element | Standard | Form für Farbenblind-Modus |
|---|---|---|
| Zivilisten | Weiße Punkte, in Panik hellgelb flackernd | Punkt, in Panik mit Ring |
| Eigene Einheiten und Bauten | Grün #4FD16A, gefüllt | Gefüllte Form |
| Verbündete Bots | Grün als Umriss, Akzent in Fraktionsfarbe | Umriss mit Bot-Symbol |
| Schutzzonen und Korridore | Blau leuchtend #3D7BFF, Korridore gestrichelt mit Laufrichtungspfeilen | Doppellinie |
| Infektion viral | Violett #B04BFF | Punktmuster |
| Infektion bakteriell | Senfgelb #C8C42E | Diagonale Schraffur |
| Infektion Pilz | Rostorange #D9774A, mit schwebenden Sporen | Netzmuster wie Myzel |
| Infektion parasitär | Karminrot #E0344A | Wellenlinien |
| Infektion chemisch-mutagen | Graublau #8FA3B8, wolkig | Wolkenmuster |
| Infektion Nanotech | Türkis #2EE6D6, mit Pixel-Flackern | Rastermuster |
| Funkabdeckung | Weiße Kreise mit 20 Prozent Deckkraft | Konzentrische Ringe |
| Gefahr und Alarm | Rot pulsierender Ring nur im HUD und an Ereignisorten | Ausrufezeichen |

Zivilisten sind immer weiß, eigene Kräfte immer grün. Kein anderes Element darf diese beiden Farben nutzen. Die Infektionsfarbe zeigt dem Spieler sofort, mit welcher Erregerfamilie er es zu tun hat. Jede Farbe kann in den Einstellungen pro Element überschrieben werden.

### Kamera und Zoomstufen

- Strategisch (ganze Stadt): Dichte-Texturen statt Einzelpunkten, Sektorgrenzen, Symbole für Verbände, Großereignisse als Marker.
- Taktisch (Straßenzüge): Einzelne Punkte für Zombies und Zivilisten, Einheiten als taktische Symbole, angelehnt an militärische Lagekarten, ohne offizielle Embleme.
- Nah (Kreuzung): Draufsicht-Silhouetten, Mündungsfeuer, Projektile, Hülsen, Trümmer.
- Kein Drehen der Kamera. Scrollen per WASD, Pfeiltasten, Bildschirmrand oder mittlerer Maustaste. Zoom zum Mauszeiger. Kamera-Lesezeichen siehe Tastenbelegung in Abschnitt 14.

### Atmosphäre

- Tag und Nacht: Ein Spieltag dauert bei 1x standardmäßig 16 Minuten (einstellbar). Nachts dunkelt die Karte ab. Lichtquellen sind Straßenlaternen (fallen bei Stromausfall aus), Scheinwerfer, Leuchtgeschosse, Mündungsfeuer, Brände und Fahrzeuglichter. Ohne Licht sinkt die Sichtweite der Einheiten.
- Wärmebild-Modus (Taste T, ab Kaltem Krieg erforscht): Karte entfärbt in Dunkelblau, warme Körper hell. Zivilisten und Soldaten leuchten, Zombies je nach Erreger schwächer. Pilz-Zombies sind fast kalt und damit schwer zu sehen. Das ist Absicht.
- Feuer: Brände springen mit dem Wind auf Nachbargebäude über. Brennende Straßen sind Barrieren, Rauch senkt Sicht und blockiert Luftunterstützung.
- Explosionen: Druckwellen-Ring, Krater als Decal, Trümmer, die Straßen teilweise blockieren.
- Wetter: Regen (Schlieren, nasser Glanz), Nebel (Sichtweite runter), Schnee (weiße Schicht, Spuren), Sturm (Partikel in Windrichtung), Hitze (Flimmern). Gameplay-Wirkung in Abschnitt 7.
- Gebäudezustände: intakt, beschädigt, brennend, Ruine.
- Leichen bleiben als Decals (Obergrenze einstellbar). Manche Erreger reanimieren sie.
- Gewalt-Regler: Blut und Gewebe aus, gering oder normal. Stilisiert, nie fotorealistisch.
- Stimmungseffekte: Leichte Vignette bei niedriger Moral, kurzes Bildzittern bei schweren Explosionen. Beides abschaltbar.

### Formen statt Assets

- Alle Grafiken entstehen per Code oder werden beim Laden in Texturatlanten gerendert.
- Zombie-Typen unterscheiden sich in der Nahansicht durch Form und Größe, nicht nur durch Farbe: Läufer rund, Sprinter länglich, Koloss groß mit Rand, Spucker mit Dreieck, Träger aufgebläht, Sporenträger mit Sporenwolke, Schwarm als Punktwolke.
- Gebäude in Draufsicht mit Dachfarbe nach Typ. Krankenhäuser mit einem „H“, nie mit rotem Kreuz (geschütztes Zeichen).
- Einheiten in der Nahansicht als einfache Draufsicht-Formen: Soldat als Kopf und Schultern, Fahrzeug mit Turm, Helikopter mit drehendem Rotor.

### Epochen-Skin

Die Bedeutung der Farben bleibt in allen Epochen gleich. Nur der UI-Rahmen und der Kartenuntergrund wechseln:

| Epoche | UI-Skin |
|---|---|
| Weltkriege | Vergilbtes Kartenpapier, Schreibmaschinenschrift, Stempel |
| Kalter Krieg | Grüner Phosphor-Monitor, Rasterlinien, leichte Scanlines |
| Gegenwart | Dunkles taktisches Interface, klare Linien |
| Nahe Zukunft | Holografisch, halbtransparent, feine Leuchtkanten |

### Schrift

Inter für Text, JetBrains Mono für Zahlen und Funklog. Beide unter Open Font License, lokal eingebunden.

### Audio

- Ambient: Stadtgeräusche, die mit dem Ausbruch verstummen. Wind, Regen, ferne Schüsse, Sirenen.
- Horde: Ein Klangteppich, dessen Lautstärke von der Zahl sichtbarer Zombies abhängt. Klangfarbe je Erreger: viral schreiend, Pilz knisternd, parasitär klickend, bakteriell gurgelnd, chemisch röchelnd, Nanotech surrend.
- Waffen und Explosionen: Prozedural erzeugt (gefiltertes Rauschen, tiefe Impulse), mit Entfernungsdämpfung und Hall in Straßenschluchten.
- Funk: Rauschen, Piepton, Text im Funklog. Keine Sprachaufnahmen.
- Musik: Adaptiv in vier Schichten: Ruhe (Farmphase), Anspannung (Warnzeichen), Kampf, Rückzug. Selbst erzeugt per Web Audio oder CC0-Material.
- Mischpult: Gesamt, Musik, Effekte, Ambient, Funk, Oberfläche.

### Ton-Presets

Der Ton ist ein Preset, kein Mischmasch. Er lässt sich beim Missionsstart wählen und jederzeit in den Einstellungen ändern.

| Preset | Funk und Texte | Optik | Standard für |
|---|---|---|---|
| Nüchtern | Militärische Kurzsprache, Zahlen, kein Humor | Gewalt gering | auf Wunsch |
| Trocken | Wie Nüchtern, etwa jeder achte Spruch lakonisch | Normal | Kampagne, Szenarien |
| Horror | Abbrechende Funksprüche, Panik, Rauschen, beklemmende Kodex-Texte | Dunklere Nächte, Pilzwucherungen auf Leichen, Bildstörungen | auf Wunsch |
| B-Movie | Überzogen, Wortspiele, Schlagzeilen-Einblendungen | Neon-Splatter, übertriebene Explosionen | Sandbox, Herausforderungen |

Jeder Funkspruch liegt in src/data/radio/ mit Varianten je Preset. Fehlt eine Variante, gilt Nüchtern. Beispiel für das Ereignis „Mauer durchbrochen“:

- Nüchtern: „Sektor 4, Mauer Ost durchbrochen. Feindkontakt.“
- Trocken: „Sektor 4. Mauer Ost hat aufgegeben. Wir bald auch.“
- Horror: „Mauer Ost … sie sind … [Rauschen] … an allen Fenstern …“
- B-Movie: „Die Mauer war aus Pappe, Sir! Wer hat die bestellt?“

## 6. Missionsablauf und Farmphase

Jede Mission hat sechs Phasen. Die Farmphase unterscheidet SPERRZONE am stärksten von ZAR: Das Budget wird erwirtschaftet, nicht geschenkt, und was du in der Ruhe aufbaust, musst du später auch verteidigen.

Rückzug ist kein Endzustand: Er läuft parallel zur Verteidigung, sobald der erste Sektor kippt. Nach der Auswertung folgt die nächste Mission oder ein Neustart.

### Phasen

| Phase | Standarddauer | Inhalt | Ende |
|---|---|---|---|
| 1. Briefing | ohne Zeitlimit | Karte, Epoche, Fraktion, Hinweise auf den Erreger (je nach Schwierigkeit vage oder genau), Ziele, Bot-Auswahl, Startposition des Hauptquartiers | Spieler startet |
| 2. Farmphase | 8 bis 15 Minuten Spielzeit | Wirtschaft, Bevölkerung, Expeditionen, Forschung, Bau der Verteidigung | Countdown läuft ab oder Warnzeichen eskalieren |
| 3. Ausbruch | etwa 1 Minute | Patient Null erscheint an einem Ort (Krankenhaus, Flughafen, Hafen, Labor, Kaserne oder zufällig), erste Infektionskette, stadtweiter Alarm | Infektion überschreitet eine Schwelle |
| 4. Verteidigung | 10 bis 25 Minuten | Echtzeit mit innerer Ausbreitung und Großhorden von außen | Siegbedingung oder Stadtkern fällt |
| 5. Rückzug und Evakuierung | variabel | Sektoren aufgeben, auf innere Ringe zurückziehen, evakuieren (Abschnitt 10) | Evakuierung abgeschlossen oder gescheitert |
| 6. Auswertung | ohne Zeitlimit | Wertung, Heatmap, Zeitraffer, Belohnungen | Weiter, Neustart oder Hauptmenü |

Phase 4 und 5 überlappen: Rückzug ist jederzeit möglich, nicht erst am Ende.

Großhorden: Neben der inneren Ausbreitung kommen in Abständen Horden aus dem Umland. 60 Sekunden vorher meldet der Funk die Richtung („Großhorde aus Nordost, geschätzt 4.000“). Größe und Takt steigen mit Zeit und Schwierigkeit. Ohne Funkverbindung zur Außenaufklärung kommt keine Vorwarnung.

### Countdown und Warnzeichen

- Auf Leicht und Normal ist der Countdown sichtbar. Auf Schwer und Albtraum siehst du nur Warnzeichen.
- Warnzeichen sind Ereignisse mit Hinweis auf die Erregerfamilie: steigende Krankmeldungen, Tierkadaver, Funkstille aus einem Nachbarort, Pilzbefall in der Kanalisation, Ausschlag bei Hafenarbeitern, verseuchtes Grundwasser.
- Jedes ignorierte Warnzeichen erhöht den Ausbruchsdruck und kann den Ausbruch vorziehen. Untersuchst du es per Expedition oder Forschung, bekommst du Zeit, Kodex-Wissen über den Erreger oder Fortschritt beim Impfstoff.
- Option „Klassischer Start“: kein Countdown, der Ausbruch beginnt erst auf Knopfdruck, wie bei ZAR.

### Ressourcen

| Ressource | Quellen | Verbrauch |
|---|---|---|
| Budget | Steuern (Bevölkerung mal Zufriedenheit), Industrie, Hafen, Expeditionen | Bau, Einheiten, Unterstützung, Erlasse |
| Material | Stahlwerk, Schrottplatz, Abriss | Mauern, Türme, Fahrzeuge |
| Treibstoff | Raffinerie, Tanklager, Expeditionen | Fahrzeuge, Luftunterstützung, Generatoren, Flammenwerfer |
| Munition | Munitionsfabrik (aus Material und Chemie) | Alle Waffen, Nachschub über Depots und Logistik |
| Medizin | Krankenhaus, Pharmawerk | Heilung, Quarantäne, Impfung |
| Nahrung | Höfe am Stadtrand, Lager, Märkte | Bevölkerung. Mangel senkt die Moral |
| Strom | Kraftwerk, Generatoren | Licht, Scheinwerfer, Funkmasten, Labore, Elektrozäune |
| Forschungspunkte | Labore, Universität, Erregerproben | Forschung |

Arbeitskraft ist keine Ressource im Lager, sondern zugewiesene Bevölkerung.

### Wirtschaft aufbauen

- Bestehende Stadtgebäude lassen sich übernehmen und umwidmen (Fabrikhalle wird Munitionsfabrik). Das kostet Budget und Zeit. Neue Gebäude entstehen auf Freiflächen.
- Produktionsketten haben höchstens zwei Stufen. Beispiel: Material und Chemie ergeben Munition.
- Gebäude brauchen Arbeiter und Strom und produzieren pro Minute. Lager haben Kapazitäten.
- Ressourcen sind global verfügbar. Ausnahme Munition an der Front: Einheiten füllen nur in Reichweite eines Depots oder über Logistik-Fahrzeuge auf.
- Die Produktion läuft im Kampf weiter, solange die Gebäude stehen und besetzt sind. Industrie liegt meist am Stadtrand. Wer den Außenring aufgibt, verliert seine Wirtschaft. Das ist die zentrale Spannung zwischen Farmphase und Rückzug.
- Wirtschaftsgebäude: Hauptquartier, Stahlwerk, Schrottplatz, Chemiewerk, Munitionsfabrik, Raffinerie, Tanklager, Kraftwerk, Generator, Lagerhaus, Krankenhaus, Pharmawerk, Labor, Universität, Hof, Markt. Jede Epoche hat eigene Varianten und Werte.

### Bevölkerung

- Startbevölkerung je Karte, zum Beispiel 20.000. Bis 30.000 Agenten wird jeder Mensch einzeln simuliert. Darüber steht ein Punkt für mehrere Menschen (Einstellung).
- Zuweisung per Schieberegler in Prozent: Arbeiter (Produktion), Wehrpflichtige (Miliz, schnell und schwach), Helfer (Bautempo, Sanitäter, Dekontamination), Freie (keine Aufgabe).
- Wehrpflicht senkt Steuern und Moral. Zu wenig Arbeiter senkt die Produktion.
- Moral von 0 bis 100. Steigt durch Nahrung, Sicherheit (Mauern, Schutzzonen), Durchsagen und Erfolge. Sinkt durch Verluste, Kollateralschaden, Hunger und aufgegebene Sektoren.
- Niedrige Moral führt zu Streiks, Desertion, Plünderung und früherer Panik im Ausbruch. Hohe Moral bringt Freiwillige und mehr Produktion.
- Erlasse im Hauptquartier mit Vor- und Nachteilen: Ausgangssperre, Rationierung, Notstandsrecht, Pflichtimpfung, Frühevakuierung von Kindern und Alten (rettet Zivilisten, kostet Arbeitskraft), Kriegsrecht, Abriegelung der Bahnhöfe.

### Expeditionen

- Du stellst einen Trupp aus Infanterie, Fahrzeugen und Helfern zusammen und schickst ihn zu einem Ziel im Umland: Dorf, Militärdepot, Forschungsstation, Absturzstelle, Raffinerie, Hof, Funkturm.
- Das Umland ist eine eigene Übersichtskarte rund um die Stadt. Der Trupp verschwindet von der Stadtkarte und meldet sich per Funk.
- Dauer 1 bis 4 Minuten mit Risiko-Anzeige.
- Unterwegs kommen Ereigniskarten mit Entscheidungen, zum Beispiel: „30 Überlebende in einer Kirche, Platz für 20. Zweite Fahrt riskieren?“
- Belohnungen: Ressourcen, Überlebende, Erregerproben, Baupläne für die laufende Mission, Ausrüstung, Aufklärung über Hordenrichtungen.
- Risiken: Verluste, eingeschleppte Infizierte (Quarantäne nötig), Lärm, der den Ausbruch vorzieht.
- Nach dem Ausbruch sind Expeditionen nur noch per Helikopter möglich und teuer.

### Forschung in der Mission

- Gilt nur für die laufende Mission. Dauerhafte Freischaltungen stehen in Abschnitt 16.
- Zweige: Erregeranalyse (Kodex, Schwächen aufdecken, Impfstoff), Waffen (Brand-, Hohlspitz-, Splittermunition, säurefeste Panzerung), Bau (stärkere Mauern, Elektrozaun, automatische Türme), Logistik (Depots, schnellerer Nachschub), Aufklärung (Drohnen, Wärmebild, Funkreichweite).
- Erregeranalyse braucht Proben. Die kommen von Expeditionen oder von besiegten Spezial-Zombies, die ein Sanitäts- oder Labortrupp einsammelt.
- Impfstoff in drei Stufen: Analyse, Prototyp, Massenimpfung. Geimpfte sind zu einem festen Prozentsatz gegen diesen Erreger immun. Mutationen können die Wirkung senken (Abschnitt 8).

### Bauen vor und nach dem Ausbruch

In der Farmphase ist Bauen billig und sicher. Nach dem Ausbruch kostet Bauen 25 Prozent mehr, und unter Beschuss dauert es doppelt so lange. Die Liste der Bauwerke steht in Abschnitt 9.

### Szenario-Parameter

Jede Mission ist eine Datei in src/data/scenarios/ mit: Karte oder Seed, Epoche, Fraktionen, Erreger (einer, auf Albtraum zwei), Patient-Null-Ort, Farmdauer, Startressourcen, Bevölkerung, Startwetter, Jahreszeit, Siegbedingungen, verfügbare Bots, Mutatoren.

## 7. Stadt, Karten und Simulation

Die Stadt ist ein Raster mit Straßengraph. Horden fließen über Flow-Fields, Zivilisten fliehen über Sicherheitsfelder, und Funk, Wetter und Lärm verändern beides ständig.

### Prozedurale Städte

Der Generator arbeitet mit Seed in sieben Schritten:

1. Gelände: 0 bis 2 Flüsse mit 2 bis 6 Brücken, Hügel (erhöhen Sichtweite), optional Küste, Wald am Rand.
2. Hauptstraßen: Radial oder als Raster, je nach Stadttyp. Altstadt organisch, Neustadt Raster, Industrie mit breiten Achsen.
3. Bezirke: Altstadt (dicht, enge Gassen), Wohnviertel, Hochhaussiedlung, Industrie, Hafen, Universität, Krankenhausviertel, Gewerbe, Vororte, Militärgelände, Bahnhof, Flughafen am Rand.
4. Blöcke und Gebäude: Blöcke in Grundstücke teilen, Grundrisse setzen, Stockwerke 1 bis 20. Stockwerke bestimmen Einwohner und Sichtlinien.
5. Schlüsselorte: Krankenhaus, Polizei, Feuerwehr, Kaserne, Kraftwerk, Wasserwerk, Funkturm, Bahnhof, Hafen, Flughafen, Stadion (guter Schutzzonen-Kandidat), Schulen, Kirchen.
6. Kanalisation: Eine schematische zweite Ebene mit Kanaldeckeln als Ein- und Ausgängen. Manche Zombie-Typen nutzen sie.
7. Sektoren und Ringe: 8 bis 16 Sektoren, eingeteilt in Innen-, Mittel- und Außenring.

Prüfregeln nach der Generierung: Jeder Ort ist erreichbar. Es gibt mindestens zwei Evakuierungswege (Straße, Bahn, Hafen oder Landeplatz). Kein Sektor ist ohne Straßenzugang.

| Größe | Fläche | Einwohner |
|---|---|---|
| Klein | 1 x 1 km | 5.000 |
| Mittel | 2 x 2 km | 20.000 |
| Groß | 4 x 4 km | 60.000 (Punkte stehen für Gruppen) |

Epochen verändern die Stadt: 1918 ohne Hochhäuser und Autobahn, 1944 mit Bunkern und Fliegerabwehrtürmen, Kalter Krieg mit Plattenbau und Zivilschutzbunkern, nahe Zukunft mit Megablöcken und Magnetbahn.

### Echte Städte per OpenStreetMap (ab M12)

- Abfrage über die Overpass API per Kartenausschnitt, Ortsname oder Postleitzahl (Ortssuche über Nominatim). Ergebnisse werden zwischengespeichert.
- Umwandlung: Straßen zu Straßengraph und Raster, Gebäude zu Grundrissen (Höhe aus building:levels, sonst Standardwert je Bezirk), Gewässer zu Wasser, Landnutzung zu Bezirken, Einrichtungen wie Krankenhäuser zu Schlüsselorten, Gleise zur Bahn.
- Fehlende Daten werden plausibel aufgefüllt und im Editor sichtbar markiert.
- Pflicht: sichtbarer Hinweis „© OpenStreetMap contributors“ (ODbL). Nutzungsregeln der öffentlichen Server einhalten: zwischenspeichern, kein Massenabruf, eigener User-Agent.
- Mitgelieferte Karten liegen fertig umgewandelt im Spiel, damit es offline läuft.

### Zivilisten

- Zustände: Alltag, alarmiert, auf der Flucht, in Panik, in Schutzzone, evakuiert, infiziert (inkubierend), tot.
- Alltag (Farmphase): Pendeln zwischen Wohnung, Arbeit und Markt. Sichtbar als Ströme von Punkten. Das zeigt, wo die Stadt lebt und wo ein Ausbruch am meisten trifft.
- Inkubierende Infizierte sehen für den Spieler normal aus. Erst die Forschung „Schnelltest“ oder Checkpoints machen sie erkennbar.
- Flucht: Zivilisten folgen einem Sicherheitsfeld zur nächsten Schutzzone oder zum nächsten Korridor, weg von Zombies und Lärm.
- Panik steigt durch nahe Zombies, Explosionen, Schüsse und niedrige Moral. Panische Zivilisten laufen kopflos, verstopfen Straßen, rennen in Horden und ignorieren Korridore teilweise.
- Korridore: Der Spieler zeichnet eine Linie. Sie wird zum bevorzugten Fluchtweg mit Leitpfeilen. Polizei oder Soldaten am Korridor erhöhen, wie viele Zivilisten ihm folgen.
- Sammelpunkte mit Kapazität bündeln Zivilisten für die Evakuierung.
- Schutzzonen haben Kapazität und brauchen Nahrung und Medizin. Gelangt ein Infizierter hinein, bricht die Infektion innen aus. Checkpoints mit Dekontamination am Eingang senken das Risiko.
- Durchsagen per Lautsprecher rufen einen ganzen Sektor zu einem Sammelpunkt. Sie erzeugen aber Lärm und locken Zombies an.

### Infektion

- Kontakt: Ein Zombie-Angriff infiziert mit einer Chance je Erreger. Danach läuft eine Inkubationszeit (Sekunden bis Minuten, je Erreger).
- Umwelt: Sporenfelder (Pilz), verseuchtes Wasser über Wasserwerk und Brunnen (bakteriell), Gaswolken (chemisch), Tiere als Überträger (parasitär), Nanoschwärme (Nanotech).
- Infizierte Soldaten: Auch Einheiten können sich infizieren. Ein Sanitäter behandelt sie vor Ablauf der Inkubation mit Medizin, sonst müssen sie in Quarantäne. Wer sich verwandelt, behält einen Teil seiner Panzerung.
- Leichen können je nach Erreger nach einiger Zeit aufstehen. Verbrennen verhindert das.
- Pro Zelle gibt es ein Infektionsdichte-Feld für Overlay, Pilzsporen und Statistik.

### Lärm

- Schüsse, Explosionen, Fahrzeuge, Sirenen, Lautsprecher und Generatoren erzeugen Lärm mit Radius und Abklingzeit.
- Zombies ziehen zu Lärm, gewichtet je Typ: Brüller reagieren stark, Pilz-Zombies kaum.
- Taktik: Lärmköder und Sirenen lenken Horden um. Die Forschung „Schalldämpfer“ senkt den Lärm der Infanterie.

### Sicht und Aufklärung

- Einstellung „Aufklärung“: Offen (alles sichtbar, wie ZAR), Teilweise (Infektionsflächen sichtbar, Zombies nur in Sichtweite), Voll (Nebel des Krieges, nur letzter bekannter Stand). Standard ist Teilweise.
- Sichtweite hängt von Tageszeit, Wetter, Rauch und Höhe ab. Posten auf Hochhäusern sehen weiter.
- Drohnen, Beobachter, Kameras und Hubschrauber erweitern die Sicht.

### Funk und Befehlskette

- Netz: Hauptquartier, Funkmasten, Funkfahrzeuge. In den Weltkriegen Feldtelefonleitungen entlang der Straßen, die reißen können. In der nahen Zukunft Satellitenverbindung, die Nanotech-Erreger und EMP stören.
- In Reichweite kommen Befehle sofort an. Außerhalb nur verzögert über Melder (in den Weltkriegen sichtbare Läufer, die sterben können) oder gar nicht.
- Ohne Verbindung handeln Einheiten nach ihrer Haltung: Halten, Halten bis Verluste, Aggressiv, Rückzug zum nächsten Sammelpunkt.
- Artillerie und Luftunterstützung brauchen Funk zum Zielgebiet. Ohne Beobachter mit Sicht sinkt die Treffgenauigkeit stark.
- Funkmasten sind Ziele. Kolosse reißen sie ein, Stromausfall legt sie lahm, wenn kein Generator läuft. Gewitter senkt die Reichweite.
- Fällt der Funk in einem Sektor, sinkt dort die Moral, Durchsagen fallen aus, die Panik steigt.
- Befehlskette: Spieler als Oberkommando, darunter Sektorkommandeure (du selbst oder ein Bot, Abschnitt 11), darunter die Einheiten.
- Das Funklog im HUD zeigt alle Meldungen, filterbar nach Sektor, Typ und Wichtigkeit. Ein Klick springt zum Ort.

### Wetter und Tageszeit

Die Werte sind Startwerte für die Datendateien, Balancing passiert später.

| Bedingung | Wirkung auf Erreger | Wirkung auf Kampf und Stadt |
|---|---|---|
| Regen | Pilzsporen +50 % Reichweite, bakterielle Ausbreitung über Wasser +30 % | Sicht −20 %, Feuer breitet sich halb so schnell aus |
| Wind | Sporen und Gas treiben mit Windrichtung und -stärke | Feuer springt in Windrichtung schneller, Luftunterstützung bei Sturm ungenauer |
| Nebel | keine | Sicht −50 %, Scharfschützen kaum wirksam |
| Kälte und Schnee | Virale und bakterielle Zombies −15 % Tempo, Pilze ruhen (keine Sporen) | Bevölkerung braucht mehr Nahrung und Strom |
| Hitze | Bakterielle Ausbreitung +30 %, Träger platzen früher, Pilze trocknen aus (−30 % Sporen) | Treibstoffverbrauch +20 %, Moral sinkt langsam |
| Gewitter | keine | Funkreichweite −40 %, zufällige Stromausfälle, Blitze lösen Brände aus |
| Nacht | Sprinter und Jäger +20 % Tempo, Pilze stoßen nachts Sporen aus | Sicht abhängig von Licht |
| Tag | Lichtscheue parasitäre Typen −20 % Tempo | keine |

Die Jahreszeit des Szenarios bestimmt die Wetterwahrscheinlichkeiten. Das HUD zeigt eine Vorhersage für die nächsten zwei Spielstunden. Mit Forschung wird sie genauer.

## 8. Erreger, Zombie-Typen und mutierende Horde

Sechs Erregerfamilien mit zusammen 18 Zombie-Typen. Jede Familie hat eigene Infektionswege, Schwächen und Wetterabhängigkeiten, und die Horde mutiert gegen die Waffen, die du am häufigsten einsetzt. Alle Zahlen sind Startwerte für src/data/pathogens/ und src/data/zombies/.

### Erregerfamilien

| Familie | Infektion pro Treffer | Inkubation | Leichen stehen auf | Umweltweg | Konter | Epochen |
|---|---|---|---|---|---|---|
| Viral | 40 % | 45 bis 90 s | 30 % nach 60 s | keiner | Masse an Feuerkraft, Verbrennen der Leichen | alle |
| Bakteriell | 25 % | 2 bis 4 min | nein | Wasser, verseuchter Boden | Feuer, Dekontamination, Wasserwerk sichern, Antibiotika-Forschung | alle |
| Pilz | 15 % | 3 bis 6 min | 50 % werden nach 3 min zu Fruchtkörpern | Sporen mit Wind und Regen | Feuer, Fungizid-Sprühfahrzeuge, Kälte | ab Kaltem Krieg |
| Parasitär | 60 % | 20 bis 40 s | nein | Tiere, Kanalisation | Feuer, Licht, Kanaldeckel versiegeln | alle |
| Chemisch-mutagen | 20 % | 1 bis 2 min | 20 % nach 90 s | Gaswolken | Gasmasken, Wind, Sprengstoff | Weltkriege, Kalter Krieg |
| Nanotech | 30 % | 30 s | 50 % sofort | Nanoschwarm | EMP, Elektrozaun | nahe Zukunft |

### Die 18 Typen

Tempo in Metern pro Sekunde (Mensch gehend 1,4, rennend 5). HP und Schaden relativ zu einem Soldaten mit 100 HP.

| Nr. | Typ | Familie | Tempo | HP | Panzerung | Besonderheit | Konter |
|---|---|---|---|---|---|---|---|
| 1 | Läufer | viral | 0,9 | 100 | 0 % | Masse, Basis jeder Horde | Alles |
| 2 | Sprinter | viral | 4,5 | 60 | 0 % | Nachts +20 % Tempo, sucht Lücken | MG-Nester, Stacheldraht |
| 3 | Brüller | viral | 1,2 | 120 | 0 % | Schrei ruft Zombies im Umkreis von 80 m und gibt ihnen +20 % Tempo für 10 s | Scharfschützen, zuerst töten |
| 4 | Koloss | viral | 1,2 | 1.500 | 30 % | Reißt Mauern, Tore, Fahrzeuge und Funkmasten ein | Panzerabwehr, Artillerie |
| 5 | Fäulnisträger | bakteriell | 0,8 | 200 | 0 % | Platzt beim Tod: Giftwolke 6 m, Schaden und Infektion | Auf Distanz töten, Feuer |
| 6 | Säurespucker | bakteriell | 1,0 | 120 | 0 % | Fernangriff 15 m, Säure senkt Panzerung von Mauern und Fahrzeugen | Scharfschützen, Mörser |
| 7 | Seuchenwirt | bakteriell | 0,7 | 150 | 0 % | Hinterlässt verseuchten Boden, verseucht Wasser bei Kontakt mit Fluss oder Wasserwerk | Dekontamination, Feuer |
| 8 | Sporenträger | Pilz | 0,8 | 140 | 10 % | Stößt Sporenwolken aus, kaum lärmempfindlich, im Wärmebild fast unsichtbar | Feuer, Fungizid |
| 9 | Myzelwucherer | Pilz | 0,6 | 300 | 20 % | Setzt sich fest und wird zum Nest. Myzelteppich verlangsamt und infiziert | Flammenwerfer, Brandmunition |
| 10 | Fruchtkörper | Pilz | 0 | 800 | 40 % | Stationär, wächst aus Leichen und Nestern. Sporenstoß alle 30 s, 40 m weit | Artillerie, Feuer |
| 11 | Wirt | parasitär | 1,3 | 90 | 0 % | Beim Tod springt der Parasit auf einen Menschen im Umkreis von 3 m | Feuer, Abstand halten |
| 12 | Larvenschwarm | parasitär | 3,5 | 15 pro Larve | 0 % | Punktwolke aus 20 Larven, nutzt Kanalisation | Flächenwaffen, Flammenwerfer |
| 13 | Puppenspieler | parasitär | 1,5 | 250 | 10 % | Zombies im Umkreis von 60 m umgehen Minen und Fallen und greifen Schwachstellen an. Flieht vor Kampf, lichtscheu | Scheinwerfer, Scharfschützen, Drohnen |
| 14 | Gasgespenst | chemisch | 3,0 | 70 | 0 % | Entsteht in Gaswolken, in Rauch und Gas schwer sichtbar, immun gegen Gas | Wind abwarten, Explosiv |
| 15 | Panzerhaut | chemisch | 0,8 | 400 | 60 % gegen Kleinkaliber | Verkalkte Haut | Feuer, Sprengstoff, Großkaliber |
| 16 | Nanokonstrukt | Nanotech | 2,0 | 300 | 30 % | Regeneriert 5 HP pro Sekunde, stört Funk und Elektronik im Umkreis von 40 m | EMP |
| 17 | Schwarmwolke | Nanotech | 2,5 | 500 als Wolke | 0 % | Fliegt über Mauern, infiziert flächig | EMP, Feuer bedingt |
| 18 | Infizierte Tiere | jede außer Nanotech | 2 bis 8 | 20 bis 60 | 0 % | Varianten: Ratten (Kanalisation), Hunde (sehr schnell), Krähen (fliegen über Mauern). Tragen den Erreger ihrer Familie | Flächenwaffen, Kanal versiegeln, Flak |

Patient Null ist ein Sondertyp zu Missionsbeginn: doppelte HP, eine Aura mit +15 % Tempo für Zombies im Umkreis von 30 m, alle Fähigkeiten seiner Familie. Stirbt er in den ersten zwei Minuten, verlangsamt sich die Ausbreitung für fünf Minuten deutlich.

### Zusammensetzung der Horde

- Jede Familie hat eine Verwandlungstabelle. Beispiel viral: 75 % Läufer, 18 % Sprinter, 5 % Brüller, 2 % Koloss.
- Mit der Dauer des Ausbruchs steigt der Reifegrad. Der Anteil der Spezialtypen wächst, bis zu doppelt so viele nach 20 Minuten.
- Kolosse entstehen bevorzugt aus Soldaten und Feuerwehrleuten.
- Großhorden von außen haben eigene Zusammensetzungen je Szenario.

### Verhalten der Horde

1. Ziel ist der nächste Mensch in Sichtweite (25 m) oder Hörweite (Lärmfeld).
2. Sonst folgen Zombies dem Lärm-Flow-Field.
3. Sonst wandern sie entlang des Dichtegefälles Richtung Stadtzentrum.
4. Separation verhindert Überlappen. Jede Zelle hat eine Dichteobergrenze.
5. Druck auf Hindernisse: Zombies vor einer Mauer verursachen Schaden abhängig von ihrer Anzahl. Ab einer Dichteschwelle türmen sie sich auf, und Einzelne klettern über niedrige Mauern.
6. Zombies umgehen Feuer, außer sie sind im Ansturm auf ein nahes Ziel.

### Mutierende Horde

Die Horde passt sich an deine meistgenutzten Waffen an. Jede Mutation hat einen Nachteil, damit gemischte Bewaffnung belohnt wird.

- Das Mutationssystem misst alle 30 Sekunden Spielzeit, welcher Schadensart die Zombies in den letzten drei Minuten ausgesetzt waren: Kleinkaliber, Großkaliber, Explosiv, Feuer, Gas und Chemie, Elektrisch und EMP, Nahkampf, Überrollen.
- Liegt eine Schadensart über 40 Prozent Anteil, steigt der Mutationsdruck dafür. Ist er voll, tragen neue Zombies und 25 Prozent der bestehenden die Mutation.
- Höchstens 3 aktive Mutationen pro Mission auf Normal, 5 auf Albtraum.
- Jede Mutation senkt die Wirkung eines Impfstoffs um 15 Prozentpunkte.
- Das Labor meldet Mutationen über Funk und Kodex. Mit der Forschung „Genomsequenzierung“ zeigt das HUD den Mutationsdruck schon vorher als Balken.

| Mutation | Auslöser | Wirkung | Nachteil |
|---|---|---|---|
| Verhornung | Kleinkaliber | −25 % Kleinkaliber-Schaden | +20 % Feuerschaden |
| Feuerhaut | Feuer | −30 % Feuerschaden | +15 % Explosivschaden |
| Druckfest | Explosiv | −25 % Explosivschaden | −10 % Tempo |
| Filterlunge | Gas und Chemie | Immun gegen Gas | +20 % Kleinkaliber-Schaden |
| Isoliert | Elektrisch und EMP | −50 % Wirkung von EMP und Elektrozaun | −15 % HP |
| Minenspürsinn | Viele Minentote | Umgeht Minenfelder | Sammelt sich vor Feldern, gut für Artillerie |
| Kletterer | Lange gehaltene Mauern | 10 % können Mauern überklettern | −20 % HP |
| Schwarmsinn | Viele Scharfschützen-Tote | Spezialtypen bewegen sich in Deckung der Masse | Ballung, gut für Flächenwaffen |

## 9. Epochen, Fraktionen, Einheiten, Bauwerke und Unterstützung

Vier Epochen mit insgesamt zwölf Fraktionen. Alle Einheiten folgen denselben Grundkategorien, damit Balancing und Bot-KI über alle Epochen funktionieren. Epoche und Fraktion bestimmen Werte, Aussehen und Sonderfähigkeiten.

### Epochen und Orte

| Epoche | Zeit | Szenario-Orte | Technik | Erreger-Schwerpunkt |
|---|---|---|---|---|
| Weltkriege | 1918 und 1944 als zwei Kapitel | 1918: Etappenstadt in Nordfrankreich, Lazarettstadt (der Erreger wird als Spanische Grippe verkannt). 1944: zerstörte Hafenstadt in der Normandie, Bergstadt in Italien | Gräben, Feldtelefon, frühe Panzer, Doppeldecker, später Jagdbomber | viral, chemisch, parasitär |
| Kalter Krieg | 1960 bis 1989 | Geteilte Stadt mit Mauer, Kleinstadt in der Fulda-Lücke, geschlossene Stadt mit Biowaffenlabor | Kampfhubschrauber, Funknetz, ABC-Abwehr, Wärmebild ab 1980 | bakteriell, chemisch, Pilz |
| Gegenwart | 2026 | Großstadt an Rhein und Ruhr, Hafenstadt an der Nordsee, Inselstadt im Mittelmeer | Drohnen, Präzisionswaffen, Satellitenbilder | alle außer Nanotech |
| Nahe Zukunft | ab 2040 | Megastadt hinter einer Klimamauer, schwimmende Stadt, Forschungsstadt in der Arktis | Exoskelette, Laser, Drohnenschwärme, EMP | Nanotech, Pilz, parasitär |

In der geteilten Stadt ist die Mauer Spielmechanik: Zwei Fraktionen verteidigen je eine Hälfte, die Mauer hält Zombies und trennt zugleich Nachschub und Evakuierung.

### Fraktionen

| Fraktion | Epoche | Stärke | Schwäche | Sonderfähigkeit | Bot-Persönlichkeit |
|---|---|---|---|---|---|
| Entente | 1918 | Artillerie, Gräben | Langsam, kaum Fahrzeuge | Feuerwalze: Sperrfeuer, das sich 200 m vorwärts schiebt | Methodisch |
| Mittelmächte | 1918 | Stoßtrupps, frühe Flammenwerfer | Knapper Nachschub | Stoßtrupp-Vorstoß: Infanterie +30 % Tempo für 30 s | Aggressiv |
| Alliierte | 1944 | Luftüberlegenheit, Logistik | Teuer | Bomberverband über 300 m Linie | Logistiker |
| Rote Armee | 1944 | Masse an Infanterie, Raketenwerfer | Wenig Funk, Befehle verzögert | Raketenwerfer-Salve | Aggressiv |
| Résistance | 1944 | Kennt Kanalisation, Sabotage | Leichte Waffen | Kanal-Hinterhalt: Trupp taucht an beliebigem Kanaldeckel auf | Opportunist |
| NATO | Kalter Krieg | Präzision, Kampfhubschrauber, Funk | Teuer, wenige Einheiten | Luftlandeoperation | Methodisch |
| Warschauer Pakt | Kalter Krieg | Viele Panzer, ABC-Abwehrtruppen | Starre Befehlskette, ohne Hauptquartier langsam | Dekontaminationszug | Massiv |
| NATO | Gegenwart | Drohnen, Präzisionsschläge | Hohe Munitionskosten | Präzisionsschlag | Methodisch |
| UN-Blauhelme | Gegenwart | Schutzzonen, Evakuierung, Moral | Einsatzregeln: doppelter Malus für Kollateralschaden, leichte Bewaffnung | Luftbrücke: Evakuierung und Versorgung | Schützer |
| Katastrophenschutz und Polizei | Gegenwart | Schneller Bau, Absperrungen, Ortskenntnis | Schwache Feuerkraft | Großabsperrung: ganzer Straßenzug in 20 s gesperrt | Baumeister |
| Vereinte Verteidigungsallianz (fiktiv) | Nahe Zukunft | Exoskelette, Drohnenschwärme, Laser-Abwehr | Hoher Strombedarf | Orbitale Aufklärung: 30 s volle Sicht | Methodisch |
| UN-Seuchenschutzkorps (fiktiv) | Nahe Zukunft | Nanomedizin, mobile Labore | Wenig schwere Waffen | Impfdrohnen | Schützer |
| Konzernmiliz „Arcturon“ (fiktiv) | Nahe Zukunft | Kampfroboter, autonome Türme | Von Nanotech-Erregern störbar | Robotikfabrik | Opportunist |

Der Spieler wählt eine Hauptfraktion. Bots können andere Fraktionen derselben Epoche spielen. NATO und UN tauchen nur als Namen auf, nie mit offiziellen Emblemen. Es gibt keine spielbare NS-Fraktion und keine NS-Symbole.

### Einheiten nach Kategorie und Epoche

| Kategorie | 1918 | 1944 | Kalter Krieg | Gegenwart | Nahe Zukunft |
|---|---|---|---|---|---|
| Infanterie | Linieninfanterie | Schützengruppe | Motorisierte Schützen | Infanteriegruppe | Exo-Infanterie |
| Miliz aus Wehrpflichtigen | Landsturm | Bürgerwehr | Betriebskampfgruppe | Bürgerwehr | Freiwilligenwache |
| MG-Trupp | Schweres MG | MG-Nest | Mehrzweck-MG | MG-Team | Railgun-Team |
| Scharfschütze | Scharfschütze | Scharfschütze | Scharfschütze | Scharfschützenteam | Smart-Gewehr-Team |
| Feuertrupp | Flammenwerfer | Flammenwerfer | Napalmwerfer | Brandmunitions-Trupp | Plasmawerfer |
| Pioniere | Pioniere | Pioniere | Pioniere | Pioniere | Baudrohnen-Trupp |
| Sanitäter | Sanitäter | Sanitäter | Sanitäter | Sanitätstrupp | Nanomedic |
| Dekontamination | Gastrupp | Gastrupp | ABC-Abwehr | ABC-Abwehr | Dekon-Drohnen |
| Polizei | Gendarmerie | Polizei | Polizei | Bereitschaftspolizei | Sicherheitsdienst |
| Mörser | Grabenmörser | Mörser | Mörser | Mörser | Smart-Mörser |
| Artillerie | Feldkanone | Haubitze | Haubitze | Panzerhaubitze | Railgun-Batterie |
| Raketenartillerie | keine | Raketenwerfer | Raketenwerfer | Raketenwerfer | Schwarmraketen |
| Leichtes Fahrzeug | Lkw | Geländewagen | Schützenpanzer | Radpanzer | Drohnenträger |
| Panzer | Früher Panzer (sehr langsam) | Kampfpanzer | Kampfpanzer | Kampfpanzer | Kampfläufer |
| Logistik | Pferdewagen | Lkw | Lkw | Lkw | Autonomer Transporter |
| Hubschrauber | keine | keine | Kampf- und Transporthubschrauber | Kampf- und Transporthubschrauber | Kipprotor-Drohnen |
| Aufklärung | Beobachtungsballon | Spähtrupp | Spähpanzer | Drohne | Mikrodrohnen |

Flugzeuge sind keine steuerbaren Einheiten, sondern Unterstützung.

### Referenzwerte Gegenwart

Die anderen Epochen leiten sich mit Faktoren ab: Weltkriege Feuerkraft ×0,6 und Kosten ×0,7, Kalter Krieg Feuerkraft ×0,85, nahe Zukunft Feuerkraft ×1,3, Kosten ×1,5 und Strombedarf.

| Einheit | Größe | HP | Reichweite (m) | Schaden pro s | Kosten | Besonderheit |
|---|---|---|---|---|---|---|
| Infanteriegruppe | 8 | 100 je Soldat | 40 | 60 | 300 | Besetzt Gebäude, Deckung +50 % |
| Miliz | 10 | 80 je Person | 30 | 30 | 80 plus 10 Wehrpflichtige | Moral-empfindlich |
| MG-Team | 3 | 100 | 60 | 120 | 450 | Unterdrückung: Zombies im Feuerkegel −30 % Tempo |
| Scharfschützenteam | 2 | 90 | 150 | 40 (200 pro Treffer) | 400 | Zielt zuerst auf Spezialtypen |
| Brandmunitions-Trupp | 3 | 110 | 15 | 200 Fläche | 500 | Verbrennt Leichen und Myzel |
| Pioniere | 6 | 100 | 30 | 20 | 350 | Bauen, Minen, Sprengen, Reparieren |
| Sanitätstrupp | 4 | 90 | keine | keiner | 300 | Heilen, Infizierte behandeln, Proben sammeln |
| ABC-Abwehr | 4 | 100 | 10 | keiner | 400 | Sporen und Gift entfernen, Checkpoints betreiben |
| Bereitschaftspolizei | 8 | 90 | 25 | 20 | 200 | Korridor-Befolgung +50 %, Panik − |
| Mörser | 3 | 100 | 60 bis 600 | 150 Fläche | 600 | Braucht Sicht oder Beobachter |
| Panzerhaubitze | 1 | 600 | 200 bis 4.000 | 400 Fläche | 1.500 | Braucht Funk |
| Radpanzer | 1 | 800 | 60 | 150 | 1.200 | Transportiert 8, überrollt |
| Kampfpanzer | 1 | 2.000 | 80 | 300 | 2.500 | Kanone mit Flächenschaden, gut gegen Kolosse |
| Logistik-Lkw | 1 | 300 | keine | keiner | 400 | Munitionsnachschub im Umkreis von 40 m |
| Kampfhubschrauber | 1 | 600 | 200 | 400 | 3.000 | Muss zum Tanken zurück, Rauch blockiert |
| Transporthubschrauber | 1 | 500 | keine | keiner | 2.000 | Evakuiert 20 Personen, Expeditionen |
| Aufklärungsdrohne | 1 | 50 | Sicht 200 | keiner | 250 | Akku 3 min |

Alle Einheiten verbrauchen Munition und, falls motorisiert, Treibstoff. Unterhalt kostet Budget pro Minute.

### Verhalten und Werte der Einheiten

- Haltungen: Halten, Halten bis 50 % Verluste, Aggressiv, Rückzug zum Sammelpunkt. Dazu Feuerfreigabe: Feuer frei oder nur auf Befehl, damit Flächenwaffen keine Zivilisten treffen.
- Moral der Truppe: Sinkt bei Verlusten, Kolossen und Brüllern in der Nähe. Steigt in der Nähe von Hauptquartier und Offizieren. Bei niedriger Moral ziehen sich Einheiten eigenmächtig zurück.
- Erfahrung: Drei Ränge, je Rang +10 % Treffsicherheit und +10 % Moral.
- Kollateralschaden: Flächenwaffen treffen Zivilisten. Das kostet Wertung und Moral.

### Bauwerke der Verteidigung

| Bauwerk | Funktion | Epochen-Varianten |
|---|---|---|
| Barrikade | Billig, schwach, aus Autos und Möbeln | alle |
| Sandsackstellung | Deckung für Infanterie | alle |
| Mauer | Blockiert, hat HP, drei Ausbaustufen | Holz und Graben, Betonsperren, Betonmauer, Container- und Gitterkorbmauer, Energiebarriere |
| Tor | Durchlass für eigene Einheiten und Zivilisten, schließt automatisch bei Zombies im Umkreis von 15 m | alle |
| Stacheldraht | Verlangsamt um 60 % | alle |
| Graben | Verlangsamt, Zombies fallen hinein und stauen sich | stark in den Weltkriegen |
| Minenfeld | Einmalige Explosionen | alle |
| Sprengladung | Ferngezündet. Sprengt auch Brücken und Gebäude, Trümmer blockieren Straßen | alle |
| MG-Nest oder Bunker | Befestigte Stellung | alle |
| Wachturm | Sicht, Bonus für Scharfschützen | alle |
| Automatischer Geschützturm | Braucht Strom und Munition | ab Gegenwart |
| Scheinwerfer | Licht, vertreibt Puppenspieler | alle |
| Elektrozaun | Schaden, braucht Strom | ab Kaltem Krieg |
| Funkmast | Funkabdeckung | Feldtelefon-Knoten in den Weltkriegen |
| Munitionsdepot | Nachschubradius | alle |
| Feldlazarett | Heilung und Behandlung | alle |
| Quarantänestation | Isoliert Infizierte, begrenzte Plätze | alle |
| Dekon-Checkpoint | An Toren, erkennt mit Forschung Inkubierende | alle |
| Schutzzone | Markierter Bereich mit Gebäuden, nimmt Zivilisten auf | alle |
| Sammelpunkt | Ziel für Korridore und Evakuierung | alle |
| Landeplatz | Evakuierung, Hubschrauberbasis | ab Kaltem Krieg |
| Lautsprecher und Sirene | Durchsagen, Köder | alle |
| Lärmköder | Lenkt Horden um | alle |
| Brandsperre | Ölgraben, der für 60 s eine Feuerwand bildet | alle |
| Fungizid-Anlage | Senkt Sporen im Umkreis | ab Kaltem Krieg |

### Unterstützung (Live-Fähigkeiten)

Alle Unterstützungen brauchen Funk zum Zielgebiet, kosten Budget und Treibstoff und zählen beim Kollateralschaden.

| Fähigkeit | Epochen | Wirkung | Kosten | Abklingzeit |
|---|---|---|---|---|
| Artillerie-Sperrfeuer | alle | Linie von 200 m für 30 s | 1.200 | 120 s |
| Luftschlag | ab 1918 (klein), ab 1944 voll | Fläche mit 60 m Durchmesser | 2.000 | 240 s |
| Brandbomben | ab 1944 | Feuerteppich 80 x 20 m, löst Brände aus | 2.500 | 300 s |
| Gaseinsatz | Weltkriege, Kalter Krieg | Wolke mit 50 m Durchmesser, treibt mit dem Wind, trifft ungeschützte Zivilisten, chemische Zombies immun | 1.000 | 180 s |
| Fallschirmjäger | ab 1944 | Zwei Infanteriegruppen landen nach 20 s | 1.500 | 180 s |
| Panzerverstärkung | ab 1944 | Zwei Panzer vom Kartenrand | 3.000 | 300 s |
| Versorgungsabwurf | ab 1944 | Munition oder Medizin an einem Punkt | 600 | 90 s |
| Raketenschlag | ab Kaltem Krieg | Präzise, 20 m Durchmesser, hoher Schaden | 1.800 | 150 s |
| Kampfhubschrauber-Einsatz | ab Kaltem Krieg | Hubschrauber kreist 60 s über dem Ziel | 2.000 | 200 s |
| Drohnenschwarm | Gegenwart (klein), nahe Zukunft | Autonomer Angriff für 45 s | 1.500 | 180 s |
| EMP | nahe Zukunft | 100 m Radius: Nanotech-Zombies gelähmt oder zerstört, eigene Elektronik 30 s aus | 2.500 | 300 s |

Dazu kommen die Sonderfähigkeiten der Fraktionen aus der Tabelle oben.

## 10. Rückzug, Evakuierung, Sieg und Wertung

Die Stadt muss nicht vollständig gehalten werden. Wer rechtzeitig Sektoren aufgibt und evakuiert, kann eine verlorene Stadt noch in einen Sieg verwandeln. Gewertet wird vor allem nach geretteten Zivilisten.

### Sektoren und Rückzug

- Sektorstatus: sicher, bedroht, umkämpft, überrannt, aufgegeben. Der Status hängt von Zombie-Dichte, eigener Präsenz und Zivilisten im Sektor ab und ist in der Minikarte farbig markiert.
- Sektor aufgeben (Befehl AbandonSector): Einheiten ziehen sich über eine Route zum nächsten inneren Sektor zurück. Lager werden 60 Sekunden lang geräumt, was übrig bleibt, ist verloren. Pioniere können vorbereitete Sprengladungen an Brücken und Straßen zünden, um die Verfolger aufzuhalten.
- Folgen: Produktion des Sektors fällt weg, Moral sinkt einmalig um 10. Zivilisten, die noch im Sektor sind, bleiben zurück. Das HUD warnt mit ihrer Zahl, bevor du bestätigst.
- Gegenstoß: Ein gesäuberter Sektor kann zurückerobert werden. Das hebt die Moral um 5.
- Der Innenring hat einen kürzeren Umfang. Weniger Truppen halten ihn, das macht den Rückzug zu einer echten Option und nicht nur zur Niederlage auf Raten.
- Ausweich-Hauptquartier: Fällt das Hauptquartier, kann ein vorher gebautes Ausweich-Hauptquartier übernehmen. Ohne Ersatz bricht die Befehlskette zusammen (alle Einheiten handeln autonom).

### Evakuierung

| Weg | Kapazität | Takt | Bedingung |
|---|---|---|---|
| Bahn | 400 Personen pro Zug | alle 3 min | Bahnhof gehalten, Gleise frei |
| Straße | 40 pro Bus oder Lkw | laufend | Freie Route zum Kartenrand, Eskorte empfohlen |
| Hafen | 600 pro Schiff | alle 4 min | Hafen gehalten |
| Hubschrauber | 20 pro Flug | 90 s pro Umlauf | Landeplatz, kein Sturm |
| Flugzeug | 150 pro Flug | alle 5 min | Flughafen gehalten, ab Gegenwart |

- Evakuierung braucht einen Sammelpunkt nahe am Abfahrtsort. Ohne Checkpoint gelangen Inkubierende an Bord. Das kostet Wertung und in der Kampagne schwere Folgen für die nächste Mission (Ausbruch im Aufnahmelager).
- Transporte kommen nur, wenn die Route offen ist. Der Zustand jeder Route ist auf der Karte markiert.
- Am Ende können auch die eigenen Truppen ausgeflogen werden. Ihr Überleben zählt zur Wertung.

### Vier Siegbedingungen

1. Ausrottung: Alle Zombies tot, keine Inkubierenden mehr, wie bei ZAR.
2. Evakuierung: Ein Anteil der Bevölkerung (Standard 60 %) und der Kommandostab sind lebend evakuiert.
3. Halten: Ein Kern (Innenring oder bestimmte Orte wie Labor oder Krankenhaus) wird bis zu einem Zeitpunkt gehalten, etwa bis der Entsatz eintrifft.
4. Eindämmung: Impfstoff verteilt oder Infektion für drei Minuten unter 1 % der Stadtfläche, und alle Nester und Fruchtkörper sind zerstört.

Das Szenario legt fest, welche Bedingungen gelten und ob eine reicht oder alle nötig sind.

Niederlage: Hauptquartier und Ausweich-Hauptquartier gefallen, oder die Bevölkerung fällt unter eine Schwelle, ohne dass evakuiert wurde, oder ein Zeitlimit läuft ab (nur in Herausforderungen).

### Wertung

| Faktor | Punkte |
|---|---|
| Geretteter Zivilist (evakuiert oder am Ende in sicherer Zone) | +10 |
| Überlebender Soldat | +3 |
| Getöteter Zombie | +0,2 |
| Schneller Sieg | bis +2.000, linear fallend über 40 Minuten |
| Zivilist durch eigene Waffen getötet | −30 |
| Infizierter evakuiert | −50 |
| Aufgegebener Sektor | −500 |

Multiplikator nach Schwierigkeit: Leicht 0,5, Normal 1, Schwer 1,5, Albtraum 2,5. Mutatoren ändern ihn nach oben oder unten. Medaillen Bronze, Silber, Gold nach Schwellen je Szenario.

### Auswertung nach der Mission

- Ergebnis, Medaille und die Wertung Zeile für Zeile.
- Verlaufsdiagramme über die Missionszeit: Infizierte, Zivilisten, Soldaten, Ressourcen, Moral.
- Heatmaps für Infektion, Verluste und Kollateralschaden auf der Stadtkarte.
- Zeitraffer der ganzen Mission aus der Befehlsliste, 30 bis 60 Sekunden lang, mit Zeitleiste zum Vor- und Zurückspulen.
- Schlüsselmomente als Marker auf der Zeitleiste: erste Mauer gefallen, erster Koloss, Mutation, Sektor aufgegeben.
- Bot-Bericht: was jeder Bot gemacht hat, mit Wertungsanteil.
- Neue Kodex-Einträge und erhaltene Meta-Punkte.
- Knöpfe: Neustart mit gleichem Seed, Neustart mit neuem Seed, Replay speichern, Weiter.
- Lokale Bestenliste je Szenario und Seed. Keine Online-Bestenliste.

## 11. KI-Bots

Bis zu drei KI-Bots kämpfen an der Seite des Spielers, dazu optional ein Adjutant. Bots spielen nach denselben Regeln wie der Spieler: gleicher Wissensstand (je nach Aufklärungs-Einstellung), dieselben Befehle über dieselbe Warteschlange, eigenes Budget. Unterhalb der Stufe „Legende“ schummeln sie nicht.

### Rollen

| Rolle | Was er tut |
|---|---|
| Co-op-Partner | Ersetzt den zweiten Spieler. Bekommt einen eigenen Stadtbereich und ein eigenes Budget, baut Wirtschaft und Verteidigung selbst. Budget wahlweise als Anteil der Gesamtwirtschaft oder als getrennte Wirtschaft seiner Sektoren |
| Fraktionskommandant | Spielt eine Fraktion mit deren Einheiten und Sonderfähigkeit. Übernimmt einen Sektor oder eine Aufgabe wie Evakuierung oder Artillerie-Unterstützung. Hat eine Persönlichkeit |
| Adjutant | Hat keinen eigenen Sektor. Nimmt dem Spieler Arbeit ab, jede Automatik einzeln schaltbar: Arbeiter verteilen, Produktion, Nachschub, Reparaturen, Forschungswarteschlange. Modus „Vorschlagen“ (fragt per Benachrichtigung) oder „Ausführen“. Warnt früh: „Mauer Ost bei 20 %“, „Munition in 2 Minuten leer“ |

Der Adjutant zählt nicht zu den drei Bot-Plätzen.

### Persönlichkeiten

Jede Persönlichkeit ist ein Satz Gewichte in src/data/ und damit ohne Code erweiterbar.

| Persönlichkeit | Verhalten | Schwäche |
|---|---|---|
| Methodisch | Tiefe Verteidigung nach Lehrbuch, wenig Risiko | Reagiert langsam auf Überraschungen |
| Aggressiv | Gegenstöße, jagt Nester, setzt Unterstützung früh ein | Hohe Verluste |
| Logistiker | Wirtschaft und Nachschub zuerst, versorgt andere Sektoren | Schwache eigene Front |
| Massiv | Masse und Panzer | Teuer, wenig Feinarbeit |
| Schützer | Zivilisten zuerst: Schutzzonen, Korridore, Evakuierung | Gibt Sektoren früh auf |
| Baumeister | Mauern, Türme, Fallen | Kaum Gegenstöße |
| Opportunist | Nutzt Gelegenheiten, viele Expeditionen | Unberechenbar, manchmal riskant |

### Stärkestufen (pro Bot einstellbar)

| Stufe | Reaktionszeit | Befehle pro Minute | Planung | Fehler und Vorteile |
|---|---|---|---|---|
| Rekrut | 6 s | 10 | ein Ziel gleichzeitig | Vergisst in 20 % der Fälle Nachschub oder Reparatur |
| Soldat | 3 s | 20 | zwei bis drei Ziele | Kleine Fehler |
| Veteran | 1,5 s | 40 | volle Planung | Kaum Fehler |
| Elite | 0,5 s | 80 | volle Planung mit Vorausschau auf Hordenrichtung und Mutation | Keine Fehler |
| Legende | 0,5 s | 80 | wie Elite | Schummelt offen: +25 % Ressourcen und volle Sicht, im Bot-Panel markiert |

### Aufbau der Bot-KI

- Utility AI mit drei Ebenen: strategisch alle 10 Sekunden (Sektorziele, Wirtschaftsplan, Forschung), taktisch jede Sekunde (Einheiten verschieben, bauen, Unterstützung), Reflex über die Haltungen der Einheiten.
- Jede mögliche Aktion bekommt einen Wert aus Faktoren wie Bedrohung im Sektor, Mauer-HP, Munition, Ressourcen, Zivilisten in Gefahr, Wetter und aktive Mutationen. Die Persönlichkeit gewichtet die Faktoren. Der Bot führt die besten Aktionen im Rahmen seiner Befehle pro Minute aus.
- Einflusskarten für Bedrohung, Kontrolle und Zivilisten. Sie nutzen dieselben Felder wie die Simulation.
- Bots denken versetzt in verschiedenen Ticks, damit die Last verteilt ist. Jeder Bot hat einen eigenen RNG-Strom, die Partie bleibt deterministisch.
- Bots als Testwerkzeug: Ein Headless-Modus lässt Bots ein Szenario allein spielen. qa-review nutzt das für Balancing: 20 Seeds, Siegquote und Wertung je Szenario und Schwierigkeit.

### Zusammenarbeit mit Bots

- Meldungen im Funklog im gewählten Ton-Preset: „Kommandant Weber (NATO): Sektor 3 hält, brauche Munition.“
- Anfragen der Bots nach Ressourcen, Verstärkung oder Unterstützung erscheinen als Benachrichtigung mit Annehmen und Ablehnen.
- Befehle an Bots über das Bot-Panel oder ein Radialmenü auf ihrem Sektor: Sektor halten, Verstärkung nach X schicken, Evakuierung übernehmen, Nester bekämpfen, Rückzug, Ressourcen abgeben, freie Hand.
- Pings: Der Spieler markiert Orte mit „Angriff hier“, „Verteidigen“, „Gefahr“ oder „Hier bauen“. Bots reagieren je nach Persönlichkeit.
- Bot-Panel im HUD: generiertes Symbol (keine echten Gesichter), Name, Fraktion, Persönlichkeit, Stufe, Sektor, Budget, aktuelle Absicht in einem Satz („Baue Mauer am Nordtor“).

### Auswahl im Briefing

- Drei Bot-Plätze mit Rolle, Fraktion, Persönlichkeit, Stufe, Sektor (automatisch oder per Klick auf die Karte), Name (zufällig aus einer Liste je Fraktion) und Budget-Anteil.
- Vorlagen: „Ausgewogenes Team“, „Ich baue, ihr kämpft“, „Nur Adjutant“, „Alle gegen die Horde“ (drei Elite-Bots).

## 12. Spielmodi, Sandbox und Editor

Neun Modi von der Kampagne bis zur freien Sandbox, alle auf derselben Simulation. Nur Kampagne, Szenario, Schnelles Gefecht, Endlos und Herausforderungen bringen Meta-Fortschritt.

### Übersicht

| Modus | Inhalt | Meta-Fortschritt |
|---|---|---|
| Tutorial | Fünf Lernmissionen (Abschnitt 15) | ja, schaltet die Kampagnen frei |
| Kampagne | Je Epoche 5 bis 6 Missionen, zusammen 22 | ja |
| Szenario | Einzelmission, frei einstellbar | ja |
| Schnelles Gefecht | Zufallsstadt, 5 Minuten Farmphase, 10 bis 15 Minuten gesamt | ja |
| Endlos | Wellen ohne Ende, Bestenliste nach Überlebenszeit | ja |
| Herausforderungen | Handgebaute Aufgaben mit Einschränkungen plus Tagesherausforderung | ja |
| Sandbox | Alles frei, Götterwerkzeuge | nein |
| Editor | Karten und Szenarien bauen | nein |
| Online-Co-op | Zwei Spieler, optional, letzter Meilenstein | ja |

### Kampagne

- Jede Epoche hat eine eigene Kampagne auf einer Regionalkarte mit mehreren Städten. Zwischen den Missionen triffst du Entscheidungen: welche Stadt zuerst, welche Ressourcen mitgehen, welche Fraktion Verstärkung schickt.
- Folgen tragen sich fort: Evakuierte werden Bevölkerung der nächsten Stadt. Eingeschleppte Infizierte lösen dort früher einen Ausbruch aus. Aufgegebene Städte vergrößern die Großhorden der nächsten Mission.
- Rahmenhandlung „Das Erbe“: Derselbe Ur-Erreger taucht in jeder Epoche wieder auf. 1918 wird er als Grippe verkannt, 1944 versucht jemand, ihn als Waffe zu nutzen, im Kalten Krieg entweicht er aus einem Labor, in der Gegenwart kehrt er zurück, in der nahen Zukunft wird er mit Nanotechnik bekämpft und verändert sich erneut. Jede Kampagne steht für sich, zusammen ergeben sie die Geschichte. Erzählt wird über Briefings, Funk und Kodex.
- Nach dem Tutorial sind alle vier Kampagnen offen. Reihenfolge frei.

### Endlos

- Großhorden ohne Ende, alle drei Minuten stärker. Mutationen ohne Obergrenze.
- Flüchtlinge aus dem Umland strömen regelmäßig nach. Evakuieren bringt Punkte, hält die Stadt aber nicht leer.
- Lokale Bestenliste nach Überlebenszeit und Geretteten.

### Herausforderungen

- Handgebaute Szenarien mit Einschränkungen, zum Beispiel „Nur Polizei“, „Keine Mauern“, „Stromausfall von Anfang an“, „Evakuiere 90 % in 15 Minuten“.
- Tagesherausforderung: Seed aus dem Datum, also für jeden Tag eine feste Kombination aus Stadt, Erreger, Fraktion und Mutatoren. Ohne Server, nur lokal.

### Mutatoren

Mutatoren ändern Regeln und den Wertungs-Multiplikator. Sie sind in Szenario, Schnellem Gefecht, Endlos und Sandbox wählbar.

| Mutator | Wirkung | Multiplikator |
|---|---|---|
| Doppelte Horde | Alle Horden ×2 | +0,5 |
| Kurze Ruhe | Farmphase halbiert | +0,3 |
| Ewige Nacht | Immer Nacht | +0,3 |
| Dauerregen | Immer Regen | +0,2 |
| Funkstille | Kein Funk, nur Melder | +0,5 |
| Sprinterplage | 30 % aller Zombies sind Sprinter | +0,4 |
| Mürbe Brücken | Brücken halten nur 20 % | +0,2 |
| Glaskanonen | Aller Schaden ×2, alle HP ×0,5 | 0 |
| Hungersnot | Nahrung −50 % | +0,3 |
| Kein Zurück | Sektoren lassen sich nicht aufgeben | +0,4 |
| Erbarmungslos | Jede Leiche steht auf | +0,5 |
| Blinde Horde | Zombies nur über Gehör | −0,2 |
| Explosive Tote | Jeder Zombie platzt wie ein Fäulnisträger | +0,3 |
| Schnelle Evolution | Mutationsdruck ×3 | +0,5 |
| Riesenwuchs | 10 % Kolosse | +0,6 |
| Epochenmix | Einheiten aller Epochen verfügbar | −0,3 |
| Erregerkrieg | Zwei Erregerfamilien konkurrieren um Wirte | +0,5 |
| Reiche Stadt | Startressourcen ×3 | −0,4 |

### Sandbox

- Start mit generierter, gespeicherter oder leerer Stadt. Alle Epochen, Fraktionen, Einheiten und Erreger verfügbar. Unendliche Ressourcen als Schalter.
- Werkzeuge: Zombies setzen (Typ, Anzahl, Pinselgröße, Mutationen), Zivilisten setzen, Einheiten jeder Fraktion setzen (eigene Seite, Bot oder neutral), Gebäude bauen und löschen, Infektion, Sporen und Gas malen, Feuer legen, Wetter und Tageszeit setzen, Patient Null setzen, Mutation erzwingen, Funk an und aus, Leichen entfernen, Unverwundbarkeit, Bots einer Seite zuweisen.
- Zeit: Pause, Einzelschritt (ein Tick), 0,25x bis 16x.
- Regelregler live: Infektionschance, Inkubation, Zombie-Tempo, Dichteobergrenze, Lärmreichweite, Mutationstempo, Panikfaktor, Moralfaktor, Schadensmultiplikatoren.
- Overlays: Flow-Field-Pfeile, Lärmfeld, Infektionsdichte, Sporen, Funk, Moral, Last des Spatial Hash.
- Live-Statistik: Anzahlen je Typ, Tick-Zeit, Bildrate.
- Jede Sandbox-Situation lässt sich als Szenario speichern.

### Editor

- Karten-Editor: Generator mit Parametern und Seed als Startpunkt, ab M12 auch OSM-Import. Danach Straßen zeichnen, Gebäude setzen und löschen, Bezirke malen, Flüsse und Brücken, Schlüsselorte, Kanalisation, Sektoren und Ringe, Evakuierungspunkte, Ränder für Großhorden.
- Szenario-Editor: Alle Parameter aus Abschnitt 6. Dazu Ereignisse als Auslöser und Aktion ohne Code: „Wenn Minute 12 erreicht“, „Wenn Sektor 4 fällt“, „Wenn mehr als 5.000 Zombies“, dann Funkspruch, Spawn, Wetterwechsel, Bonus oder geänderte Siegbedingung.
- Prüfung vor dem Speichern (Erreichbarkeit, Evakuierungswege, Sektoren). Knopf „Testspielen“.
- Export und Import als Datei .sperrzone.json mit Schema-Version, teilbar ohne Server.

## 13. Einstellungen und Barrierefreiheit

Die Einstellungen haben zehn Reiter, ein Suchfeld und wirken sofort mit Vorschau. Jede Option hat einen Tooltip mit Erklärung, bei Grafik und Leistung zusätzlich eine Anzeige der Leistungskosten (niedrig, mittel, hoch). Jeder Reiter hat „Zurücksetzen“.

Grundregel: Keine Einstellung außer den Schwierigkeits- und Spielregeln darf die Simulation verändern. Grafik, Kamera und Leistung beeinflussen nur die Darstellung, sonst brechen Determinismus, Replays und Co-op.

### Spiel

- Ton-Preset: Nüchtern, Trocken, Horror, B-Movie
- Standard-Spieltempo 0,5x bis 4x
- Autopause einzeln schaltbar bei: Großhorden-Warnung, Mauer durchbrochen, Sektor gefallen, Mutation, Bot-Anfrage, Ausbruch
- Klassischer Start (Bereit-Knopf statt Countdown)
- Aufklärung: Offen, Teilweise, Voll
- Tutorial-Hinweise: alle, nur neue, aus
- Adjutant-Standard: aus, Vorschlagen, Ausführen
- Autosave: aus, alle 2, 5 oder 10 Minuten, Anzahl der Autosave-Plätze
- Bestätigung vor: Sektor aufgeben, Unterstützung mit Kollateralrisiko, Abriss
- Zivilisten pro Punkt: 1, 5, 10 oder automatisch
- Obergrenze für Leichen
- Länge eines Spieltags: 8 bis 32 Minuten

### Schwierigkeit

- Vorlagen: Leicht, Normal, Schwer, Albtraum.
- Benutzerdefiniert mit Reglern: Hordengröße, Takt der Großhorden, Zombie-HP, Zombie-Tempo, Infektionschance, Startressourcen, Einkommen, Dauer der Farmphase, Mutationstempo, maximale Mutationen, Countdown sichtbar, Eskalation durch Warnzeichen, Strafe für Kollateralschaden, Standardstufe der Bots.
- Der resultierende Wertungs-Multiplikator wird live angezeigt.

### Grafik

- Qualitätsvorlage: Niedrig, Mittel, Hoch, Ultra, Benutzerdefiniert
- Renderskalierung 50 bis 100 %, Vollbild
- Bildratenbegrenzung: 30, 60, 120, unbegrenzt
- Maximale Einzel-Sprites vor Wechsel auf Dichte-Textur: 5.000 bis 30.000
- Partikel: aus, gering, mittel, hoch
- Licht und Schatten: aus, einfach, voll
- Wettereffekte: aus, reduziert, voll
- Rauch und Feuer: einfach, voll
- 3D-Wirkung der Gebäude an oder aus
- Blut und Gewebe: aus, gering, normal
- Bildzittern, Vignette, Scanlines einzeln an oder aus
- Anzahl der Leichen-Decals

### Leistung

- Simulation im Worker an oder aus (Fallback im Hauptthread)
- Leistungsanzeige: Bildrate, Tick-Zeit, Anzahl der Agenten
- Automatische Qualitätsanpassung, wenn die Bildrate unter das Ziel fällt
- Hintergrund-Tab: Spiel pausieren oder weiterlaufen lassen

### Audio

- Lautstärke für Gesamt, Musik, Effekte, Ambient, Funk und Oberfläche
- Intensität des Horden-Klangteppichs
- Mono-Modus
- Stumm, wenn der Tab im Hintergrund ist
- Akustische Warnungen zusätzlich als Text-Einblendung

### Steuerung

- Freie Tastenbelegung für jede Aktion, Konflikte werden markiert
- Maus-Schema: Klassisch (links auswählen, rechts befehlen) oder umgekehrt
- Kamera-Tempo, Zoom-Tempo, Kantenscrollen an oder aus und dessen Tempo
- Halten oder Umschalten für Tasten wie Wegpunkt-Modus
- Doppelklick-Zeit

### Oberfläche

- UI-Skalierung 75 bis 200 %, eigene Schriftgröße
- Epochen-Skin an oder aus (neutraler Skin)
- HUD-Layout: Standard oder Kompakt
- Minikarte: Größe und Ecke
- Funklog: Größe, Standardfilter, Häufigkeit (alle, wichtige, nur kritische)
- Tooltips: Verzögerung, kurz oder ausführlich mit allen Werten
- Lebensbalken: immer, bei Schaden, nie
- Anzeigedauer von Benachrichtigungen
- Uhr: Spielzeit, Tageszeit oder echte Zeit

### Barrierefreiheit

- Farbenblind-Modi: Deuteranopie, Protanopie, Tritanopie, Muster-Modus (Formen und Schraffuren aus Abschnitt 5)
- Jede Farbe mit Bedeutung einzeln überschreibbar
- Hoher Kontrast
- Reduzierte Bewegung: kein Flackern, kein Bildzittern, weniger Partikel
- Keine Lichtblitze bei Explosionen (Photosensibilität)
- Gut lesbare Schrift (Atkinson Hyperlegible, OFL) als Alternative
- Alle Menüs per Tastatur bedienbar, sichtbarer Fokusrahmen, Screenreader-Beschriftungen
- Spieltempo bis hinunter auf 0,25x
- Größerer Mauszeiger

### Sprache

- Deutsch oder Englisch
- Zahlen- und Datumsformat

### Daten

- Spielstände und Replays verwalten: umbenennen, löschen, exportieren, importieren
- Einstellungen zurücksetzen, je Reiter oder alle
- Fortschritt zurücksetzen mit doppelter Bestätigung
- Alle Daten als eine Datei exportieren und importieren
- Belegter Speicher
- Hinweis: Das Spiel sammelt keine Daten und sendet nichts. Einzige Netzwerkzugriffe sind der OSM-Import und optional der Online-Co-op.

Einstellungen liegen versioniert in localStorage. Unbekannte oder veraltete Schlüssel werden beim Laden migriert oder verworfen.

## 14. GUI, HUD und Steuerung

Die Oberfläche ist ein dunkles, halbtransparentes Kommandozentralen-Interface über der Karte. Sie zeigt in der Farmphase die Wirtschaft und im Kampf die Unterstützung im Vordergrund. Im Kampf gibt es außer dem Pausenmenü keine blockierenden Fenster.

### Bildschirme

1. Startbildschirm: Titel, im Hintergrund läuft eine echte Partie, die Bots allein spielen. Die Infektion breitet sich live über eine Stadt aus.
2. Hauptmenü: Fortsetzen (letzter Spielstand), Kampagne, Szenario, Schnelles Gefecht, Endlos, Herausforderungen, Sandbox, Editor, Tutorial, Kodex, Statistik und Erfolge, Einstellungen. Noch nicht gebaute oder nicht freigeschaltete Einträge zeigen ein Schloss und den Grund.
3. Kampagnenkarte: Regionalkarte mit Städten, Status, Entscheidungen zwischen Missionen.
4. Briefing und Missions-Setup: Links Kartenvorschau mit Patient-Null-Hinweis und Sektoren. Rechts Reiter für Ziele, Erreger, Fraktion, Bots, Schwierigkeit, Mutatoren und Ton. Unten der Startknopf mit Wertungs-Multiplikator.
5. Ladebildschirm: Fortschritt der Generierungsschritte und ein Kodex-Tipp.
6. Spiel mit HUD (unten).
7. Pausenmenü: Fortsetzen, Speichern, Laden, Einstellungen, Kodex, Neustart, Aufgeben, Hauptmenü.
8. Auswertung (Abschnitt 10).
9. Kodex: Erreger, Zombie-Typen, Einheiten, Fraktionen, Mechaniken, Geschichte. Einträge schalten sich durch Begegnung und Forschung frei.
10. Einstellungen (Abschnitt 13).
11. Statistik und Erfolge.
12. Editor mit eigener Werkzeugleiste.

### HUD-Aufteilung

Referenz 1920 x 1080, funktioniert bis hinunter auf 1280 x 720.

```
+--------------------------------------------------------------------------------+
| Ressourcen mit Trend | Phase, Uhr, Wetter, Vorhersage | Bevölk., Moral, Mutation, Tempo, Menü |
+------------------+-------------------------------------------+-----------------+
| Funklog          |                                           | Benachrichtig.  |
| (filterbar)      |                                           | und Anfragen    |
+------------------+                SPIELKARTE                 +-----------------+
| Bot-Panel        |                                           | Kontextpanel    |
| (bis 3 Bots)     |                                           | (Auswahl)       |
+------------------+-------------------------------+-----------+-----------------+
| Overlays, Wärmebild | Befehlsleiste und Baumenü  |      Minikarte              |
+--------------------------------------------------------------------------------+
```

- Obere Leiste links: Jede Ressource mit Symbol, Wert und Trend pro Minute. Tooltip zeigt Quellen und Verbrauch.
- Obere Leiste Mitte: Phase, Countdown oder Uhr, Tageszeit, Wetter, Vorhersage.
- Obere Leiste rechts: Bevölkerung (gesamt, gerettet, bekannt infiziert, tot), Moral, Mutationsanzeige, Tempo-Knöpfe (Pause, 0,5x, 1x, 2x, 4x), Menü.
- Links: Funklog, einklappbar und filterbar, darunter das Bot-Panel.
- Rechts: Benachrichtigungen, gestapelt nach Priorität (kritisch, Warnung, Info). Klick springt zum Ort, Anfragen haben Annehmen und Ablehnen. Darunter das Kontextpanel für die Auswahl: Werte, Haltung, Befehle, Ausbau.
- Unten Mitte: Befehlsleiste mit Reitern Wirtschaft, Verteidigung, Einheiten, Zivil (Schutzzonen, Korridore, Sammelpunkte), Unterstützung (mit Abklingzeiten). Dazu Knöpfe für Forschung, Bevölkerung und Erlasse, Expeditionen, Sektoren, Evakuierung.
- Unten links: Schalter für Overlays (Infektion, Funk, Lärm, Moral, Sektoren, Versorgungsradius, Sicht) und Wärmebild.
- Unten rechts: Minikarte mit Sektorstatus, Infektion und Warnpfeilen für Großhorden. Klick springt, Alt+Klick setzt einen Ping.
- Auf der Karte: Ereignismarker, Pfeile am Bildschirmrand für Ereignisse außerhalb des Sichtfelds, rote Warnpfeile mit Countdown für anrollende Großhorden.

### Fenster

Fenster öffnen als Seitenpanel, das Spiel läuft weiter (Option: beim Öffnen pausieren).

- Wirtschaft: Produktion je Gebäude, Ketten, Lager, Engpässe rot markiert.
- Bevölkerung: Schieberegler für Arbeiter, Wehrpflichtige, Helfer, Freie. Moral mit Liste aller Einflüsse und ihrem Beitrag.
- Erlasse: Karten mit Vor- und Nachteilen, aktive Erlasse oben.
- Forschung: Baum je Zweig, Warteschlange, Kosten, Dauer.
- Expeditionen: Umlandkarte, Trupp zusammenstellen, laufende Expeditionen, Ereigniskarten mit Entscheidung.
- Sektoren: Liste mit Status, Truppen, Zivilisten, Produktion. Knöpfe Aufgeben und Gegenstoß.
- Evakuierung: Routen, Transporte, Fortschritt gegen Ziel.

### Interaktion

- Auswahl: Klick, Rahmen ziehen, Doppelklick wählt alle gleichen Typs im Bild. Gruppen auf Zifferntasten.
- Befehle: Rechtsklick bewegt oder greift an. Umschalt hängt Wegpunkte an. Rechtsklick ziehen legt Linie und Blickrichtung fest. In der Pause lassen sich Befehle geben.
- Bauen: Bauwerk wählen, Vorschau grün oder rot. Mauern, Stacheldraht und Gräben per Ziehen als Linie mit Live-Kosten. R dreht, Umschalt setzt mehrere. Strg+Z nimmt in der Farmphase den letzten Bauauftrag binnen 10 Sekunden mit voller Erstattung zurück.
- Korridor: Punkte klicken, Enter beendet. Schutzzone: Bereich aufziehen.
- Unterstützung: Fähigkeit wählen, Zielvorschau mit Wirkungsbereich. Vor dem Bestätigen zeigt die Vorschau die geschätzten Zivilisten im Bereich („etwa 12 Zivilisten betroffen“) und bei Gas die Windrichtung.
- Radialmenü: Rechtsklick halten auf eigenem Gebäude, Sektor oder Bot-Sektor.
- Tooltips überall, mit Umschalt ausführlich mit allen Werten.
- Esc schließt jedes Panel, dann das Pausenmenü.

### Standard-Tastenbelegung

| Taste | Aktion |
|---|---|
| Leertaste | Pause |
| + und − | Spieltempo |
| WASD, Pfeiltasten | Kamera bewegen |
| Mausrad | Zoom zum Mauszeiger |
| Pos1 | Zum Hauptquartier |
| F2 bis F4 | Kamera-Lesezeichen abrufen, mit Umschalt speichern |
| 0 bis 9 | Gruppe wählen, mit Umschalt speichern, doppelt drücken zentriert |
| B | Baumenü |
| U | Unterstützung |
| R | Forschung |
| P | Bevölkerung und Erlasse |
| E | Expeditionen |
| K | Korridor zeichnen |
| Z | Schutzzone aufziehen |
| V | Sammelpunkt setzen |
| X | Abriss |
| T | Wärmebild |
| O | Overlays durchschalten |
| Tab | Sektorübersicht |
| L | Funklog ein und aus |
| H | Haltung durchschalten |
| F | Feuerfreigabe umschalten |
| Alt+Klick | Ping |
| Strg+S | Schnellspeichern |
| F9 | Schnellladen |
| Esc | Abbrechen, Pausenmenü |

Browser-reservierte Kürzel werden nicht belegt (unter anderem Strg+T, Strg+W, Strg+N, Strg+Tab, Strg+1 bis 9, F5, F11, F12). Jede Standardtaste wird in Chrome und Firefox getestet. Fängt der Browser sie ab, wählst du eine Alternative und trägst sie in docs/DECISIONS.md ein.

### Gestaltung der UI

- Panels dunkel und halbtransparent, 1 px Rahmen, Ecken 4 px, Akzentfarbe aus dem Epochen-Skin.
- Eigenes Symbolset als SVG, im Code gezeichnet. Keine fremden Icon-Pakete mit unklarer Lizenz.
- Zahlen in Monospace, rechtsbündig, mit Tausendertrennzeichen.
- Animationen 150 ms, bei „Reduzierte Bewegung“ aus.
- Kritische Werte (Munition, Mauer-HP, Moral) färben sich bei 25 % gelb und bei 10 % rot und pulsieren dann.

## 15. Tutorial und Onboarding

Fünf kurze Lernmissionen von je 8 bis 12 Minuten bringen das Spiel in der Reihenfolge bei, in der man es spielt. Danach übernehmen kontextuelle Hinweise, die Analyse „Warum habe ich verloren?“ und der Kodex.

### Grundsätze

- Lernen durch Tun. Höchstens zwei Sätze pro Hinweis, dazu eine Markierung am UI-Element oder Kartenort. Weiter geht es erst, wenn die Aufgabe erledigt ist, nicht per Weiter-Knopf.
- Jede Lektion führt höchstens drei neue Mechaniken ein.
- Der Ausbilder spricht per Funk im gewählten Ton-Preset, Standard ist Trocken.
- Lektion 1 und 2 lassen sich nicht verlieren. Ab Lektion 3 ist eine echte Niederlage möglich, mit Hinweis und Neustart vom letzten Abschnitt.
- Überspringen ist jederzeit möglich. Beim ersten Start fragt das Spiel nach Erfahrung. Wer „Ich kenne Horden-Strategiespiele“ wählt, bekommt nur Hinweise zu Mechaniken, die es so nur in SPERRZONE gibt (Farmphase, Erreger, Mutation, Funk, Rückzug).
- Das Tutorial ist datengetrieben in src/data/tutorial/. Jeder Schritt hat: ID, Text-Schlüssel, Markierung (UI-Element-ID oder Kartenbereich), Bedingung zum Abschluss (Event oder Zustand), Aktionen beim Start (pausieren, spawnen, Zeit setzen), optional Belohnung.
- Jedes markierbare UI-Element trägt eine stabile data-tutorial-id.

### Die fünf Lektionen

| Nr. | Titel | Setting | Lernziele | Ziel der Mission |
|---|---|---|---|---|
| 1 | Erste Linie | Gegenwart, kleine Stadt, Ausbruch läuft schon | Kamera, Auswahl, Bewegen, Haltungen, Mauer und Tor bauen, Schutzzone, Pause und Tempo | 200 Zivilisten in die Schutzzone bringen |
| 2 | Ruhe vor dem Sturm | Gegenwart, Farmphase | Ressourcen, Gebäude umwidmen, Bevölkerung zuweisen, Moral, Countdown und Warnzeichen | Wirtschaft aufbauen, dann einen kleinen Ausbruch abwehren |
| 3 | Lärm und Licht | Kalter Krieg, Nacht | Lärm und Köder, Scheinwerfer, Funkabdeckung, Artillerie mit Kollateral-Vorschau, Korridore | Eine Großhorde umlenken und über einen Korridor evakuieren |
| 4 | Der Erreger lernt | Gegenwart, Regen, Pilz-Erreger | Erregerfamilien, Kodex, Proben und Forschung, Sporen und Wetter, Feuer, Mutation, Expedition | Nest zerstören und Impfstoff-Prototyp erforschen |
| 5 | Ring um Ring | Weltkrieg 1918 | Sektor aufgeben, Bahn-Evakuierung, Checkpoints, Melder statt Funk, Bots (Co-op-Partner und Adjutant), Pings, Bot-Befehle | 60 % der Bevölkerung evakuieren |

Nach Lektion 5 sind alle Kampagnen offen.

### Kontextuelle Hinweise nach dem Tutorial

- Erste Begegnung mit einem Zombie-Typ: kleine Karte mit Silhouette, einem Satz zum Konter und Link in den Kodex.
- Erstes Auftreten einer Mechanik: erste Mutation, erster Stromausfall, erster Infizierter in einer Schutzzone, Munition knapp, erster Funkausfall.
- Fehlermuster: Verliert der Spieler dreimal aus demselben Grund, kommt ein gezielter Tipp.
- Jeder Hinweis erscheint einmal, ist danach im Kodex nachlesbar und lässt sich abschalten.

### „Warum habe ich verloren?“

Die Auswertung erkennt automatisch ein bis drei Hauptursachen aus der Statistik und zeigt je einen Tipp mit Zeitstempel im Zeitraffer. Beispiele:

- „Mauer Nord fiel um 14:20 durch drei Kolosse. Es war keine Panzerabwehr in der Nähe.“
- „In Sektor 5 fiel um 11:05 der Funk aus. Die Einheiten zogen sich ohne Befehl zurück.“
- „38 % der Infektionen kamen aus der Schutzzone am Stadion. Am Eingang fehlte ein Checkpoint.“

### Kodex

- Rubriken: Erreger, Zombie-Typen, Einheiten, Fraktionen, Bauwerke, Mechaniken, Geschichte („Das Erbe“).
- Ein Eintrag hat Text im Ton-Preset, Wertetabelle, Silhouette, Schwächen (aufgedeckt durch Forschung oder Begegnung) und Herkunft.
- Ladebildschirme zeigen zufällige Tipps aus bereits freigeschalteten Einträgen.

## 16. Progression, Meta und Erfolge

Meta-Fortschritt erweitert die Auswahl, er macht nicht einfach stärker. Reine Wertebonus-Freischaltungen sind auf insgesamt +10 % je Kategorie gedeckelt. Wer nur spielen will, schaltet in den Einstellungen alles frei.

### Erkenntnisse

- Die Meta-Währung heißt Erkenntnisse. Es gibt sie für Wertung, Medaillen, erstmalige Erfolge und neue Kodex-Einträge.
- Ausgegeben werden sie im Kommandobaum, einem allgemeinen Teil und einem Teil je Epoche.
- Alles ist durch einmaliges Durchspielen der Kampagnen erreichbar. Kein Grind.

### Kommandobaum

- Doktrinen: Vor jeder Mission wählst du zwei. Jede hat Vor- und Nachteil.
  - Verbrannte Erde: Feuer +25 % Schaden, Moral sinkt schneller.
  - Zivilschutz zuerst: Schutzzonen und Checkpoints −30 % Kosten, Einheiten +15 % Kosten.
  - Schnelle Eingreiftruppe: Unterstützung −20 % Abklingzeit, Bauen +20 % Kosten.
  - Festungsbau: Mauern +30 % HP, Einheiten −10 % Tempo.
  - Funkdisziplin: Funkreichweite +30 %, Durchsagen nur halb so wirksam.
  - Volksbewaffnung: Miliz +30 % Feuerkraft, Steuern −15 %.
  - Weitere je Epoche, insgesamt etwa 16.
- Freischaltungen: zusätzliche Einheitenvarianten, Bauwerke, Unterstützungsfähigkeiten, Fraktionen (Résistance und Arcturon sind anfangs gesperrt), Mutatoren, Doktrin-Plätze.
- Kleine passive Boni: etwa Bautempo, Startmaterial, Funkreichweite, je Kategorie gedeckelt.

### Erfolge

Etwa 40 Erfolge, lokal gespeichert. Beispiele:

| Erfolg | Bedingung |
|---|---|
| Niemand bleibt zurück | 100 % der Bevölkerung evakuiert |
| Ring um Ring | Drei Sektoren aufgegeben und trotzdem Gold |
| Funkstille | Mission mit Mutator Funkstille gewonnen |
| Kurzer Prozess | Patient Null in den ersten 60 Sekunden getötet |
| Pyromane | 10.000 Zombies durch Feuer getötet |
| Saubere Hände | Mission ohne Kollateralschaden gewonnen |
| Lernfähig | Gegen fünf aktive Mutationen gewonnen |
| Das Erbe | Alle vier Kampagnen abgeschlossen |
| Albtraum | Eine Kampagne auf Albtraum abgeschlossen |
| Eine Stunde | 60 Minuten im Endlos-Modus überlebt |

### Statistik und Profile

- Lebenszeit-Statistik: getötete Zombies je Typ, gerettete Zivilisten, Spielzeit, meistgenutzte Einheit, häufigste Niederlagenursache.
- Mehrere lokale Profile mit eigenem Fortschritt und eigenen Einstellungen.

## 17. Meilensteine und Abnahmekriterien

15 Meilensteine, M0 bis M14. Nach M5 steht ein vollständig spielbares, kleines Spiel. M14 ist optional. Ein Meilenstein ist erst fertig, wenn jedes Abnahmekriterium geprüft und im Logbuch als ABNAHME eingetragen ist.

| Phase | Meilensteine | Ergebnis |
|---|---|---|
| Fundament | M0 bis M1 | Technik steht, Horden fließen durch eine Stadt |
| Kernspiel | M2 bis M5 | Spielbare Mission von Briefing bis Auswertung |
| Tiefe | M6 bis M8 | Alle Erreger, Atmosphäre, Funk, Rückzug |
| Breite | M9 bis M12 | Bots, Epochen, Modi, Sandbox, Editor, echte Städte |
| Feinschliff | M13 bis M14 | Barrierefreiheit, Politur, optional Online-Co-op |

### M0: Fundament

- Prompt als docs/GAME_DESIGN.md speichern. CLAUDE.md, Regeln, Agent-Dateien, .claude/settings.json mit Hook, docs/LOGBOOK.md, docs/DECISIONS.md, docs/PROPOSALS.md anlegen.
- Vite, TypeScript strict, pnpm, Biome, Vitest, Ordnerstruktur aus Abschnitt 4.
- Core: Spielschleife mit festem 20-Hz-Tick im Worker, Befehlswarteschlange, RNG, Event-Bus, Schnappschuss-Übertragung.
- PixiJS-Canvas mit Kamera (Scrollen, Zoom zum Mauszeiger), Testraster.
- Preact-Overlay mit leerem Hauptmenü, i18n-Grundgerüst, Einstellungs-Speicher, Leistungsanzeige.
- Gerüst für pnpm bench und den Determinismus-Test.
- Abnahme: pnpm dev zeigt Hauptmenü und leere Karte mit Kamera. pnpm test und pnpm check grün. Determinismus-Test mit Dummy-Simulation besteht. Leistungsanzeige zeigt 20 Ticks pro Sekunde. Der Hook gibt beim Aufruf von Hand Plan und Logbuch-Ende aus.

### M1: Stadt und Horde

- Prozeduraler Stadtgenerator für klein und mittel mit allen sieben Schritten und Prüfregeln. Sektoren und Ringe.
- Rendering von Gelände, Wasser, Straßen und Gebäuden mit 3D-Wirkung.
- Zombies als Structure of Arrays, Spatial Hash, Flow-Fields, Separation, Dichteobergrenze.
- Zivilisten mit einfachem Alltag. Debug-Overlays für Flow-Field und Dichte.
- Abnahme: 30.000 Zombies fließen durch eine mittlere Stadt mit höchstens 20 ms pro Tick im Benchmark und 60 FPS im Browser. Wechsel auf Dichte-Textur funktioniert. Gleicher Seed ergibt identische Stadt.

### M2: Infektion und Zivilisten

- Virale Familie mit Typ 1 bis 4 und Patient Null. Kontakt, Inkubation, aufstehende Leichen.
- Zivilisten-Zustände, Panik, Sicherheitsfeld, Schutzzonen, Korridore, Sammelpunkte, Lärmfeld.
- Abnahme: Ein Ausbruch breitet sich von Patient Null sichtbar Straße für Straße aus. Ein Test zeigt, dass ein Korridor die Zahl der geretteten Zivilisten messbar erhöht.

### M3: Kampf und Bau

- Einheiten der Gegenwart: Infanterie, MG, Scharfschütze, Mörser, Pioniere, Polizei, Sanitäter. Haltungen, Zielwahl, Projektile, Munition, Depots.
- Mauern, Tore, Stacheldraht, Minen, Sprengladungen, Wachtürme. Bau-Vorschau, Linien ziehen.
- HUD-Grundgerüst: obere Leiste, Kontextpanel, Befehlsleiste, Minikarte. Auswahl, Gruppen, Tastenbelegung.
- Abnahme: Der Spieler kann einen Straßenzug halten. Mauern nehmen Schaden durch Druck. Kollateralschaden wird gezählt.

### M4: Farmphase und Wirtschaft

- Ressourcen, Wirtschaftsgebäude, Umwidmen, Arbeiter und Strom. Bevölkerung, Moral, Erlasse.
- Countdown, Warnzeichen, klassischer Start, Phasenwechsel, Briefing-Bildschirm, Szenario-Dateien.
- Abnahme: Die Schleife Briefing, Farmphase, Ausbruch, Verteidigung ist durchgehend spielbar.

### M5: Spielbares Spiel

- Vier Siegbedingungen, Niederlage, Wertung, Auswertung mit Zeitraffer und Heatmap.
- Speichern, Laden, Autosave, Pausenmenü. Einstellungen für Spiel, Grafik, Audio und Steuerung.
- Grundlegender Sound. Drei Szenarien in der Gegenwart, Schnelles Gefecht.
- Tutorial-Lektionen 1 und 2.
- Abnahme: Jemand ohne Erklärung kann nach dem Tutorial eine Mission spielen, gewinnen oder verlieren. Ein Replay erzeugt denselben Zustands-Hash wie die Originalpartie.

### M6: Alle Erreger und Mutation

- Familien bakteriell, Pilz, parasitär, chemisch mit Typ 5 bis 15 und 18. Kanalisation, Umweltwege.
- Mutationssystem mit allen Mutationen. Forschung in der Mission, Proben, Impfstoff. Expeditionen mit Ereigniskarten. Kodex-Grundgerüst.
- Abnahme: Jede Familie hat einen nachweislich anderen besten Konter (Headless-Vergleich mehrerer Waffenmischungen). Mutation löst bei einseitiger Bewaffnung reproduzierbar aus.

### M7: Atmosphäre

- Tag und Nacht mit Licht, alle Wetterlagen mit Wirkung, Feuerausbreitung, Rauch, Explosionen, Wärmebild.
- Vollständiges Audio mit Horden-Klangteppich und adaptiver Musik. Ton-Presets mit Funksprüchen. Gewalt-Regler.
- Abnahme: Leistungsziele halten bei Effekten „Mittel“. Jeder Effekt ist abschalt- oder skalierbar. Jeder Funkspruch existiert in allen vier Presets oder fällt korrekt auf Nüchtern zurück.

### M8: Funk, Rückzug und Evakuierung

- Funknetz, Melder, autonomes Verhalten, Befehlskette.
- Sektorstatus, Aufgeben, Gegenstoß, Ausweich-Hauptquartier. Evakuierungswege, Transporte, Checkpoints, Quarantäne.
- Abnahme: Ein Sieg per Evakuierung ist möglich. Funkausfall ändert das Verhalten der Einheiten sichtbar. Inkubierende ohne Checkpoint gelangen in Transporte.

### M9: KI-Bots

- Utility AI, drei Rollen, sieben Persönlichkeiten, fünf Stufen. Bot-Panel, Anfragen, Pings, Bot-Befehle.
- Headless-Bot-Runner für Balancing. Startbildschirm mit Bot-Partie im Hintergrund.
- Abnahme: Ein Elite-Bot gewinnt ein Normal-Szenario allein in mindestens 70 % von 20 Seeds, ein Rekrut in höchstens 30 %. Bots geben nur Befehle über die Warteschlange.

### M10: Epochen und Fraktionen

- Alle vier Epochen, zwölf Fraktionen, Einheiten-Tabelle, Unterstützung, Sonderfähigkeiten, Stadtvarianten, Epochen-Skins.
- Nanotech-Familie mit Typ 16 und 17, EMP.
- Abnahme: Jede Epoche hat mindestens zwei spielbare Szenarien. Ein Balancing-Bericht der Bots liegt in docs/progress/ vor.

### M11: Modi, Meta und Tutorial

- Vier Kampagnen mit 22 Missionen, Regionalkarte, Folgen, Rahmenhandlung.
- Endlos, Herausforderungen, Tagesherausforderung, Mutatoren.
- Kommandobaum, Doktrinen, Erfolge, Statistik, Profile.
- Tutorial-Lektionen 3 bis 5, kontextuelle Hinweise, „Warum habe ich verloren?“, vollständiger Kodex.
- Abnahme: Jede Kampagne ist von Anfang bis Ende durchspielbar. Alle Erfolge sind auslösbar (Test pro Erfolg).

### M12: Sandbox, Editor und echte Städte

- Sandbox mit allen Werkzeugen, Reglern und Overlays.
- Karten- und Szenario-Editor mit Auslösern, Prüfung, Export und Import.
- OSM-Import mit Zwischenspeicher und Attribution. Zwei mitgelieferte, fertig umgewandelte echte Städte.
- Abnahme: Ein im Editor gebautes Szenario lässt sich exportieren, importieren und spielen. Ein OSM-Ausschnitt von 2 x 2 km wird in unter 30 Sekunden umgewandelt und ist spielbar.

### M13: Barrierefreiheit und Politur

- Alle zehn Einstellungs-Reiter vollständig. Farbenblind- und Muster-Modus, Tastaturbedienung, Screenreader-Beschriftungen.
- Englische Übersetzung vollständig. Automatische Qualitätsanpassung.
- Balancing-Durchgang mit Bot-Berichten, Fehlerjagd, Build für GitHub Pages und itch.io.
- Abnahme: Leistungsziele auf Referenz-Hardware erfüllt. Alle Menüs ohne Maus bedienbar. Keine fehlenden Übersetzungsschlüssel. dist/ läuft auf einem statischen Hosting.

### M14 (optional): Online-Co-op

- Lockstep über WebRTC-Datenkanäle auf Basis der Befehlswarteschlange. Desync-Erkennung über Zustands-Hash, Wiederverbinden.
- Verbindungsaufbau braucht einen kleinen Vermittlungsdienst (Signaling). Optionen: Code zum Kopieren zwischen den Spielern ohne Server oder ein kleiner eigener Signaling-Server. Entscheidung vor Beginn mit dem Menschen klären.
- Abnahme: Zwei Browser spielen eine Mission ohne Desync zu Ende, auch mit Bots.

## 18. Qualitätsregeln und Grenzen

Diese Regeln gelten für jeden Meilenstein und jeden Agenten. Bei einem Konflikt zwischen Tempo und diesen Regeln gewinnen die Regeln.

### Code

- Kein any, keine zyklischen Importe, benannte Exporte. Dateien unter 400 Zeilen, Funktionen kurz und mit einer Aufgabe.
- Systeme der Simulation sind Funktionen über den Weltzustand, ohne versteckten Zustand.
- Datendateien werden beim Laden per zod geprüft. Fehler nennen Datei, Feld und erwarteten Wert.
- Absturz im Worker führt zu einem Fehlerbildschirm mit Rettungs-Speicherstand und Bug-Report (Seed plus Befehlsliste als Datei).

### Tests und Prüfung

- Unit-Tests für jede Spielregel mit festem Seed.
- Integrationstest: eine gescriptete 10-Minuten-Partie headless, geprüft über Zustands-Hashes an festen Ticks.
- Leistungstest: pnpm bench schlägt fehl, wenn ein Wert mehr als 10 % schlechter ist als der gespeicherte Referenzwert.
- Sichtprüfung: qa-review macht pro Meilenstein mit Playwright Screenshots fester Szenen (Hauptmenü, Farmphase, Großhorde an Mauer, Nacht, Wärmebild, Auswertung) und schaut sie sich an. Auffälligkeiten kommen in den Bericht.
- Balancing über den Headless-Bot-Runner ab M9.

### Lizenzen und Datenschutz

- Nur selbst erzeugte Grafiken, CC0-Audio und Schriften unter Open Font License. Jede Fremdquelle steht in docs/LICENSES.md.
- Keine Tracking-Dienste, keine externen Anfragen außer OSM-Import und optionalem Co-op.

### Was du nicht tust

- Keine Meilensteine überspringen, nie mehrere pro Session.
- Dieses Dokument nicht ändern. Vorschläge kommen nach docs/PROPOSALS.md.
- Keine großen Umbauten ohne Eintrag in docs/DECISIONS.md.
- Kein Online-PvP, keine Mikrotransaktionen.
- Keine Namen, Texte, Grafiken oder Sounds aus Zombies Aren't Real.
- Keine Logos oder Embleme echter Organisationen, keine NS-Symbole, kein rotes Kreuz, keine echten Personen.
- Keine externen Assets mit unklarer Lizenz.

### Wenn die Realität vom Dokument abweicht

Ist ein Ziel nicht erreichbar, etwa ein Leistungswert, oder widersprechen sich zwei Abschnitte: Stoppe, beschreibe zwei bis drei Optionen mit Folgen, trage das ins Logbuch ein und lass den Menschen entscheiden.

### Ende jeder Session

1. STOPP-Eintrag im Logbuch mit dem nächsten Schritt.
2. Bericht in docs/progress/Mxx.md.
3. Kurze Zusammenfassung an den Menschen, höchstens zehn Zeilen: was fertig ist, was offen ist, was er selbst testen soll.
