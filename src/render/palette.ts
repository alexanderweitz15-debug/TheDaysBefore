// Single source of all colors (GDD section 5, "Farblogik"). No other file may hardcode a color.
// Every color with a meaning has a color-blind-safe pattern name that the renderer draws instead of or on top of the hue.

export type PatternName =
  | 'filled'
  | 'outline'
  | 'ring'
  | 'double-line'
  | 'dots'
  | 'hatch'
  | 'mesh'
  | 'waves'
  | 'cloud'
  | 'grid'
  | 'concentric'
  | 'exclamation';

export interface SemanticColor {
  /** 0xRRGGBB for Pixi. */
  readonly color: number;
  /** Shape or pattern used in color-blind mode. */
  readonly pattern: PatternName;
}

const sem = (color: number, pattern: PatternName): SemanticColor => ({ color, pattern });

export const palette = {
  // Reserved: civilians are always white, own forces always green. No other element may use these.
  civilian: sem(0xffffff, 'dots'),
  civilianPanic: sem(0xfff3a0, 'ring'),
  friendly: sem(0x4fd16a, 'filled'),
  friendlyBot: sem(0x4fd16a, 'outline'),
  zone: sem(0x3d7bff, 'double-line'),
  infection: {
    viral: sem(0xb04bff, 'dots'),
    bacterial: sem(0xc8c42e, 'hatch'),
    fungal: sem(0xd9774a, 'mesh'),
    parasitic: sem(0xe0344a, 'waves'),
    chemical: sem(0x8fa3b8, 'cloud'),
    nanotech: sem(0x2ee6d6, 'grid'),
  },
  /** Patient zero highlight on top of the viral color; neither white nor green nor red. */
  patientZero: sem(0xf0b8ff, 'ring'),
  /** Stylized blood decal (violence setting). */
  blood: 0x5a1218,
  radio: sem(0xffffff, 'concentric'),
  alert: sem(0xe5323c, 'exclamation'),

  // Neutral map colors.
  background: 0x0b0f14,
  gridMinor: 0x1a232e,
  gridMajor: 0x2b3a4b,
  worldBorder: 0x5a7391,
  /** Placeholder for dummy agents until real unit colors exist. Neither white nor green. */
  debugAgent: 0x8c96a1,
  /** Base color of white sprite textures that are tinted per agent kind. */
  spriteBase: 0xffffff,

  // Static city map. Muted on purpose: no saturated green (own forces) and no white (civilians).
  map: {
    ground: 0x1c242c,
    water: 0x17304a,
    park: 0x25342e,
    forest: 0x1e2c27,
    roadStreet: 0x3a4652,
    roadMain: 0x4d5b69,
    roadCasing: 0x141b22,
    bridge: 0x6a6f78,
    bridgeCasing: 0x0e1318,
    rail: 0x2a2f36,
    railTie: 0x7b6e62,
    shadow: 0x05080b,
    /** Wall color is the roof color multiplied by this factor. */
    wallShade: 0.55,
    /** Hospital marker: a plain "H", never a red cross. */
    hospitalMark: 0x9ec3ff,
    sectorLine: 0xffb347,
    roofs: {
      oldtown: 0x8a6f5c,
      residential: 0x6f7d8c,
      highrise: 0x5d6f86,
      industrial: 0x70685f,
      harbor: 0x5b7378,
      university: 0x7f6f8f,
      hospital: 0x8d98a6,
      commercial: 0x887a60,
      suburb: 0x7a7468,
      military: 0x5c614f,
      station: 0x7f6a5a,
      airport: 0x68727c,
    },
  },
  /** Combat effects. Warm tones only: white is civilians, green is own forces. */
  combat: {
    muzzle: 0xffc857,
    tracer: 0xffb347,
    shell: 0xe8863a,
    fire: 0xff7a2e,
    flash: 0xffe2a8,
    spark: 0xffd27a,
    smoke: 0x59616b,
    debris: 0x6b5a4a,
    shock: 0xffc98a,
    crater: 0x0a0d10,
  },
  /** Own structures are drawn in friendly green; these are the extra tones. */
  structure: {
    rubble: 0x6b6258,
    rubbleDark: 0x3a342e,
    shade: 0x0a1f10,
    damage: 0xffb347,
  },
  /** Placement preview: valid is friendly green, invalid the alert color plus a cross. */
  preview: {
    ok: 0x4fd16a,
    bad: 0xe5323c,
    attack: 0xe5323c,
  },
  /** Economy building outlines on the map: own buildings accent blue, bottleneck alert red (plus cross), pick focus amber. */
  economy: {
    operating: sem(0x6fa3d9, 'outline'),
    building: sem(0x3d6d99, 'hatch'),
    bottleneck: sem(0xe5323c, 'exclamation'),
    pick: sem(0xffb347, 'double-line'),
  },
  /** Debrief heatmaps and time-lapse; each map has its own tab and a text label, so hue is never the only cue. */
  debrief: {
    infection: 0xb04bff,
    losses: 0xe5323c,
    collateral: 0xffb347,
    line: 0x6fa3d9,
  },
  overlay: {
    flow: 0x6fa3d9,
    density: 0xffb347,
    infection: 0xb04bff,
    noise: 0xffd166,
    safety: 0x3d7bff,
  },

  // UI tokens, exported as CSS variables by the UI (see ui/palette-vars.ts).
  ui: {
    panel: 0x0f161e,
    panelBorder: 0x34475b,
    text: 0xd5dde6,
    textDim: 0x8393a5,
    accent: 0x6fa3d9,
    accentSoft: 0x1e3a57,
    danger: 0xe5323c,
    warn: 0xffd166,
    focus: 0xffb347,
  },
} as const;

export const toCss = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
