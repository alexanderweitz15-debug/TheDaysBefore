// Context panel for a picked structure (GDD 14): values and actions. Squads are never selected (orders only).

import type { CommandSink, SimView } from '../../core/types/app';
import { selectedStructure } from '../../render/view-state';
import { numberLocale, t } from '../i18n';
import { requestDemolish } from '../tools/game-keys';
import { demolishConfirm } from '../ui-state';
import { usePoll } from './use-poll';

const LOCAL_PLAYER = 0;

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

  return null;
}
