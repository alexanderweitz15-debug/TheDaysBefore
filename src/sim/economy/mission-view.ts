// MissionView for the UI (once per second) and the mission commands (GDD 6).
import type { Command, ResourceId } from '../../core/commands';
import type { EconomyBuildingView, MissionView, ResourceView } from '../../core/types/mission';
import { ECONOMY_RULES } from '../../data/economy/economy';
import type { SimState } from '../state';
import { BOTTLENECKS, DECREE_IDS, EB_KINDS, MORALE_FACTORS, NR, R, RESOURCES } from './economy';
import {
  investigateWarning,
  PH_FARM,
  PHASE_NAMES,
  triggerOutbreak,
  WS_INVESTIGATED,
  WS_OPEN,
} from './mission';
import { assignWorkers, setDecree } from './population';
import { EB_POWER, EB_WORKERS, PASS_MIN, repurpose } from './production';

const T = ECONOMY_RULES.trendPasses;

/** Mission commands; returns false for other command types. */
export function applyMissionCommand(s: SimState, cmd: Command): boolean {
  switch (cmd.type) {
    case 'RepurposeBuilding':
      repurpose(s, cmd.payload.buildingId, cmd.payload.kind);
      return true;
    case 'AssignWorkers':
      assignWorkers(s, cmd.payload.workers, cmd.payload.conscripts, cmd.payload.helpers);
      return true;
    case 'SetDecree':
      setDecree(s, cmd.payload.decree, cmd.payload.active);
      return true;
    case 'InvestigateWarning':
      investigateWarning(s, cmd.payload.warningId, s.tick);
      return true;
    case 'TriggerOutbreak':
      triggerOutbreak(s);
      return true;
    default:
      return false;
  }
}

function resources(s: SimState): Record<ResourceId, ResourceView> {
  const e = s.eco;
  const out = {} as Record<ResourceId, ResourceView>;
  const p = e.passes;
  const p0 = Math.max(1, p - T + 1);
  for (const id of RESOURCES) {
    const r = R[id] as number;
    const amount =
      r === R.budget ? s.counters.budget + (e.active ? (e.amount[r] as number) : 0) : (e.amount[r] as number);
    const span = p - p0;
    const perMin =
      e.active && span > 0
        ? ((e.history[(p % T) * NR + r] as number) - (e.history[(p0 % T) * NR + r] as number)) /
          (span * PASS_MIN)
        : 0;
    const capacity = e.active ? (e.capacity[r] as number) : ECONOMY_RULES.unlimited;
    out[id] = { amount, capacity, perMin };
  }
  return out;
}

function buildings(s: SimState): EconomyBuildingView[] {
  const e = s.eco;
  const ratio = e.powerDemand > 0 ? Math.min(1, e.powerSupply / e.powerDemand) : 1;
  const out: EconomyBuildingView[] = [];
  for (let i = 0; i < e.highWater; i++) {
    if (!e.alive[i]) continue;
    const k = e.kind[i] as number;
    const outputPerMin: Partial<Record<ResourceId, number>> = {};
    for (let r = 0; r < NR; r++) {
      const v = e.output[i * NR + r] as number;
      if (v > 0) outputPerMin[RESOURCES[r] as ResourceId] = v;
    }
    out.push({
      id: e.id[i] as number,
      buildingId: e.building[i] as number,
      kind: EB_KINDS[k] as EconomyBuildingView['kind'],
      progress: e.progress[i] as number,
      workers: e.workers[i] as number,
      workersNeeded: EB_WORKERS[k] as number,
      powered: (EB_POWER[k] as number) <= 0 || ratio >= 1,
      outputPerMin,
      bottleneck: (e.progress[i] as number) < 1 ? null : (BOTTLENECKS[e.bottleneck[i] as number] ?? null),
    });
  }
  return out;
}

export function missionView(s: SimState): MissionView {
  const e = s.eco;
  const m = s.mission;
  const tick = s.tick;
  const total = s.civilians.count;
  const workers = Math.floor((total * e.workersPct) / 100);
  const conscripts = Math.floor((total * e.conscriptsPct) / 100);
  const helpers = Math.min(
    total - workers - conscripts,
    Math.floor((total * e.helpersPct) / 100) + e.volunteers,
  );
  const warnings: MissionView['warnings'] = [];
  for (let k = 0; k < m.wState.length && m.active; k++) {
    const st = m.wState[k] as number;
    if (st < WS_OPEN) continue;
    warnings.push({
      id: k + 1,
      key: `warning.${m.wKey[k]}`,
      x: m.wX[k] as number,
      y: m.wY[k] as number,
      investigated: st === WS_INVESTIGATED,
      escalatesInTicks: st === WS_OPEN ? Math.max(0, (m.wUntil[k] as number) - tick) : 0,
    });
  }
  return {
    // Free mode has no farm phase: it is always defense.
    phase: m.active ? (PHASE_NAMES[m.phase] as MissionView['phase']) : 'defense',
    countdownTicks:
      m.active && m.countdownVisible && m.phase === PH_FARM ? Math.max(0, m.outbreakAt - tick) : null,
    classicStart: m.active ? m.classic : false,
    outbreakPressure: m.pressure,
    resources: resources(s),
    buildings: buildings(s),
    population: {
      total,
      workers,
      conscripts,
      helpers,
      free: Math.max(0, total - workers - conscripts - helpers),
    },
    morale: e.morale,
    moraleFactors: e.active ? MORALE_FACTORS.map((key, k) => ({ key, value: e.factors[k] as number })) : [],
    activeDecrees: DECREE_IDS.filter((_, k) => e.decrees[k] === 1),
    warnings,
  };
}
