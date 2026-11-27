// Loading screen (GDD 14 screen 5): progress of the generation steps and a codex tip. Closes when the map is
// generated and drawn and the first mission state arrived.
import { useEffect } from 'preact/hooks';
import type { SimView } from '../../core/types/app';
import { LOADING_MIN_MS, LOADING_TIPS, LOADING_WEIGHTS } from '../../data/hud-economy';
import { mapBake } from '../../render/view-state';
import { usePoll } from '../hud/use-poll';
import { t, tryT } from '../i18n';
import { finishLoading } from '../session';
import { loadingState } from '../ui-state';

const STEPS = ['generate', 'draw', 'start'] as const;

export function LoadingScreen({ sim }: { sim: SimView }) {
  usePoll(100);
  const state = loadingState.value;
  const generated = sim.map !== null;
  const drawn = generated && mapBake.map === sim.map && mapBake.progress >= 1;
  const started = drawn && sim.mission !== null && sim.curr !== null;
  const drawFrac = generated && mapBake.map === sim.map ? mapBake.progress : 0;
  const fracs = [generated ? 1 : 0, drawFrac, started ? 1 : 0];
  const total = fracs.reduce((a, f, i) => a + f * (LOADING_WEIGHTS[i] as number), 0);
  const done = state !== null && started && performance.now() - state.startedAt >= LOADING_MIN_MS;
  useEffect(() => {
    if (done) finishLoading();
  }, [done]);
  if (!state) return null;
  const tip = LOADING_TIPS[Math.floor(state.startedAt) % LOADING_TIPS.length] as string;
  return (
    <section class="sz-loading-screen" role="status" aria-live="polite" data-tutorial-id="loading-screen">
      <div class="sz-panel sz-loading-screen__box">
        <h2>{t('loading.title')}</h2>
        <div
          class="sz-bar"
          role="progressbar"
          aria-valuenow={Math.round(total * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div class="sz-bar__fill" style={{ width: `${total * 100}%` }} />
        </div>
        <ul class="sz-loading-screen__steps">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={
                (fracs[i] as number) < 1 && (i === 0 || (fracs[i - 1] as number) >= 1) ? 'step' : undefined
              }
            >
              <span aria-hidden="true">{(fracs[i] as number) >= 1 ? '✓' : '·'}</span> {t(`loading.step.${s}`)}
            </li>
          ))}
        </ul>
        <p class="sz-dim">
          {t('loading.tip')}: {tryT(`loading.tip.${tip}`)}
        </p>
      </div>
    </section>
  );
}
