// Global game keys from GDD 14: Space, +/-, B, H, F, X, Home, digits for groups. K/Z/V live in zone-tools,
// O in hotkeys. Browser-reserved shortcuts are avoided: groups are saved with Shift, not Ctrl.
import { type FireMode, GAME_SPEEDS, type GameSpeed, type Stance } from '../../core/commands';
import type { CommandSink, SimView } from '../../core/types/app';
import { CONFIRM_MS, GROUP_DOUBLE_MS } from '../../data/hud';
import { jumpCamera, selectedStructure, selectedUnits } from '../../render/view-state';
import { keyOf } from '../settings/store';
import { commandTab, demolishConfirm, menuVisible, settingsOpen } from '../ui-state';

const LOCAL_PLAYER = 0;
const STANCE_CYCLE: readonly Stance[] = ['hold', 'holdUntilLosses', 'aggressive', 'retreat'];
const FIRE_CYCLE: readonly FireMode[] = ['free', 'onCommand'];

/** Saved unit groups 0..9. */
export const groups: number[][] = Array.from({ length: 10 }, () => []);

let confirmTimer = 0;

/** Demolish needs a second press (GDD 13: confirmation before demolition). */
export function requestDemolish(commands: CommandSink, id: number): void {
  if (demolishConfirm.value === id) {
    window.clearTimeout(confirmTimer);
    demolishConfirm.value = null;
    commands.submit({ playerId: LOCAL_PLAYER, type: 'DemolishStructure', payload: { id } });
    selectedStructure.value = null;
    return;
  }
  demolishConfirm.value = id;
  window.clearTimeout(confirmTimer);
  confirmTimer = window.setTimeout(() => (demolishConfirm.value = null), CONFIRM_MS);
}

function isTyping(): boolean {
  const el = document.activeElement;
  return (
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
  );
}

const isSpeedUp = (e: KeyboardEvent): boolean =>
  e.code === keyOf('speedUp') || e.code === 'NumpadAdd' || e.key === '+';
const isSpeedDown = (e: KeyboardEvent): boolean =>
  e.code === keyOf('speedDown') || e.code === 'NumpadSubtract' || e.key === '-';
const isSpeedKey = (e: KeyboardEvent): boolean => isSpeedUp(e) || isSpeedDown(e);

export function installGameKeys(sim: SimView, commands: CommandSink): () => void {
  let lastSpeed: GameSpeed = 1;
  let lastDigit = { code: '', t: 0 };
  const send = (type: 'SetGameSpeed' | 'SetStance' | 'SetFireMode', payload: object): void =>
    commands.submit({ playerId: LOCAL_PLAYER, type, payload } as Parameters<CommandSink['submit']>[0]);

  const centerOn = (ids: readonly number[]): void => {
    const s = sim.curr?.units;
    if (!s) return;
    const set = new Set(ids);
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i < s.count; i++) {
      if (!set.has(s.ids[i] as number)) continue;
      sx += s.pos[i * 2] as number;
      sy += s.pos[i * 2 + 1] as number;
      n++;
    }
    if (n > 0) jumpCamera(sx / n, sy / n);
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping() || settingsOpen.value || menuVisible.value) return;
    const speed = sim.stats.speed as GameSpeed;
    const units = sim.units.filter((u) => selectedUnits.value.includes(u.id));
    if (e.code === keyOf('pause')) {
      e.preventDefault();
      if (e.repeat) return;
      if (speed === 0) send('SetGameSpeed', { speed: lastSpeed });
      else {
        lastSpeed = speed;
        send('SetGameSpeed', { speed: 0 });
      }
    } else if (!e.repeat && isSpeedKey(e)) {
      const i = GAME_SPEEDS.indexOf(speed);
      const next = GAME_SPEEDS[Math.max(1, Math.min(GAME_SPEEDS.length - 1, i + (isSpeedUp(e) ? 1 : -1)))];
      if (next !== undefined) send('SetGameSpeed', { speed: next });
    } else if (e.repeat) {
      return;
    } else if (e.code === keyOf('tabDefense')) commandTab.value = 'defense';
    else if (e.code === keyOf('stance') && units.length > 0) {
      const i = STANCE_CYCLE.indexOf((units[0] as (typeof units)[number]).stance);
      send('SetStance', {
        unitIds: units.map((u) => u.id),
        stance: STANCE_CYCLE[(i + 1) % STANCE_CYCLE.length],
      });
    } else if (e.code === keyOf('fireMode') && units.length > 0) {
      const i = FIRE_CYCLE.indexOf((units[0] as (typeof units)[number]).fireMode);
      send('SetFireMode', { unitIds: units.map((u) => u.id), mode: FIRE_CYCLE[(i + 1) % FIRE_CYCLE.length] });
    } else if (e.code === keyOf('demolish') && selectedStructure.value !== null)
      requestDemolish(commands, selectedStructure.value);
    else if (e.code === keyOf('home')) {
      const depot = sim.structures.find((s) => s.kind === 'depot');
      if (depot) jumpCamera(depot.shape[0] as number, depot.shape[1] as number);
      else if (sim.curr) jumpCamera(sim.curr.widthM / 2, sim.curr.heightM / 2);
    } else if (/^Digit[0-9]$/.test(e.code)) {
      const n = Number(e.code.slice(5));
      if (e.shiftKey) groups[n] = [...selectedUnits.value];
      else {
        const alive = new Set(sim.units.map((u) => u.id));
        const ids = (groups[n] as number[]).filter((id) => alive.has(id));
        if (ids.length === 0) return;
        selectedStructure.value = null;
        selectedUnits.value = ids;
        const now = performance.now();
        if (lastDigit.code === e.code && now - lastDigit.t < GROUP_DOUBLE_MS) centerOn(ids);
        lastDigit = { code: e.code, t: now };
      }
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
