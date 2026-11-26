// Static checks of the determinism rules for src/sim and src/ai (GDD section 4, .claude/rules/sim.md).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const FORBIDDEN = [
  /\bMath\.random\b/,
  /\bDate\.now\b/,
  /\bnew Date\b/,
  /\bperformance\.now\b/,
  /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|hypot)\b/,
  /from '(\.\.\/)+(render|ui)\//,
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('sim rules', () => {
  it('no wall clock, Math.random, engine trig or render/ui imports in src/sim and src/ai', () => {
    const files = [...sourceFiles(join(SRC, 'sim')), ...sourceFiles(join(SRC, 'ai'))];
    expect(files.length).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (FORBIDDEN.some((re) => re.test(line))) hits.push(`${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits).toEqual([]);
  });
});
