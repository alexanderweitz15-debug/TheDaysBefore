import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { RendererHandle, SimView } from '../../core/types/app';
import { numberLocale, t } from '../i18n';
import { settings } from '../settings/store';

const REFRESH_MS = 250;

interface Sample {
  fps: number;
  ticksPerSecond: number;
  tickMsAvg: number;
  tickMsMax: number;
  agents: number;
  tick: number;
  speed: number;
}

const EMPTY: Sample = { fps: 0, ticksPerSecond: 0, tickMsAvg: 0, tickMsMax: 0, agents: 0, tick: 0, speed: 0 };

export function PerfOverlay({ sim, renderer }: { sim: SimView; renderer: RendererHandle }) {
  const sample = useSignal<Sample>(EMPTY);
  const visible = settings.perfOverlay.value;

  useEffect(() => {
    if (!visible) return;
    const read = (): void => {
      const s = sim.stats;
      sample.value = {
        fps: renderer.fps(),
        ticksPerSecond: s.ticksPerSecond,
        tickMsAvg: s.tickMsAvg,
        tickMsMax: s.tickMsMax,
        agents: s.agentCount,
        tick: s.tick,
        speed: s.speed,
      };
    };
    read();
    const id = window.setInterval(read, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [visible, sim, renderer, sample]);

  if (!visible) return null;
  const loc = numberLocale();
  const int = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
  const d2 = new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const d1 = new Intl.NumberFormat(loc, { maximumFractionDigits: 2 });
  const s = sample.value;
  const rows: Array<[string, string]> = [
    [t('perf.fps'), int.format(s.fps)],
    [t('perf.ticksPerSecond'), int.format(s.ticksPerSecond)],
    [t('perf.tickMsAvg'), d2.format(s.tickMsAvg)],
    [t('perf.tickMsMax'), d2.format(s.tickMsMax)],
    [t('perf.agents'), int.format(s.agents)],
    [t('perf.tick'), int.format(s.tick)],
    [t('perf.speed'), `${d1.format(s.speed)}x`],
  ];
  return (
    <aside class="sz-panel sz-perf sz-mono" data-tutorial-id="perf-overlay" aria-label={t('perf.title')}>
      <dl>
        {rows.map(([label, value]) => (
          <>
            <dt key={`${label}-t`}>{label}</dt>
            <dd key={`${label}-d`}>{value}</dd>
          </>
        ))}
      </dl>
    </aside>
  );
}
