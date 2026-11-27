// Tutorial controller and hint overlay (GDD 15): one step at a time, advances when the task is done.
import { signal } from '@preact/signals';
import type { CommandSink, SimView } from '../../core/types/app';
import { CHECK_MS, LESSONS, MARKER_PAD_PX } from '../../data/tutorial';
import type { Condition, Lesson, StartAction } from '../../data/tutorial/types';
import { cameraView, jumpCamera } from '../../render/view-state';
import { onCommand } from '../command-tap';
import { usePoll } from '../hud/use-poll';
import { t } from '../i18n';
import { activeLessonId, commandTab, loadingState, sidePanel } from '../ui-state';
import { markLessonDone } from './progress';

const LOCAL_PLAYER = 0;
const PHASE_ORDER = ['farm', 'outbreak', 'defense', 'ended'] as const;

/** Index of the current step; null when the tutorial is skipped or finished. */
export const stepIndex = signal<number | null>(null);
const skipped = signal(false);

interface Baseline {
  cam: { cx: number; cy: number; zoom: number };
  commands: { type: string; payload: Record<string, unknown> }[];
}
let base: Baseline = { cam: { cx: 0, cy: 0, zoom: 1 }, commands: [] };

function matches(c: Baseline['commands'][number], cond: Extract<Condition, { kind: 'command' }>): boolean {
  if (c.type !== cond.command) return false;
  return Object.entries(cond.match ?? {}).every(([k, v]) => c.payload[k] === v);
}

function check(cond: Condition, sim: SimView): boolean {
  switch (cond.kind) {
    case 'command':
      return base.commands.some((c) => matches(c, cond));
    case 'cameraMoved':
      return Math.hypot(cameraView.cx - base.cam.cx, cameraView.cy - base.cam.cy) * cameraView.zoom > 40;
    case 'zoomed':
      return Math.abs(Math.log(cameraView.zoom / base.cam.zoom)) > 0.15;
    case 'tab':
      return commandTab.value === cond.tab;
    case 'speed': {
      const s = sim.stats.speed;
      return cond.exactly !== undefined ? s === cond.exactly : s >= (cond.atLeast ?? 0);
    }
    case 'sheltered':
      return sim.stats.counters.sheltered >= cond.min;
    case 'phase': {
      const p = sim.mission?.phase;
      return p !== undefined && PHASE_ORDER.indexOf(p) >= PHASE_ORDER.indexOf(cond.phase);
    }
    case 'panel':
      return sidePanel.value === cond.panel;
    case 'structureCount':
      return sim.structures.filter((s) => s.kind === cond.structure).length >= cond.min;
    case 'all':
      return cond.of.every((c) => check(c, sim));
  }
}

function runStart(actions: readonly StartAction[] | undefined, sim: SimView, commands: CommandSink): void {
  for (const a of actions ?? []) {
    const w = sim.curr?.widthM ?? 0;
    const h = sim.curr?.heightM ?? 0;
    if (a.kind === 'speed')
      commands.submit({ playerId: LOCAL_PLAYER, type: 'SetGameSpeed', payload: { speed: a.value } });
    else if (a.kind === 'outbreak')
      commands.submit({ playerId: LOCAL_PLAYER, type: 'TriggerOutbreak', payload: {} });
    else if (a.kind === 'spawn')
      commands.submit({
        playerId: LOCAL_PLAYER,
        type: 'DebugSpawn',
        payload: { x: a.x * w, y: a.y * h, count: a.count, kind: a.zombie ? 'zombie' : 'civilian' },
      });
    else jumpCamera(a.x * w, a.y * h, a.zoom);
  }
}

function enter(i: number, lesson: Lesson, sim: SimView, commands: CommandSink): void {
  base = { cam: { cx: cameraView.cx, cy: cameraView.cy, zoom: cameraView.zoom }, commands: [] };
  stepIndex.value = i;
  runStart(lesson.steps[i]?.start, sim, commands);
}

/** Drives the active lesson: advance on completion, mark the lesson done on victory. */
export function installTutorial(sim: SimView, commands: CommandSink): () => void {
  let current: string | null = null;
  const offCmd = onCommand((c) => {
    base.commands.push({ type: c.type, payload: c.payload as Record<string, unknown> });
  });
  const id = window.setInterval(() => {
    const lessonId = activeLessonId.peek();
    if (lessonId !== current) {
      current = lessonId;
      skipped.value = false;
      stepIndex.value = null;
    }
    const lesson = LESSONS.find((l) => l.id === lessonId);
    if (!lesson || skipped.peek() || loadingState.peek() !== null) return;
    if (stepIndex.peek() === null) {
      if (sim.mission) enter(0, lesson, sim, commands);
      return;
    }
    const i = stepIndex.peek() as number;
    const step = lesson.steps[i];
    if (step && check(step.done, sim)) {
      if (i + 1 < lesson.steps.length) enter(i + 1, lesson, sim, commands);
      else stepIndex.value = lesson.steps.length;
    }
    if (sim.mission?.outcome?.result === 'victory') markLessonDone(lesson.id);
  }, CHECK_MS);
  return () => {
    window.clearInterval(id);
    offCmd();
  };
}

function markerRect(marker: Lesson['steps'][number]['marker'], sim: SimView): DOMRect | null {
  if ('ui' in marker) {
    const el = document.querySelector(`[data-tutorial-id="${marker.ui}"]`);
    return el ? el.getBoundingClientRect() : null;
  }
  if ('area' in marker) {
    const w = sim.curr?.widthM ?? 0;
    const h = sim.curr?.heightM ?? 0;
    const sx = (marker.area.x * w - cameraView.cx) * cameraView.zoom + cameraView.width / 2;
    const sy = (marker.area.y * h - cameraView.cy) * cameraView.zoom + cameraView.height / 2;
    const r = marker.area.r * w * cameraView.zoom;
    return new DOMRect(sx - r, sy - r, r * 2, r * 2);
  }
  return null;
}

export function TutorialOverlay({ sim }: { sim: SimView }) {
  // Re-render a few times per second so the marker follows the element or the camera.
  usePoll(100);
  const lesson = LESSONS.find((l) => l.id === activeLessonId.value);
  const i = stepIndex.value;
  if (!lesson || skipped.value || i === null) return null;
  const step = lesson.steps[i];
  const rect = step ? markerRect(step.marker, sim) : null;
  return (
    <>
      {rect && (
        <div
          class="sz-tut-ring"
          aria-hidden="true"
          style={{
            left: `${rect.left - MARKER_PAD_PX}px`,
            top: `${rect.top - MARKER_PAD_PX}px`,
            width: `${rect.width + MARKER_PAD_PX * 2}px`,
            height: `${rect.height + MARKER_PAD_PX * 2}px`,
          }}
        />
      )}
      <div class="sz-panel sz-tut" role="status" aria-live="polite" data-tutorial-id="tutorial-hint">
        <div class="sz-tut__head">
          <span class="sz-hud__label">
            {t('tutorial.trainer')} · {t(lesson.title)}
          </span>
          <span class="sz-mono sz-dim">
            {Math.min(i + 1, lesson.steps.length)}/{lesson.steps.length}
          </span>
        </div>
        <p>{step ? t(step.text) : t('tutorial.finished')}</p>
        <button
          type="button"
          class="sz-btn sz-btn--compact"
          data-tutorial-id="tutorial-skip"
          onClick={() => (skipped.value = true)}
        >
          {t('tutorial.skip')}
        </button>
      </div>
    </>
  );
}
