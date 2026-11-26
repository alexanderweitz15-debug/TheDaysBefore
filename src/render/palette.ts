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
  radio: sem(0xffffff, 'concentric'),
  alert: sem(0xe5323c, 'exclamation'),

  // Neutral map colors.
  background: 0x0b0f14,
  gridMinor: 0x1a232e,
  gridMajor: 0x2b3a4b,
  worldBorder: 0x5a7391,
  /** Placeholder for dummy agents until real unit colors exist. Neither white nor green. */
  debugAgent: 0x8c96a1,

  // UI tokens, exported as CSS variables by the UI (see ui/palette-vars.ts).
  ui: {
    panel: 0x0f161e,
    panelBorder: 0x34475b,
    text: 0xd5dde6,
    textDim: 0x8393a5,
    accent: 0x6fa3d9,
    accentSoft: 0x1e3a57,
    danger: 0xe5323c,
    focus: 0xffb347,
  },
} as const;

export const toCss = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
