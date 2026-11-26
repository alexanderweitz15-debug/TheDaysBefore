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
