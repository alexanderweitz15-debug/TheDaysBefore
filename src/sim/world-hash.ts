// World hash (determinism checks, replays, save games): folds the full simulation state. Free mode keeps the M3
// hash: economy, mission and outcome are folded only in missions.
import { type HashState, hashU32, hashView } from '../core/hash';
import type { SimState } from './state';

export function hashWorld(h: HashState, s: SimState, mapHash: number): void {
  hashU32(h, mapHash);
  hashView(h, s.rng.getState());
  for (const p of [s.zombies, s.civilians, s.corpses.pool]) {
    const hw = p.highWater;
    hashU32(h, hw);
    hashU32(h, p.count);
    hashView(h, p.freeSlots());
    for (const a of [p.posX, p.posY, p.velX, p.velY, p.kind, p.alive, p.cell, p.target, p.hp])
      hashView(h, a.subarray(0, hw));
  }
  const zhw = s.zombies.highWater;
  for (const a of [s.zt.cooldown, s.zt.boostUntil, s.zt.screamAt]) hashView(h, a.subarray(0, zhw));
  for (const a of s.ct.hashArrays(s.civilians.highWater)) hashView(h, a);
  hashView(h, s.corpses.riseTick.subarray(0, s.corpses.pool.highWater));
  hashView(h, s.zombieCells);
  hashView(h, s.civilianCells);
  hashView(h, s.infection);
  hashView(h, s.noise.level);
  for (const a of s.zones.hashArrays()) hashView(h, a);
  for (const v of s.zones.hashValues()) hashU32(h, v);
  hashView(h, s.safety.dirs);
  for (const v of s.safety.hashValues()) hashU32(h, v);
  for (const v of s.outbreak.hashValues()) hashU32(h, v);
  const c = s.counters;
  for (const v of [c.sheltered, c.incubating, c.civiliansDead, c.zombiesKilled, c.outbreakTick])
    hashU32(h, v);
  hashView(h, s.flow.dirs);
  hashView(h, s.flow.dist);
  hashU32(h, s.flow.progress());
  hashU32(h, s.flow.currentDistance);
  hashU32(h, s.flow.activeSignature);
  hashView(h, s.goals.goalFlag);
  hashU32(h, s.goals.lastStart);
  hashU32(h, s.goals.forceRestart ? 1 : 0);
  hashView(h, s.zt.unitTarget.subarray(0, zhw));
  for (const v of [c.collateralKills, c.soldiersLost, c.budget]) hashU32(h, v);
  for (const a of s.units.hashArrays()) hashView(h, a);
  for (const v of s.planner.hashValues()) hashU32(h, v);
  for (const a of s.projectiles.hashArrays()) hashView(h, a);
  for (const a of s.structures.hashArrays()) hashView(h, a);
  for (const v of s.structures.hashValues()) hashU32(h, v);
  for (const a of [s.walkable, s.civWalk, s.zombieWalk, s.structAt, s.slowAt, s.suppressUntil])
    hashView(h, a);
  const r = s.routine;
  const chw = s.civilians.highWater;
  for (const a of [r.home, r.work, r.market, r.dest, r.timer]) hashView(h, a.subarray(0, chw));
  hashU32(h, r.progress());
  // Missions only: free mode keeps the M3 hash.
  if (s.eco.active || s.mission.active) {
    for (const a of [...s.eco.hashArrays(), ...s.mission.hashArrays()]) hashView(h, a);
    for (const v of [...s.eco.hashValues(), ...s.mission.hashValues()]) hashU32(h, v);
    for (const v of s.result.hashValues()) hashU32(h, v);
  }
}
