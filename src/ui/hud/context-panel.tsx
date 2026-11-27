// Context panel for the selection (GDD 14): squad values, stance and fire control; structure values and actions.

import type { FireMode, Stance } from '../../core/commands';
import type { CommandSink, SimView } from '../../core/types/app';
import type { UnitView } from '../../core/types/combat';
import { UNITS } from '../../data/units/present';
import { activeTool, selectedStructure, selectedUnits } from '../../render/view-state';
import { numberLocale, t } from '../i18n';
import { areaFireUnits, armAttackArea } from '../tools/attack-tool';
import { requestDemolish } from '../tools/game-keys';
import { demolishConfirm } from '../ui-state';
import { usePoll } from './use-poll';

const LOCAL_PLAYER = 0;
const STANCES: readonly Stance[] = ['hold', 'holdUntilLosses', 'aggressive', 'retreat'];
const FIRE_MODES: readonly FireMode[] = ['free', 'onCommand'];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd class="sz-mono">{value}</dd>
    </>
  );
}

export function ContextPanel({ sim, commands }: { sim: SimView; commands: CommandSink }) {
  usePoll();
  const pct = new Intl.NumberFormat(numberLocale(), { style: 'percent', maximumFractionDigits: 0 });
  const ids = selectedUnits.value;
  const structId = selectedStructure.value;

  if (structId !== null) {
    const st = sim.structures.find((s) => s.id === structId);
    if (!st) return null;
    const confirming = demolishConfirm.value === st.id;
    return (
      <aside class="sz-panel sz-context" data-tutorial-id="context-panel" aria-label={t('ctx.panel')}>
        <h2>{t(`structure.${st.kind}`)}</h2>
        <dl>
          <Row label={t('ctx.hp')} value={`${Math.round(st.hp)} / ${Math.round(st.maxHp)}`} />
          <Row label={t('ctx.state')} value={t(`structure.state.${st.state}`)} />
          {st.state === 'building' && <Row label={t('ctx.progress')} value={pct.format(st.progress)} />}
          {st.kind === 'charge' && st.flag && <Row label={t('ctx.armed')} value="1" />}
        </dl>
        <div class="sz-context__actions">
          {st.kind === 'charge' && st.state === 'done' && (
            <button
              type="button"
              class="sz-btn sz-btn--compact"
              data-tutorial-id="ctx-detonate"
              onClick={() =>
                commands.submit({ playerId: LOCAL_PLAYER, type: 'DetonateCharge', payload: { id: st.id } })
              }
            >
              {t('ctx.detonate')}
            </button>
          )}
          <button
            type="button"
            class="sz-btn sz-btn--compact"
            data-tutorial-id="ctx-demolish"
            onClick={() => requestDemolish(commands, st.id)}
          >
            {confirming ? t('ctx.demolish.confirm') : t('ctx.demolish')}
          </button>
        </div>
      </aside>
    );
  }

  if (ids.length === 0) return null;
  const set = new Set(ids);
  const views: UnitView[] = sim.units.filter((u) => set.has(u.id));
  if (views.length === 0) return null;
  const first = views[0] as UnitView;
  const avg = (f: (u: UnitView) => number): number => views.reduce((a, u) => a + f(u), 0) / views.length;
  const send = (type: 'SetStance' | 'SetFireMode', payload: object): void =>
    commands.submit({
      playerId: LOCAL_PLAYER,
      type,
      payload: { unitIds: views.map((u) => u.id), ...payload },
    } as Parameters<CommandSink['submit']>[0]);
  const single = views.length === 1;
  const members = views.reduce((a, u) => a + u.members, 0);
  return (
    <aside class="sz-panel sz-context" data-tutorial-id="context-panel" aria-label={t('ctx.panel')}>
      <h2>{single ? t(`unit.${first.type}`) : t('ctx.squads', { count: views.length })}</h2>
      <dl>
        <Row
          label={t('ctx.members')}
          value={single ? `${first.members} / ${UNITS[first.type].size}` : String(members)}
        />
        <Row label={t('ctx.hp')} value={pct.format(avg((u) => u.hp))} />
        <Row label={t('ctx.ammo')} value={pct.format(avg((u) => u.ammo))} />
        <Row label={t('ctx.morale')} value={pct.format(avg((u) => u.morale))} />
        {single && <Row label={t('ctx.rank')} value={t(`rank.${first.rank}`)} />}
      </dl>
      <fieldset class="sz-context__group">
        <legend class="sz-hud__label">{t('ctx.stance')}</legend>
        {STANCES.map((s) => (
          <button
            key={s}
            type="button"
            class="sz-btn sz-btn--compact"
            aria-pressed={views.every((u) => u.stance === s)}
            data-tutorial-id={`ctx-stance-${s}`}
            onClick={() => send('SetStance', { stance: s })}
          >
            {t(`stance.${s}`)}
          </button>
        ))}
      </fieldset>
      {areaFireUnits(sim).length > 0 && (
        <button
          type="button"
          class="sz-btn sz-btn--compact"
          aria-pressed={activeTool.value === 'attackArea'}
          data-tutorial-id="ctx-attack-area"
          onClick={() => armAttackArea(sim)}
        >
          {t('ctx.attackArea')}
        </button>
      )}
      <fieldset class="sz-context__group">
        <legend class="sz-hud__label">{t('ctx.fire')}</legend>
        {FIRE_MODES.map((m) => (
          <button
            key={m}
            type="button"
            class="sz-btn sz-btn--compact"
            aria-pressed={views.every((u) => u.fireMode === m)}
            data-tutorial-id={`ctx-fire-${m}`}
            onClick={() => send('SetFireMode', { mode: m })}
          >
            {t(`fire.${m}`)}
          </button>
        ))}
      </fieldset>
    </aside>
  );
}
