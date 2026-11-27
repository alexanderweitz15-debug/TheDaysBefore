// Mission outcome, scoring and debrief (GDD 10). Debrief is sent once when the mission ends.

export type VictoryKind = 'eradication' | 'evacuation' | 'hold' | 'containment';
export type DefeatReason = 'hqLost' | 'populationLost' | 'timeLimit' | 'surrender';

export interface ObjectiveView {
  kind: VictoryKind;
  /** 0..1 progress toward the condition. */
  progress: number;
  met: boolean;
}

export interface MissionOutcome {
  result: 'victory' | 'defeat';
  /** VictoryKind for victories, DefeatReason for defeats. */
  reason: VictoryKind | DefeatReason;
  tick: number;
}

/** Canonical keys (i18n: score.<key>, moment.<key>, cause.<key>). Sim and UI use only these. */
export const SCORE_LINE_KEYS = [
  'civilianSaved',
  'soldierSurvived',
  'zombieKilled',
  'fastVictory',
  'civilianKilledByOwnWeapons',
  'infectedEvacuated',
  'sectorAbandoned',
] as const;
export const MOMENT_KEYS = [
  'outbreak',
  'defense',
  'firstWallLost',
  'firstColossus',
  'firstZoneBreached',
  'firstSoldierLost',
  'ammoOut',
  'hqLost',
  'victory',
  'defeat',
] as const;
export const CAUSE_KEYS = [
  'wallLost',
  'noAntiArmor',
  'zoneBreached',
  'ammoOut',
  'hqOverrun',
  'lateOutbreakResponse',
  'populationLost',
  'timeLimit',
  'collateral',
  'lowMorale',
] as const;
export type ScoreLineKey = (typeof SCORE_LINE_KEYS)[number];
export type MomentKey = (typeof MOMENT_KEYS)[number];
export type CauseKey = (typeof CAUSE_KEYS)[number];

/** One line of the score table (GDD 10 Wertung): key, count and points. */
export interface ScoreLine {
  key: ScoreLineKey;
  count: number;
  points: number;
}

export interface ScoreView {
  lines: ScoreLine[];
  multiplier: number;
  total: number;
  medal: 'none' | 'bronze' | 'silver' | 'gold';
}

/** Time series sampled every HISTORY_SAMPLE_TICKS (data) over the mission. */
export interface HistorySeries {
  sampleTicks: number;
  infected: Float32Array;
  civilians: Float32Array;
  soldiers: Float32Array;
  morale: Float32Array;
  budget: Float32Array;
}

/** Coarse grids for heatmaps and the time-lapse (row-major, cellM meters per cell). */
export interface DebriefGrids {
  widthCells: number;
  heightCells: number;
  cellM: number;
  infection: Uint8Array;
  losses: Uint8Array;
  collateral: Uint8Array;
  /**
   * Time-lapse frames. Layout per frame f: bytes [f*2*n, f*2*n + n) = zombie density,
   * [f*2*n + n, (f+1)*2*n) = civilian density, with n = widthCells * heightCells.
   */
  frameCount: number;
  frameTicks: number;
  frames: Uint8Array;
}

export interface KeyMoment {
  tick: number;
  key: MomentKey;
  x: number;
  y: number;
}

export interface DebriefData {
  outcome: MissionOutcome;
  score: ScoreView;
  history: HistorySeries;
  grids: DebriefGrids;
  moments: KeyMoment[];
  /** 1-3 main causes for a defeat (GDD 15 "Warum habe ich verloren?"), i18n keys with params. */
  causes: { key: CauseKey; tick: number; params: Record<string, number> }[];
}
