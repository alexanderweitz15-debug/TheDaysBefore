// Economy window (GDD 14): production per building, bottlenecks in red, repurposing of the picked map building.
import type { EconomyBuildingKind, ResourceId } from '../../core/commands';
import type { CommandSink, SimView } from '../../core/types/app';
import { DISTRICTS } from '../../core/types/map';
import type { EconomyBuildingView, MissionView } from '../../core/types/mission';
import { ECONOMY_BUILDINGS } from '../../data/economy/economy';
import { RESOURCE_ORDER } from '../../data/hud-economy';
import { jumpCamera, repurposeTarget } from '../../render/view-state';
import { numberLocale, t, tryT } from '../i18n';

const LOCAL_PLAYER = 0;
const KINDS = (Object.keys(ECONOMY_BUILDINGS) as EconomyBuildingKind[]).filter((k) => k !== 'hq');

function costText(cost: Partial<Record<ResourceId, number>>, fmt: Intl.NumberFormat): string {
  return RESOURCE_ORDER.filter((r) => (cost[r] ?? 0) > 0)
    .map((r) => `${fmt.format(cost[r] as number)} ${t(`res.${r}`)}`)
    .join(', ');
}

function outputText(b: EconomyBuildingView, fmt: Intl.NumberFormat): string {
  const parts = RESOURCE_ORDER.filter((r) => (b.outputPerMin[r] ?? 0) !== 0).map(
    (r) => `${fmt.format(b.outputPerMin[r] as number)} ${t(`res.${r}`)}`,
  );
  return parts.length > 0 ? t('hud.perMin', { value: parts.join(', ') }) : t('econ.idle');
}

function Target({ sim, mission, commands }: { sim: SimView; mission: MissionView; commands: CommandSink }) {
  const fmt = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 0 });
  const id = repurposeTarget.value;
  const map = sim.map;
  if (id === null || !map || id >= map.buildings.count) return <p class="sz-dim">{t('econ.hint')}</p>;
  const district = DISTRICTS[map.buildings.district[id] as number] ?? 'residential';
  const taken = mission.buildings.some((b) => b.buildingId === id);
  const kinds = KINDS.filter((k) => ECONOMY_BUILDINGS[k].fromDistricts.includes(district));
  return (
    <section class="sz-win__section" data-tutorial-id="econ-target">
      <h3>
        {t('econ.target')}{' '}
        <button
          type="button"
          class="sz-btn sz-btn--compact"
          onClick={() => (repurposeTarget.value = null)}
          title={t('econ.clearTarget')}
        >
          x
        </button>
      </h3>
      <p>{t('econ.targetDistrict', { district: t(`district.${district}`) })}</p>
      {taken && <p class="sz-dim">{t('econ.occupied')}</p>}
      {!taken && kinds.length === 0 && <p class="sz-dim">{t('econ.noKinds')}</p>}
      {!taken && (
        <ul class="sz-win__list">
          {kinds.map((k) => {
            const spec = ECONOMY_BUILDINGS[k];
            const lacking = RESOURCE_ORDER.find(
              (r) => (spec.repurposeCost[r] ?? 0) > (mission.resources[r]?.amount ?? 0),
            );
            return (
              <li key={k} class="sz-win__item">
                <div>
                  <strong>{t(`econbuilding.${k}`)}</strong>
                  <div class="sz-dim">
                    {t('econ.cost')}: {costText(spec.repurposeCost, fmt)},{' '}
                    {t('econ.time', { s: spec.repurposeS })}
                  </div>
                  <div class="sz-dim">{t('econ.needs', { workers: spec.workers, power: spec.power })}</div>
                  {lacking && (
                    <div class="sz-level--crit">{t('econ.lacking', { resource: t(`res.${lacking}`) })}</div>
                  )}
                </div>
                <button
                  type="button"
                  class="sz-btn sz-btn--compact"
                  aria-disabled={lacking ? 'true' : undefined}
                  data-tutorial-id={`econ-repurpose-${k}`}
                  onClick={() => {
                    if (lacking) return;
                    commands.submit({
                      playerId: LOCAL_PLAYER,
                      type: 'RepurposeBuilding',
                      payload: { buildingId: id, kind: k },
                    });
                    repurposeTarget.value = null;
                  }}
                >
                  {t('econ.repurpose')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function EconomyWindow({
  sim,
  mission,
  commands,
}: {
  sim: SimView;
  mission: MissionView;
  commands: CommandSink;
}) {
  const fmt = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 0 });
  const show = (b: EconomyBuildingView): void => {
    const m = sim.map;
    if (!m) return;
    const i = b.buildingId;
    jumpCamera(
      ((m.buildings.x[i] as number) + (m.buildings.w[i] as number) / 2) * m.cellSizeM,
      ((m.buildings.y[i] as number) + (m.buildings.h[i] as number) / 2) * m.cellSizeM,
    );
  };
  return (
    <div data-tutorial-id="win-economy">
      <Target sim={sim} mission={mission} commands={commands} />
      <section class="sz-win__section">
        <h3>{t('econ.list')}</h3>
        {mission.buildings.length === 0 && <p class="sz-dim">{t('econ.empty')}</p>}
        <ul class="sz-win__list">
          {mission.buildings.map((b) => (
            <li key={b.id} class={`sz-win__item${b.bottleneck ? ' sz-win__item--bad' : ''}`}>
              <div>
                <strong>{t(`econbuilding.${b.kind}`)}</strong>
                {b.progress < 1 ? (
                  <div class="sz-dim">{t('econ.progress', { pct: Math.round(b.progress * 100) })}</div>
                ) : (
                  <div class="sz-dim">{outputText(b, fmt)}</div>
                )}
                <div class={b.workers < b.workersNeeded ? 'sz-level--warn' : 'sz-dim'}>
                  {t('econ.workers', { have: fmt.format(b.workers), need: fmt.format(b.workersNeeded) })}
                  {' · '}
                  {b.powered ? t('econ.powered') : t('econ.unpowered')}
                </div>
                {b.bottleneck && (
                  <div class="sz-level--crit">
                    <span class="sz-level__mark">!!</span> {tryT(`bottleneck.${b.bottleneck}`)}
                  </div>
                )}
              </div>
              <button type="button" class="sz-btn sz-btn--compact" onClick={() => show(b)}>
                {t('econ.jump')}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
