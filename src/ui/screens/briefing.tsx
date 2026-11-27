// Briefing and mission setup (GDD 14 screen 4): map preview with patient-zero hint, scenario, pathogen hint by
// difficulty, objectives and the start button with the score multiplier.
import { useEffect, useRef, useState } from 'preact/hooks';
import { requestMap } from '../../core/map-preview';
import { type CityMapData, KEY_SITES, NONE_U8, TERRAIN } from '../../core/types/map';
import type { ScenarioDef } from '../../core/types/mission';
import { PREVIEW_SIZE_PX } from '../../data/hud-economy';
import { PRECISE_HINT_DIFFICULTIES, SCENARIOS, SCORE_MULTIPLIER } from '../../data/scenarios';
import { palette, toCss } from '../../render/palette';
import { t, tryT } from '../i18n';
import { startScenario } from '../session';
import { briefingOpen, briefingScenarioId, menuVisible } from '../ui-state';

const key = (s: ScenarioDef, f: 'name' | 'briefing' | 'goal'): string => tryT(`scenario.${s.textKey}.${f}`);

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** Paints the city map into a small RGBA image plus the patient-zero candidates (normalized). */
export function paintPreview(
  m: CityMapData,
  site: string,
  S: number = PREVIEW_SIZE_PX,
): { img: ImageData; marks: Array<[number, number]> } {
  const img = new ImageData(S, S);
  const px = img.data;
  const roofs = Object.values(palette.map.roofs).map(rgb);
  const terrain: Record<number, [number, number, number]> = {
    [TERRAIN.water]: rgb(palette.map.water),
    [TERRAIN.park]: rgb(palette.map.park),
    [TERRAIN.forest]: rgb(palette.map.forest),
    [TERRAIN.road]: rgb(palette.map.roadStreet),
    [TERRAIN.bridge]: rgb(palette.map.bridge),
    [TERRAIN.rail]: rgb(palette.map.rail),
  };
  const ground = rgb(palette.map.ground);
  const sectorLine = rgb(palette.map.sectorLine);
  const cellAt = (x: number, y: number): number =>
    Math.min(m.heightCells - 1, ((y / S) * m.heightCells) | 0) * m.widthCells +
    Math.min(m.widthCells - 1, ((x / S) * m.widthCells) | 0);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = cellAt(x, y);
      const b = m.buildingId[i] as number;
      let c =
        b >= 0
          ? (roofs[m.buildings.district[b] as number] ?? ground)
          : (terrain[m.terrain[i] as number] ?? ground);
      const edge =
        x + 1 < S &&
        y + 1 < S &&
        (m.sector[cellAt(x + 1, y)] !== m.sector[i] || m.sector[cellAt(x, y + 1)] !== m.sector[i]);
      if (edge && m.sector[i] !== NONE_U8) c = sectorLine;
      const o = (y * S + x) * 4;
      px[o] = c[0];
      px[o + 1] = c[1];
      px[o + 2] = c[2];
      px[o + 3] = 255;
    }
  const marks: Array<[number, number]> = [];
  const siteIndex = (KEY_SITES as readonly string[]).indexOf(site);
  if (siteIndex >= 0)
    for (let b = 0; b < m.buildings.count; b++)
      if (m.buildings.keySite[b] === siteIndex)
        marks.push([
          ((m.buildings.x[b] as number) + (m.buildings.w[b] as number) / 2) / m.widthCells,
          ((m.buildings.y[b] as number) + (m.buildings.h[b] as number) / 2) / m.heightCells,
        ]);
  return { img, marks };
}

function Preview({ scenario }: { scenario: ScenarioDef }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    let alive = true;
    requestMap(scenario.seed, scenario.size)
      .then((map) => {
        const ctx = ref.current?.getContext('2d');
        if (!alive || !ctx) return;
        const { img, marks } = paintPreview(map, scenario.patientZeroSite);
        ctx.putImageData(img, 0, 0);
        // Patient-zero candidates: ring plus exclamation mark, not color alone.
        ctx.strokeStyle = toCss(palette.patientZero.color);
        ctx.fillStyle = toCss(palette.patientZero.color);
        ctx.lineWidth = 2;
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        for (const [x, y] of marks) {
          ctx.beginPath();
          ctx.arc(x * PREVIEW_SIZE_PX, y * PREVIEW_SIZE_PX, 9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillText('!', x * PREVIEW_SIZE_PX, y * PREVIEW_SIZE_PX + 4);
        }
        setReady(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [scenario]);
  return (
    <div class="sz-preview" data-tutorial-id="briefing-preview">
      <canvas ref={ref} width={PREVIEW_SIZE_PX} height={PREVIEW_SIZE_PX} aria-label={t('briefing.preview')} />
      {!ready && (
        <div class="sz-preview__wait" role="status">
          {t('briefing.previewLoading')}
        </div>
      )}
    </div>
  );
}

export function Briefing() {
  if (!briefingOpen.value) return null;
  const scenario = SCENARIOS.find((s) => s.id === briefingScenarioId.value) ?? (SCENARIOS[0] as ScenarioDef);
  const precise = PRECISE_HINT_DIFFICULTIES.includes(scenario.difficulty);
  const visibleCountdown = !scenario.classicStart && precise;
  const flow = scenario.classicStart
    ? t('briefing.flow.classic')
    : visibleCountdown
      ? t('briefing.flow.countdown', { minutes: Math.round(scenario.farmDurationS / 60) })
      : t('briefing.flow.hidden');
  return (
    <section class="sz-panel sz-briefing" aria-label={t('briefing.title')} data-tutorial-id="briefing">
      <header class="sz-briefing__head">
        <h2>{t('briefing.title')}</h2>
        <ul class="sz-briefing__tabs" aria-label={t('briefing.scenarios')}>
          {SCENARIOS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                class="sz-btn sz-btn--compact"
                aria-pressed={s.id === scenario.id}
                data-tutorial-id={`briefing-scenario-${s.id}`}
                onClick={() => (briefingScenarioId.value = s.id)}
              >
                {key(s, 'name')}
              </button>
            </li>
          ))}
        </ul>
      </header>
      <div class="sz-briefing__body">
        <div>
          <Preview scenario={scenario} />
          <p class="sz-dim">
            {t('briefing.patientZero', {
              site: t(
                `site.${precise && scenario.patientZeroSite !== 'random' ? scenario.patientZeroSite : 'random'}` as 'site.random',
              ),
            })}
          </p>
        </div>
        <div class="sz-briefing__text">
          <h3>{key(scenario, 'name')}</h3>
          <p>{key(scenario, 'briefing')}</p>
          <dl class="sz-briefing__facts">
            <dt>{t('briefing.map')}</dt>
            <dd>{t(`size.${scenario.size}`)}</dd>
            <dt>{t('briefing.difficulty')}</dt>
            <dd>{t(`difficulty.${scenario.difficulty}`)}</dd>
            <dt>{t('briefing.flow')}</dt>
            <dd>{flow}</dd>
            <dt>{t('briefing.pathogen')}</dt>
            <dd data-tutorial-id="briefing-pathogen">
              {precise ? t(`pathogen.precise.${scenario.pathogen}`) : t('pathogen.vague')}
            </dd>
          </dl>
          <h4>{t('briefing.goals')}</h4>
          <ul>
            {scenario.victory.kinds.map((k) => (
              <li key={k}>{t(`objective.${k}`)}</li>
            ))}
          </ul>
          <p class="sz-dim">{t(scenario.victory.all ? 'objective.all' : 'objective.any')}</p>
          <p>{key(scenario, 'goal')}</p>
        </div>
      </div>
      <footer class="sz-briefing__foot">
        <button
          type="button"
          class="sz-btn sz-btn--compact"
          data-tutorial-id="briefing-back"
          onClick={() => {
            briefingOpen.value = false;
            menuVisible.value = true;
          }}
        >
          {t('briefing.back')}
        </button>
        <button
          type="button"
          class="sz-btn sz-btn--compact sz-btn--primary"
          data-tutorial-id="briefing-start"
          onClick={() => startScenario(scenario)}
        >
          {t('briefing.start')} ({t('briefing.multiplier', { value: SCORE_MULTIPLIER[scenario.difficulty] })})
        </button>
      </footer>
    </section>
  );
}
