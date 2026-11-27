// zod schema for scenario files (GDD 6 Szenario-Parameter). Errors name the file, the field and the expected value.
import { z } from 'zod';
import type { PathogenFamily, ResourceId } from '../../core/commands';
import { KEY_SITES } from '../../core/types/map';
import type { ScenarioDef } from '../../core/types/mission';

const RESOURCES = ['budget', 'material', 'fuel', 'ammo', 'medicine', 'food', 'power', 'research'] as const;
const FAMILIES = ['viral', 'bacterial', 'fungal', 'parasitic', 'chemical', 'nanotech'] as const;
const VICTORY = ['eradication', 'evacuation', 'hold', 'containment'] as const;

const resourceShape = Object.fromEntries(RESOURCES.map((r) => [r, z.number().min(0).optional()])) as Record<
  ResourceId,
  z.ZodOptional<z.ZodNumber>
>;

export const scenarioSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  textKey: z.string().min(1),
  seed: z.number().int().min(0),
  size: z.enum(['small', 'medium']),
  era: z.literal('present'),
  faction: z.string().min(1),
  pathogen: z.enum(FAMILIES) satisfies z.ZodType<PathogenFamily>,
  patientZeroSite: z.union([z.literal('random'), z.enum(KEY_SITES)]),
  farmDurationS: z.number().min(60).max(1800),
  classicStart: z.boolean(),
  startResources: z.object(resourceShape).strict(),
  population: z.number().int().min(100).optional(),
  difficulty: z.enum(['easy', 'normal', 'hard', 'nightmare']),
  victory: z.object({ kinds: z.array(z.enum(VICTORY)).min(1), all: z.boolean() }),
  holdUntilS: z.number().min(60).optional(),
  evacuationShare: z.number().min(0.1).max(1).optional(),
  medals: z.object({ bronze: z.number(), silver: z.number(), gold: z.number() }).optional(),
  unlosable: z.boolean().optional(),
  timeLimitS: z.number().min(60).optional(),
});

function describe(issue: z.core.$ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
  let expected = '';
  if (issue.code === 'invalid_type') expected = issue.expected;
  else if (issue.code === 'invalid_value') expected = issue.values.map(String).join(' | ');
  else if (issue.code === 'unrecognized_keys') expected = `no key ${issue.keys.join(', ')}`;
  else expected = issue.message;
  return `${path}: expected ${expected}`;
}

/** Validates one scenario file; throws with file name, field and expected value for every problem. */
export function parseScenario(file: string, raw: unknown): ScenarioDef {
  const res = scenarioSchema.safeParse(raw);
  if (!res.success) throw new Error(`Scenario ${file}: ${res.error.issues.map(describe).join('; ')}`);
  return res.data as ScenarioDef;
}
