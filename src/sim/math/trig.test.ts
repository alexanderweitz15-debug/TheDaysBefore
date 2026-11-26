import { describe, expect, it } from 'vitest';
import { ANGLE_UNITS, angleFromRad, atan2Angle, cosU, RAD_PER_UNIT, sinU, unitsFromRad } from './trig';

const angleDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
};

describe('trig lookup', () => {
  it('sin and cos match the engine within 1e-3 for every unit', () => {
    let maxErr = 0;
    for (let a = 0; a < ANGLE_UNITS; a++) {
      const rad = a * RAD_PER_UNIT;
      maxErr = Math.max(maxErr, Math.abs(sinU(a) - Math.sin(rad)), Math.abs(cosU(a) - Math.cos(rad)));
    }
    expect(maxErr).toBeLessThan(1e-3);
    // The series build is far better than the required bound.
    expect(maxErr).toBeLessThan(1e-6);
  });

  it('wraps negative and large angles', () => {
    expect(sinU(-1)).toBe(sinU(ANGLE_UNITS - 1));
    expect(cosU(ANGLE_UNITS + 5)).toBe(cosU(5));
    expect(Object.is(sinU(ANGLE_UNITS / 2), 0)).toBe(true);
  });

  it('atan2 matches the engine within 1e-3 rad', () => {
    let maxErr = 0;
    for (let k = 0; k < 20_000; k++) {
      const t = (k / 20_000) * 2 * Math.PI;
      const r = 0.1 + (k % 97);
      const x = Math.cos(t) * r;
      const y = Math.sin(t) * r;
      maxErr = Math.max(maxErr, angleDiff(atan2Angle(y, x) * RAD_PER_UNIT, Math.atan2(y, x)));
    }
    expect(maxErr).toBeLessThan(1e-3);
    expect(atan2Angle(0, 0)).toBe(0);
    expect(atan2Angle(0, -1)).toBe(ANGLE_UNITS / 2);
    expect(atan2Angle(-1, 0)).toBe((3 * ANGLE_UNITS) / 4);
  });

  it('converts radians to units', () => {
    expect(unitsFromRad(0.25)).toBe(163);
    expect(angleFromRad(-RAD_PER_UNIT)).toBe(ANGLE_UNITS - 1);
  });
});
