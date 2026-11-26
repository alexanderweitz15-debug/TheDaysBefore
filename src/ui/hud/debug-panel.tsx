// Debug panel (development only): DebugSpawn of zombies at the cursor or as a large horde along the map edges.
import { useEffect } from 'preact/hooks';
import type { CommandSink, SimView } from '../../core/types/app';
import { DEBUG_SPAWN } from '../../data/dev/debug-spawn';
import { screenToWorld } from '../../render/view-state';
import { t } from '../i18n';
import { settings } from '../settings/store';
import { debugOpen, spawnArmed } from '../ui-state';

const LOCAL_PLAYER = 0;

/** Debug tools exist in dev builds, or in release builds when the player enables developer tools. */
function debugAvailable(): boolean {
  return import.meta.env.DEV || settings.devTools.value;
}

function spawn(commands: CommandSink, x: number, y: number, count: number): void {
  commands.submit({ playerId: LOCAL_PLAYER, type: 'DebugSpawn', payload: { x, y, count, kind: 'zombie' } });
}

/** Points spread evenly along the inset border of the world. */
function borderPoints(w: number, h: number, n: number, inset: number): Array<[number, number]> {
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  const per = 2 * (iw + ih);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const d = ((i + 0.5) / n) * per;
    if (d < iw) pts.push([inset + d, inset]);
    else if (d < iw + ih) pts.push([w - inset, inset + (d - iw)]);
    else if (d < 2 * iw + ih) pts.push([w - inset - (d - iw - ih), h - inset]);
    else pts.push([inset, h - inset - (d - 2 * iw - ih)]);
  }
  return pts;
}

export function DebugPanel({ sim, commands }: { sim: SimView; commands: CommandSink }) {
  useEffect(() => {
    let lastX = -1;
    let lastY = -1;
    const onMove = (e: PointerEvent): void => {
      if (e.target instanceof HTMLCanvasElement) {
        lastX = e.clientX;
        lastY = e.clientY;
      }
    };
    const onDown = (e: PointerEvent): void => {
      if (!spawnArmed.value || e.button !== 0 || !(e.target instanceof HTMLCanvasElement)) return;
      const p = screenToWorld(e.clientX, e.clientY);
      spawn(commands, p.x, p.y, DEBUG_SPAWN.cursorCount);
      spawnArmed.value = false;
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || !debugAvailable()) return;
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      )
        return;
      if (e.key === 'F10') {
        e.preventDefault();
        debugOpen.value = !debugOpen.value;
      } else if (e.code === 'KeyJ' && debugOpen.value && lastX >= 0 && !e.ctrlKey && !e.metaKey) {
        const p = screenToWorld(lastX, lastY);
        spawn(commands, p.x, p.y, DEBUG_SPAWN.cursorCount);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [commands]);

  if (!debugOpen.value || !debugAvailable()) return null;
  const horde = (): void => {
    const s = sim.curr;
    const w = s?.widthM ?? 0;
    const h = s?.heightM ?? 0;
    if (w <= 0 || h <= 0) return;
    const batches = Math.ceil(DEBUG_SPAWN.hordeCount / DEBUG_SPAWN.hordeBatch);
    for (const [x, y] of borderPoints(w, h, batches, DEBUG_SPAWN.hordeInsetM)) {
      spawn(commands, x, y, DEBUG_SPAWN.hordeBatch);
    }
  };
  return (
    <aside class="sz-panel sz-debug" data-tutorial-id="debug-panel" aria-labelledby="debug-title">
      <h2 id="debug-title">{t('debug.title')}</h2>
      <p class="sz-value">{t('debug.hint')}</p>
      <button
        type="button"
        class="sz-btn"
        title={t('debug.spawnCursor.hint')}
        data-tutorial-id="debug-spawn-cursor"
        onClick={() => (spawnArmed.value = !spawnArmed.value)}
      >
        {spawnArmed.value ? t('debug.spawnCursor.armed') : t('debug.spawnCursor')}
      </button>
      <button type="button" class="sz-btn" data-tutorial-id="debug-spawn-horde" onClick={horde}>
        {t('debug.horde')}
      </button>
      <button type="button" class="sz-btn sz-btn--compact" onClick={() => (debugOpen.value = false)}>
        {t('debug.close')}
      </button>
    </aside>
  );
}
