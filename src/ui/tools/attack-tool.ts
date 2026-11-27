// Area fire (GDD 14, Interaktion): with an area-fire unit selected (mortar), key G or the context button arms the
// tool, the renderer shows radius and estimated civilians, a click orders AttackArea. Umschalt keeps it armed.
import type { CommandSink, SimView } from '../../core/types/app';
import { ATTACK_KEY } from '../../data/render-combat';
import { UNITS } from '../../data/units/present';
import { activeTool, buildArm, screenToWorld, selectedUnits } from '../../render/view-state';
import { menuVisible, settingsOpen } from '../ui-state';
import { cancelTool } from './zone-tools';

const LOCAL_PLAYER = 0;

/** Selected unit ids that can fire at an area. */
export function areaFireUnits(sim: SimView): number[] {
  const sel = new Set(selectedUnits.value);
  return sim.units.filter((u) => sel.has(u.id) && UNITS[u.type].areaRadiusM > 0).map((u) => u.id);
}

export function armAttackArea(sim: SimView): void {
  if (areaFireUnits(sim).length === 0) return;
  cancelTool();
  buildArm.value = null;
  activeTool.value = 'attackArea';
}

export function installAttackTool(sim: SimView, commands: CommandSink): () => void {
  const onKey = (e: KeyboardEvent): void => {
    const el = document.activeElement;
    if (
      e.code !== ATTACK_KEY ||
      e.repeat ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      settingsOpen.value ||
      menuVisible.value ||
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    )
      return;
    armAttackArea(sim);
  };
  const onDown = (e: PointerEvent): void => {
    if (activeTool.value !== 'attackArea' || e.button !== 0 || !(e.target instanceof HTMLCanvasElement))
      return;
    const unitIds = areaFireUnits(sim);
    if (unitIds.length === 0) {
      cancelTool();
      return;
    }
    const p = screenToWorld(e.clientX, e.clientY);
    commands.submit({ playerId: LOCAL_PLAYER, type: 'AttackArea', payload: { unitIds, x: p.x, y: p.y } });
    if (!e.shiftKey) cancelTool();
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onDown);
  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerdown', onDown);
  };
}
