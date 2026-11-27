// Top bar, center: phase, countdown (only when visible) or the outbreak button for the classic start (GDD 6).
import { useSignal } from '@preact/signals';
import { TICK_RATE } from '../../core/loop';
import type { CommandSink } from '../../core/types/app';
import type { MissionView } from '../../core/types/mission';
import { clock, t } from '../i18n';

const LOCAL_PLAYER = 0;

export function PhaseIndicator({ mission, commands }: { mission: MissionView; commands: CommandSink }) {
  const confirm = useSignal(false);
  const farm = mission.phase === 'farm';
  const cd = mission.countdownTicks;
  const secs = cd === null ? null : cd / TICK_RATE;
  const level = secs !== null && secs < 60 ? 'crit' : secs !== null && secs < 120 ? 'warn' : 'ok';
  return (
    <div class="sz-phase" data-tutorial-id="hud-phase">
      <span class="sz-hud__label">{t('hud.phase')}</span> <strong>{t(`phase.${mission.phase}`)}</strong>
      {farm && secs !== null && (
        <span class={`sz-level--${level}`} title={t('hud.countdown.tip')} data-tutorial-id="hud-countdown">
          {t('hud.countdown')} <span class="sz-mono">{clock(secs)}</span>
        </span>
      )}
      {farm && mission.outbreakPressure > 0 && (
        <span class="sz-level--warn" title={t('hud.pressure.tip')} data-tutorial-id="hud-pressure">
          {t('hud.pressure')} <span class="sz-mono">{Math.round(mission.outbreakPressure * 100)} %</span>
        </span>
      )}
      {farm && mission.classicStart && (
        <button
          type="button"
          class="sz-btn sz-btn--compact sz-btn--danger"
          title={t('hud.triggerOutbreak.tip')}
          data-tutorial-id="hud-trigger-outbreak"
          onClick={() => {
            if (!confirm.value) {
              confirm.value = true;
              window.setTimeout(() => (confirm.value = false), 3000);
              return;
            }
            confirm.value = false;
            commands.submit({ playerId: LOCAL_PLAYER, type: 'TriggerOutbreak', payload: {} });
          }}
        >
          {confirm.value ? t('hud.triggerOutbreak.confirm') : t('hud.triggerOutbreak')}
        </button>
      )}
    </div>
  );
}

export function MoraleIndicator({ morale }: { morale: number }) {
  const level = morale <= 10 ? 'crit' : morale <= 25 ? 'warn' : 'ok';
  return (
    <span class={`sz-morale sz-level--${level}`} title={t('hud.morale.tip')} data-tutorial-id="hud-morale">
      <span class="sz-hud__label">{t('hud.morale')}</span> <span class="sz-mono">{Math.round(morale)}</span>
      {level === 'warn' && <span class="sz-level__mark">!</span>}
      {level === 'crit' && <span class="sz-level__mark">!!</span>}
    </span>
  );
}
