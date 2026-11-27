import { describe, expect, it } from 'vitest';
import type { Command } from '../../core/commands';
import { createRng } from '../../core/rng';
import { SAVE_FORMAT_VERSION } from '../../core/types/save';
import { CityWorld, restoreWorld } from '../world';
import { decodeBlock, encodeBlock } from './blocks';
import { hashOf, missionOptions, runTo, SEED, script } from './save-fixtures';

/** Saves at each tick in `saveAt`, then checks that every restore continues with the same hashes. */
function checkRestores(
  w: CityWorld,
  commands: readonly Command[],
  saveAt: number[],
  end: number,
  horizon: number,
) {
  const opts = { size: w.size, ...(w.s.mission.active ? missionOptions() : {}) };
  const saves = new Map<number, Uint8Array>();
  const hashes = new Map<number, string>();
  runTo(w, commands, end, (t) => {
    if (saveAt.includes(t)) saves.set(t, w.serialize());
    if (t % 10 === 0) hashes.set(t, hashOf(w));
  });
  expect(saves.size).toBe(saveAt.length);
  for (const [t, bytes] of saves) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, 8);
    expect(dv.getUint32(0, true)).toBe(t);
    expect(dv.getUint32(4, true)).toBe(SAVE_FORMAT_VERSION);
    const r = restoreWorld(SEED, opts, bytes) as CityWorld;
    expect(r.completedTicks).toBe(t);
    const got: string[] = [];
    const want: string[] = [];
    runTo(r, commands, Math.min(end, t + horizon), (tt) => {
      if (tt % 10 !== 0) return;
      got.push(`${tt}:${hashOf(r)}`);
      want.push(`${tt}:${hashes.get(tt)}`);
    });
    expect(got, `restore from tick ${t}`).toEqual(want);
  }
}

describe('save: restore continues bit-identically', () => {
  it('mission with outbreak, squads, structures, zones; saves while fields are busy or recomputing', () => {
    const w = new CityWorld(SEED, missionOptions());
    // 9: routine fields not ready, safety job running; 401: flow field job; 1330: wall finished, repath pending;
    // 1357/1362: civilian fields recomputing (with safety, flow jobs).
    checkRestores(w, script(w), [9, 300, 401, 1330, 1357, 1362], 1500, 120);
    expect(w.unitCount).toBeGreaterThan(2);
    expect(w.zombieCount).toBeGreaterThan(5);
  }, 120_000);

  it('free mode', () => {
    const w = new CityWorld(SEED, { size: 'small' });
    const x = w.widthM / 2;
    const cmds: Command[] = [
      { type: 'StartOutbreak', playerId: 0, tick: 2, payload: { x, y: x, family: 'viral' } },
      { type: 'DebugSpawn', playerId: 0, tick: 3, payload: { x: x + 100, y: x, count: 300, kind: 'zombie' } },
      { type: 'PlaceUnit', playerId: 0, tick: 4, payload: { unitType: 'infantry', x: x + 60, y: x } },
    ];
    checkRestores(w, cmds, [50, 230], 400, 120);
  }, 60_000);

  it('orders: reserve, line, garrison, zone, update and cancel', () => {
    const w = new CityWorld(SEED, { size: 'small' });
    const B = w.s.map.buildings;
    let b = 0;
    while ((B.floors[b] as number) < 4 || (B.w[b] as number) < 3 || (B.h[b] as number) < 3) b++;
    const bx = ((B.x[b] as number) + (B.w[b] as number) / 2) * 4;
    const by = ((B.y[b] as number) + (B.h[b] as number) / 2) * 4;
    const at = (tick: number, type: Command['type'], payload: object): Command =>
      ({ tick, playerId: 0, type, payload }) as Command;
    const cmds: Command[] = [
      ...[0, 1, 2, 3, 4].map((k) =>
        at(1, 'PlaceUnit', { unitType: k === 4 ? 'mgTeam' : 'infantry', x: 20 + 4 * k, y: 20 }),
      ),
      at(2, 'DefendLine', { points: [30, 60, 70, 60], squads: { infantry: 2, mgTeam: 1 }, stance: 'hold' }),
      at(3, 'OccupyBuilding', { buildingId: b, squads: { infantry: 1 }, stance: 'hold' }),
      at(4, 'HoldZone', { x0: 0, y0: 0, x1: 100, y1: 100, squads: { infantry: 1 }, stance: 'aggressive' }),
      at(5, 'DebugSpawn', { x: bx + 16, y: by, count: 80, kind: 'zombie' }),
      at(300, 'UpdateOrder', { orderId: 1, squads: { infantry: 1, mgTeam: 1 }, stance: 'aggressive' }),
      at(500, 'CancelOrder', { orderId: 3 }),
    ];
    checkRestores(w, cmds, [40, 290, 301, 520], 700, 120);
    expect(w.orders().orders.length).toBe(2);
  }, 120_000);

  it('rejects other format versions and other cities', () => {
    const w = new CityWorld(SEED, missionOptions());
    runTo(w, [], 5);
    const bytes = w.serialize();
    const bad = bytes.slice();
    new DataView(bad.buffer).setUint32(4, SAVE_FORMAT_VERSION + 1, true);
    expect(() => restoreWorld(SEED, missionOptions(), bad)).toThrow(/format version/);
    expect(() => restoreWorld(SEED + 1, missionOptions(), bytes)).toThrow(/another city/);
    expect(() => restoreWorld(SEED, missionOptions(), bytes.subarray(0, 6))).toThrow(/too short/);
  });

  it('outcome and debrief survive a save', () => {
    const w = new CityWorld(SEED, missionOptions());
    runTo(w, [{ type: 'Surrender', playerId: 0, tick: 30, payload: {} }], 60);
    const r = restoreWorld(SEED, missionOptions(), w.serialize());
    expect(r.mission().outcome).toEqual(w.mission().outcome);
    expect(r.debrief()).toEqual(w.debrief());
  });
});

describe('save: blocks', () => {
  it('round-trips runs, noise and smooth integer fields in every width', () => {
    const rng = createRng(5);
    const u8 = new Uint8Array(5000);
    for (let i = 0; i < u8.length; i++) u8[i] = i % 700 < 300 ? 7 : rng.nextInt(0, 256);
    const i32 = new Int32Array(4000);
    for (let i = 0; i < i32.length; i++) i32[i] = i < 100 ? 0x7fffffff : Math.floor(i / 3) - 50;
    const f32 = new Float32Array(3000).map(() => rng.nextFloat() * 1000);
    const u16 = new Uint16Array(3001).map((_, i) => (i * 7) & 0xffff);
    for (const a of [u8, i32, f32, u16, new Float64Array([1.5, -0, Number.NaN])]) {
      const src = new Uint8Array(a.buffer);
      const block = encodeBlock(src, a.BYTES_PER_ELEMENT);
      const out = new Uint8Array(src.length);
      decodeBlock(block, 0, out);
      expect(out).toEqual(src);
    }
    // Smooth prefix sums shrink a lot with deltas.
    expect(encodeBlock(new Uint8Array(i32.buffer), 4).length).toBeLessThan(i32.byteLength / 3);
  });
});
