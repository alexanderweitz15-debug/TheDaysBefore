// Mission phases, economy and population as seen by UI (GDD 6). Structured-cloned once per second.
import type { EconomyBuildingKind, PathogenFamily, ResourceId } from '../commands';
import type { CitySize } from './map';
import type { MissionOutcome, ObjectiveView, ScoreView } from './outcome';

export type MissionPhase = 'farm' | 'outbreak' | 'defense' | 'ended';

export interface ResourceView {
  /** For power: net balance (production minus demand); negative = deficit, buildings unpowered. */
  amount: number;
  capacity: number;
  /** Net change per minute over the last minute (trend arrow in the top bar). */
  perMin: number;
}

export interface EconomyBuildingView {
  id: number;
  /** City building index (map.buildings) the economy building occupies. */
  buildingId: number;
  kind: EconomyBuildingKind;
  /** 0..1 repurposing progress; 1 = operating. */
  progress: number;
  workers: number;
  workersNeeded: number;
  powered: boolean;
  /** Output per minute at current staffing (for the economy window). */
  outputPerMin: Partial<Record<ResourceId, number>>;
  /** Bottleneck reason for red marking, or null. */
  bottleneck: 'workers' | 'power' | 'input' | 'storage' | null;
}

export interface MoraleFactor {
  /** i18n key suffix, e.g. 'food', 'safety', 'losses'. */
  key: string;
  value: number;
}

export interface WarningSignView {
  id: number;
  /** i18n key of the warning, hints at the pathogen family. */
  key: string;
  x: number;
  y: number;
  investigated: boolean;
  /** Ticks until it escalates outbreak pressure. */
  escalatesInTicks: number;
}

export interface MissionView {
  phase: MissionPhase;
  /** Ticks until outbreak if the countdown is visible, else null (hard difficulty or classic start). */
  countdownTicks: number | null;
  classicStart: boolean;
  /** 0..1 outbreak pressure from ignored warning signs. */
  outbreakPressure: number;
  resources: Record<ResourceId, ResourceView>;
  buildings: EconomyBuildingView[];
  population: {
    total: number;
    workers: number;
    conscripts: number;
    helpers: number;
    free: number;
  };
  /** 0..100 (GDD 6). */
  morale: number;
  moraleFactors: MoraleFactor[];
  activeDecrees: string[];
  warnings: WarningSignView[];
  objectives: ObjectiveView[];
  /** Live score (GDD 10), final once outcome is set. */
  score: ScoreView;
  outcome: MissionOutcome | null;
}

/** Scenario file (GDD 6 Szenario-Parameter), validated with zod in src/data/scenarios. */
export interface ScenarioDef {
  id: string;
  /** i18n key prefix for name, briefing and objectives. */
  textKey: string;
  seed: number;
  size: CitySize;
  era: 'present';
  faction: string;
  pathogen: PathogenFamily;
  /** 'random' or a KEY_SITES name. */
  patientZeroSite: string;
  farmDurationS: number;
  classicStart: boolean;
  startResources: Partial<Record<ResourceId, number>>;
  /** Overrides the size default population. */
  population?: number;
  difficulty: 'easy' | 'normal' | 'hard' | 'nightmare';
  victory: { kinds: ('eradication' | 'evacuation' | 'hold' | 'containment')[]; all: boolean };
  /** Hold victory: tick until which the core must hold; evacuation share (default 0.6). */
  holdUntilS?: number;
  evacuationShare?: number;
  /** Medal thresholds (GDD 10). */
  medals?: { bronze: number; silver: number; gold: number };
  /** Tutorial lessons 1 and 2 (GDD 15): defeat conditions are ignored, only Surrender ends the mission. */
  unlosable?: boolean;
  /** Challenges only (GDD 10 Niederlage). */
  timeLimitS?: number;
}
