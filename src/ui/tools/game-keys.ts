// Global game keys from GDD 14: Space, +/-, B, N, X, Home. K/Z/V live in zone-tools, O in hotkeys.
// No selection, groups, stance or fire keys: troops are controlled by orders only.
import { GAME_SPEEDS, type GameSpeed } from '../../core/commands';
import type { CommandSink, SimView } from '../../core/types/app';
import { CONFIRM_MS } from '../../data/hud';
import { jumpCamera, selectedStructure } from '../../render/view-state';
import { keyOf } from '../settings/store';
import { commandTab, demolishConfirm, menuVisible, settingsOpen } from '../ui-state';

const LOCAL_PLAYER = 0;
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
  const send = (type: 'SetGameSpeed', payload: object): void =>
    commands.submit({ playerId: LOCAL_PLAYER, type, payload } as Parameters<CommandSink['submit']>[0]);

  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping() || settingsOpen.value || menuVisible.value) return;
    const speed = sim.stats.speed as GameSpeed;
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
    else if (e.code === keyOf('tabOrders')) commandTab.value = 'orders';
    else if (e.code === keyOf('demolish') && selectedStructure.value !== null)
      requestDemolish(commands, selectedStructure.value);
    else if (e.code === keyOf('home')) {
      const depot = sim.structures.find((s) => s.kind === 'depot');
      if (depot) jumpCamera(depot.shape[0] as number, depot.shape[1] as number);
      else if (sim.curr) jumpCamera(sim.curr.widthM / 2, sim.curr.heightM / 2);
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
