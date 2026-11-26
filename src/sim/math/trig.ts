// Deterministic trigonometry. Angles are integer units (ANGLE_UNITS per full turn).
// Tables are built only from IEEE basic operations (+ - * /, sqrt), never from the engine's
// transcendental functions, whose last bits may differ between browsers.

export const ANGLE_BITS = 12;
export const ANGLE_UNITS = 1 << ANGLE_BITS;
export const ANGLE_MASK = ANGLE_UNITS - 1;
const QUARTER = ANGLE_UNITS >> 2;
const HALF = ANGLE_UNITS >> 1;
export const RAD_PER_UNIT = (2 * Math.PI) / ANGLE_UNITS;
export const UNITS_PER_RAD = ANGLE_UNITS / (2 * Math.PI);

/** Taylor series, accurate to double precision for |x| <= pi/4. */
function seriesSin(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let k = 1; k <= 12; k++) {
    term *= -x2 / (2 * k * (2 * k + 1));
    sum += term;
  }
  return sum;
}

function seriesCos(x: number): number {
  const x2 = x * x;
  let term = 1;
  let sum = 1;
  for (let k = 1; k <= 12; k++) {
    term *= -x2 / ((2 * k - 1) * (2 * k));
    sum += term;
  }
  return sum;
}

/** Arctangent for t in [0, 1] via half-angle reduction to |u| <= tan(pi/8), then series. */
function seriesAtan(t: number): number {
  const u = t / (1 + Math.sqrt(1 + t * t));
  const u2 = u * u;
  let pow = u;
  let sum = 0;
  for (let k = 0; k < 24; k++) {
    sum += (k % 2 === 0 ? pow : -pow) / (2 * k + 1);
    pow *= u2;
  }
  return 2 * sum;
}

const SIN = new Float32Array(ANGLE_UNITS);
for (let i = 0; i <= QUARTER; i++) {
  // Keep the series argument within [0, pi/4] by using the complement in the upper octant.
  SIN[i] = i <= QUARTER / 2 ? seriesSin(i * RAD_PER_UNIT) : seriesCos((QUARTER - i) * RAD_PER_UNIT);
}
for (let i = 0; i < QUARTER; i++) SIN[HALF - i] = SIN[i] as number;
// 0 - v avoids negative zero.
for (let i = 0; i < HALF; i++) SIN[HALF + i] = 0 - (SIN[i] as number);

/** atan(t) in angle units for t = i / ATAN_STEPS, i in [0, ATAN_STEPS]. */
const ATAN_STEPS = 1024;
const ATAN = new Float64Array(ATAN_STEPS + 1);
for (let i = 0; i <= ATAN_STEPS; i++) ATAN[i] = seriesAtan(i / ATAN_STEPS) * UNITS_PER_RAD;

export const sinU = (angle: number): number => SIN[angle & ANGLE_MASK] as number;
export const cosU = (angle: number): number => SIN[(angle + QUARTER) & ANGLE_MASK] as number;

/** Converts radians (data values) to the nearest angle unit, wrapped to [0, ANGLE_UNITS). */
export const angleFromRad = (rad: number): number => Math.round(rad * UNITS_PER_RAD) & ANGLE_MASK;

/** Unwrapped conversion, e.g. for turn limits: 0.25 rad -> 163 units. */
export const unitsFromRad = (rad: number): number => Math.round(rad * UNITS_PER_RAD);

function atanUnits(t: number): number {
  const f = t * ATAN_STEPS;
  const i = f | 0;
  if (i >= ATAN_STEPS) return ATAN[ATAN_STEPS] as number;
  const a = ATAN[i] as number;
  return a + ((ATAN[i + 1] as number) - a) * (f - i);
}

/** Direction of (x, y) as an integer angle unit in [0, ANGLE_UNITS). (0, 0) maps to 0. */
export function atan2Angle(y: number, x: number): number {
  const ax = x < 0 ? -x : x;
  const ay = y < 0 ? -y : y;
  if (ax === 0 && ay === 0) return 0;
  let a = ay <= ax ? atanUnits(ay / ax) : QUARTER - atanUnits(ax / ay);
  if (x < 0) a = HALF - a;
  if (y < 0) a = ANGLE_UNITS - a;
  return Math.round(a) & ANGLE_MASK;
}
