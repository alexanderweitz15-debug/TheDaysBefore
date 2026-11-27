// Placement of structures while tool 'build' is armed (GDD 14, Bauen). Points: click. Lines: drag.

import type { StructureKind } from '../../core/commands';
import type { CommandSink, SimView } from '../../core/types/app';
import { STRUCTURES } from '../../data/buildings/defense';
import { MIN_LINE_LENGTH_M, ROTATE_STEP } from '../../data/hud';
import { PREVIEW_SAMPLE_M } from '../../data/render-combat';
import { placeable } from '../../render/layers/build-preview';
import { activeTool, buildArm, buildState, screenToWorld, toolDraft } from '../../render/view-state';
import { cancelTool, notify } from './zone-tools';

const LOCAL_PLAYER = 0;

/** Share of free samples along a line; the sim builds the free parts of a partly blocked line. */
function lineFreeShare(sim: SimView, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / PREVIEW_SAMPLE_M));
  let free = 0;
  for (let i = 0; i <= n; i++)
    if (placeable(sim.map, a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)) free++;
  return free / (n + 1);
}

export function installBuildTool(sim: SimView, commands: CommandSink): () => void {
  let lineStart: { x: number; y: number } | null = null;
  const onCanvas = (e: Event): boolean => e.target instanceof HTMLCanvasElement;
  const arm = () => (activeTool.value === 'build' ? buildArm.value : null);

  const onDown = (e: PointerEvent): void => {
    const a = arm();
    if (!a || e.button !== 0 || !onCanvas(e)) return;
    const p = screenToWorld(e.clientX, e.clientY);
    // Invalid ground (off map, water, building): no command, the red preview is the hint.
    const spec = STRUCTURES[a.structure as StructureKind];
    // Lines may start on blocked ground: the sim builds the free stretches only.
    if (!spec.line && !placeable(sim.map, p.x, p.y)) {
      notify('tool.build.blocked');
      return;
    }
    if (spec.line) {
      lineStart = p;
      toolDraft.startX = p.x;
      toolDraft.startY = p.y;
    } else {
      commands.submit({
        playerId: LOCAL_PLAYER,
        type: 'PlaceStructure',
        payload: { kind: a.structure as StructureKind, points: [p.x, p.y], rotation: buildState.rotation },
      });
      if (!e.shiftKey) cancelTool();
    }
  };
  const onUp = (e: PointerEvent): void => {
    const a = arm();
    if (!lineStart || !a || a.kind !== 'structure' || e.button !== 0) return;
    const p = screenToWorld(e.clientX, e.clientY);
    const s = lineStart;
    lineStart = null;
    toolDraft.startX = Number.NaN;
    if (Math.hypot(p.x - s.x, p.y - s.y) < MIN_LINE_LENGTH_M) {
      notify('tool.build.lineShort');
      return;
    }
    const share = lineFreeShare(sim, s, p);
    if (share <= 0) notify('tool.build.lineBlocked');
    else {
      if (share < 1) notify('tool.build.linePartial');
      commands.submit({
        playerId: LOCAL_PLAYER,
        type: 'PlaceStructure',
        payload: { kind: a.structure as StructureKind, points: [s.x, s.y, p.x, p.y], rotation: 0 },
      });
      if (!e.shiftKey) cancelTool();
    }
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'KeyR' && !e.repeat && !e.ctrlKey && !e.metaKey && arm())
      buildState.rotation = (buildState.rotation + ROTATE_STEP) % (Math.PI * 2);
  };
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
  };
}
