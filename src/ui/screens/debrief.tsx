// Debrief screen (GDD 10 "Auswertung", 14 screen 8): result, score table, history charts, heatmaps,
// time-lapse with key moments, causes of defeat and the follow-up buttons. All drawing is done here, no chart library.
import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { TICK_RATE } from '../../core/loop';
import type { SimView } from '../../core/types/app';
import type { CauseKey, DebriefData, HistorySeries, MomentKey, ScoreLineKey } from '../../core/types/outcome';
import { DEBRIEF_UI } from '../../data/game';
import type { MessageKey } from '../../data/i18n/de';
import { palette, toCss } from '../../render/palette';
import { clock, numberLocale, t, tryT } from '../i18n';
import { downloadBlob } from '../saves';
import { getSession, restartMission, restartNewSeed, toMainMenu } from '../session';
import { activeLessonId, activeScenario, debriefData, debriefOpen, tutorialMenuOpen } from '../ui-state';
import { paintPreview } from './briefing';

/** Compile-time check: every score line, moment and cause key has a text in de and en. */
type NeededKeys = `score.${ScoreLineKey}` | `moment.${MomentKey}` | `cause.${CauseKey}`;
export const KEYS_COMPLETE: NeededKeys extends MessageKey ? true : never = true;

type MapTab = 'timelapse' | 'infection' | 'losses' | 'collateral';
const MAP_TABS: readonly MapTab[] = ['timelapse', 'infection', 'losses', 'collateral'];
const SERIES: readonly (keyof Omit<HistorySeries, 'sampleTicks'>)[] = [
  'infected',
  'civilians',
  'soldiers',
  'budget',
  'morale',
];

function Chart({ d, name }: { d: DebriefData; name: (typeof SERIES)[number] }) {
  const data = d.history[name];
  const n = data.length;
  const W = DEBRIEF_UI.chartW;
  const H = DEBRIEF_UI.chartH;
  let max = 1;
  for (let i = 0; i < n; i++) max = Math.max(max, data[i] as number);
  const pts: string[] = [];
  for (let i = 0; i < n; i++)
    pts.push(
      `${((i / Math.max(1, n - 1)) * W).toFixed(1)},${(H - ((data[i] as number) / max) * H).toFixed(1)}`,
    );
  const fmt = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 0 });
  const last = n > 0 ? (data[n - 1] as number) : 0;
  const label = `${t(`debrief.chart.${name}`)}: ${t('debrief.chart.max')} ${fmt.format(max)}, ${t('debrief.chart.end')} ${fmt.format(last)}`;
  return (
    <figure class="sz-chart" data-tutorial-id={`chart-${name}`}>
      <figcaption>
        {t(`debrief.chart.${name}`)} <span class="sz-dim sz-mono">{label.split(': ')[1]}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
        <line x1="0" y1={H} x2={W} y2={H} stroke={toCss(palette.ui.panelBorder)} />
        <line x1="0" y1="0" x2="0" y2={H} stroke={toCss(palette.ui.panelBorder)} />
        {n > 1 && (
          <polyline
            points={pts.join(' ')}
            fill="none"
            stroke={toCss(palette.debrief.line)}
            stroke-width="1.5"
            vector-effect="non-scaling-stroke"
          />
        )}
      </svg>
    </figure>
  );
}

function rgbOf(c: number): [number, number, number] {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

/** Map with heatmaps and time-lapse. Base map is painted once, overlays on a second canvas. */
function MapView({ d, sim, tab, frame }: { d: DebriefData; sim: SimView; tab: MapTab; frame: number }) {
  const base = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const S = DEBRIEF_UI.mapPx;
  useEffect(() => {
    const ctx = base.current?.getContext('2d');
    if (ctx && sim.map) ctx.putImageData(paintPreview(sim.map, 'none', S).img, 0, 0);
  }, [sim.map, S]);
  useEffect(() => {
    const canvas = over.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const g = d.grids;
    const cells = g.widthCells * g.heightCells;
    const img = new ImageData(g.widthCells, g.heightCells);
    const put = (i: number, c: number, a: number): void => {
      const [r, gg, b] = rgbOf(c);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = gg;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = Math.min(255, a);
    };
    if (tab === 'timelapse') {
      const f = Math.max(0, Math.min(g.frameCount - 1, frame));
      const off = f * cells * 2;
      for (let i = 0; i < cells; i++) {
        const z = (g.frames[off + i] as number) ?? 0;
        const c = (g.frames[off + cells + i] as number) ?? 0;
        if (z > 0) put(i, palette.debrief.infection, z * DEBRIEF_UI.frameGain);
        else if (c > 0) put(i, palette.civilian.color, c * DEBRIEF_UI.frameGain);
      }
    } else {
      const src = g[tab];
      const color = palette.debrief[tab];
      for (let i = 0; i < cells; i++) {
        const v = src[i] as number;
        if (v >= DEBRIEF_UI.heatMin) put(i, color, v * DEBRIEF_UI.heatMaxAlpha);
      }
    }
    const tmp = document.createElement('canvas');
    tmp.width = g.widthCells;
    tmp.height = g.heightCells;
    tmp.getContext('2d')?.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, S, S);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, S, S);
    // Key moments as ring markers (also in the list below).
    if (tab === 'timelapse' && sim.curr) {
      ctx.strokeStyle = toCss(palette.ui.warn);
      ctx.lineWidth = 2;
      for (const m of d.moments) {
        if (m.tick > frame * g.frameTicks) continue;
        ctx.beginPath();
        ctx.arc((m.x / sim.curr.widthM) * S, (m.y / sim.curr.heightM) * S, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }, [d, tab, frame, S, sim.curr]);
  return (
    <div class="sz-debrief__map" data-tutorial-id="debrief-map">
      <canvas ref={base} width={S} height={S} />
      <canvas ref={over} width={S} height={S} role="img" aria-label={t(`debrief.map.${tab}`)} />
    </div>
  );
}

function Timelapse({ d, frame, setFrame }: { d: DebriefData; frame: number; setFrame: (f: number) => void }) {
  const playing = useSignal(true);
  const g = d.grids;
  const max = Math.max(1, g.frameCount - 1);
  useEffect(() => {
    if (!playing.value) return;
    const step = max / DEBRIEF_UI.timelapseS / 20;
    let f = frame;
    const id = window.setInterval(() => {
      f = Math.min(max, f + step);
      setFrame(f);
      if (f >= max) playing.value = false;
    }, 50);
    return () => window.clearInterval(id);
    // frame is read once per (re)start; scrubbing restarts from the new position.
  }, [playing.value, max]);
  const tickAt = Math.round(frame) * g.frameTicks;
  return (
    <div class="sz-timeline" data-tutorial-id="debrief-timeline">
      <div class="sz-timeline__row">
        <button
          type="button"
          class="sz-btn sz-btn--compact"
          onClick={() => {
            if (frame >= max) setFrame(0);
            playing.value = !playing.value;
          }}
        >
          {playing.value ? t('debrief.pause') : t('debrief.play')}
        </button>
        <input
          type="range"
          min={0}
          max={max}
          step={0.1}
          value={frame}
          aria-label={t('debrief.timeline')}
          onInput={(e) => {
            playing.value = false;
            setFrame(Number(e.currentTarget.value));
          }}
        />
        <span class="sz-mono">{clock(tickAt / TICK_RATE)}</span>
      </div>
      <div class="sz-timeline__marks">
        {d.moments.map((m) => (
          <button
            key={`${m.key}-${m.tick}`}
            type="button"
            class="sz-timeline__mark"
            style={{ left: `${(m.tick / g.frameTicks / max) * 100}%` }}
            title={`${clock(m.tick / TICK_RATE)} ${tryT(`moment.${m.key}`)}`}
            aria-label={`${clock(m.tick / TICK_RATE)} ${tryT(`moment.${m.key}`)}`}
            onClick={() => {
              playing.value = false;
              setFrame(m.tick / g.frameTicks);
            }}
          >
            ◆
          </button>
        ))}
      </div>
    </div>
  );
}

function LessonRetry() {
  return (
    <section class="sz-panel sz-briefing sz-debrief" data-tutorial-id="lesson-retry" role="alertdialog">
      <h2>{t('tutorial.retry.title')}</h2>
      <p>{t('tutorial.retry.text')}</p>
      <div class="sz-briefing__foot">
        <button type="button" class="sz-btn sz-btn--compact sz-btn--primary" onClick={restartMission}>
          {t('debrief.restartSame')}
        </button>
        <button type="button" class="sz-btn sz-btn--compact" onClick={toMainMenu}>
          {t('pause.mainMenu')}
        </button>
      </div>
    </section>
  );
}

export function Debrief({ sim }: { sim: SimView }) {
  const tab = useSignal<MapTab>('timelapse');
  const frame = useSignal(0);
  const d = debriefData.value;
  if (!debriefOpen.value || !d) return null;
  const lesson = activeLessonId.value !== null;
  if (lesson && d.outcome.result === 'defeat') return <LessonRetry />;
  const fmt = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 0 });
  const win = d.outcome.result === 'victory';
  const scen = activeScenario.value;
  const saveReplay = async (): Promise<void> => {
    const r = await getSession()?.replay();
    if (r)
      downloadBlob(
        new Blob([JSON.stringify(r)], { type: 'application/json' }),
        `${scen?.id ?? 'mission'}-${r.seed}.sperrzone-replay.json`,
      );
  };
  return (
    <section
      class="sz-panel sz-briefing sz-debrief"
      data-tutorial-id="debrief"
      aria-labelledby="debrief-title"
    >
      <header class="sz-debrief__head">
        <h2 id="debrief-title" data-result={d.outcome.result}>
          {win ? t('debrief.victory') : t('debrief.defeat')}
        </h2>
        <span class="sz-dim">{t(`outcome.${d.outcome.reason}`)}</span>
        <span class="sz-badge sz-medal" data-tutorial-id="debrief-medal">
          {t('debrief.medal')}: {t(`medal.${d.score.medal}`)}
        </span>
        <span class="sz-mono sz-dim">{clock(d.outcome.tick / TICK_RATE)}</span>
      </header>
      <div class="sz-debrief__body">
        <div class="sz-debrief__left">
          <div class="sz-tabs" role="tablist">
            {MAP_TABS.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                class="sz-btn sz-btn--compact"
                aria-selected={tab.value === m}
                data-tutorial-id={`debrief-tab-${m}`}
                onClick={() => (tab.value = m)}
              >
                {t(`debrief.map.${m}`)}
              </button>
            ))}
          </div>
          <MapView d={d} sim={sim} tab={tab.value} frame={frame.value} />
          {tab.value === 'timelapse' && (
            <Timelapse d={d} frame={frame.value} setFrame={(f) => (frame.value = f)} />
          )}
        </div>
        <div class="sz-debrief__right">
          <table class="sz-score" data-tutorial-id="debrief-score">
            <caption class="sz-sr">{t('debrief.score')}</caption>
            <tbody>
              {d.score.lines.map((l) => (
                <tr key={l.key}>
                  <th scope="row">{tryT(`score.${l.key}`)}</th>
                  <td class="sz-mono">{fmt.format(l.count)}</td>
                  <td class="sz-mono">{fmt.format(l.points)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">{t('debrief.multiplier')}</th>
                <td />
                <td class="sz-mono">×{d.score.multiplier}</td>
              </tr>
              <tr class="sz-score__total">
                <th scope="row">{t('debrief.total')}</th>
                <td />
                <td class="sz-mono">{fmt.format(d.score.total)}</td>
              </tr>
            </tbody>
          </table>
          {!win && d.causes.length > 0 && (
            <div data-tutorial-id="debrief-causes">
              <h3>{t('debrief.causes')}</h3>
              <ul class="sz-causes">
                {d.causes.map((c) => (
                  <li key={`${c.key}-${c.tick}`}>
                    <span class="sz-mono">{clock(c.tick / TICK_RATE)}</span>{' '}
                    {tryT(`cause.${c.key}`, { ...c.params, time: clock(c.tick / TICK_RATE) })}{' '}
                    <button
                      type="button"
                      class="sz-btn sz-btn--compact"
                      onClick={() => {
                        tab.value = 'timelapse';
                        frame.value = c.tick / d.grids.frameTicks;
                      }}
                    >
                      {t('debrief.show')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div class="sz-charts">
            {SERIES.map((s) => (
              <Chart key={s} d={d} name={s} />
            ))}
          </div>
        </div>
      </div>
      <footer class="sz-briefing__foot">
        <button
          type="button"
          class="sz-btn sz-btn--compact"
          data-tutorial-id="debrief-restart"
          onClick={restartMission}
        >
          {t('debrief.restartSame')}
        </button>
        <button
          type="button"
          class="sz-btn sz-btn--compact"
          data-tutorial-id="debrief-restart-new"
          onClick={restartNewSeed}
        >
          {t('debrief.restartNew')}
        </button>
        <button
          type="button"
          class="sz-btn sz-btn--compact"
          data-tutorial-id="debrief-replay"
          onClick={() => void saveReplay()}
        >
          {t('debrief.saveReplay')}
        </button>
        <button
          type="button"
          class="sz-btn sz-btn--compact sz-btn--primary"
          data-tutorial-id="debrief-continue"
          onClick={() => {
            toMainMenu();
            if (lesson) tutorialMenuOpen.value = true;
          }}
        >
          {t('debrief.continue')}
        </button>
      </footer>
    </section>
  );
}
