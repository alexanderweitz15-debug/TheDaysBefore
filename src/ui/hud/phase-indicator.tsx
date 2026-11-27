// Top bar, center: phase and a dominant countdown (farm) or mission clock (fight); morale as a bar (GDD 6, 14).
import { useSignal } from '@preact/signals';
import { TICK_RATE } from '../../core/loop';
import type { CommandSink, SimView } from '../../core/types/app';
import type { MissionView } from '../../core/types/mission';
import { COUNTDOWN_CRIT_S, COUNTDOWN_WARN_S } from '../../data/hud';
import { clock, t } from '../i18n';

const LOCAL_PLAYER = 0;

export function PhaseIndicator({
  mission,
  commands,
  sim,
}: {
  mission: MissionView;
  commands: CommandSink;
  sim: SimView;
}) {
  const confirm = useSignal(false);
  const farm = mission.phase === 'farm';
  const cd = mission.countdownTicks;
  const secs = cd === null ? null : cd / TICK_RATE;
  const level =
    secs !== null && secs < COUNTDOWN_CRIT_S
      ? 'crit'
      : secs !== null && secs < COUNTDOWN_WARN_S
        ? 'warn'
        : 'ok';
  const showCountdown = farm && secs !== null;
  return (
    <div class="sz-phase" data-tutorial-id="hud-phase">
      <div class="sz-phase__name">
        <span class="sz-hud__label">{t('hud.phase')}</span>
        <strong>{t(`phase.${mission.phase}`)}</strong>
      </div>
      {showCountdown ? (
        <div
          class={`sz-phase__clock sz-level--${level}`}
          title={t('hud.countdown.tip')}
          data-tutorial-id="hud-countdown"
        >
          <span class="sz-phase__clock-label">{t('hud.countdown')}</span>
          <span class="sz-mono sz-phase__clock-value">{clock(secs)}</span>
        </div>
      ) : (
        !farm && (
          <div class="sz-phase__clock" title={t('hud.elapsed.tip')}>
            <span class="sz-phase__clock-label">{t('hud.elapsed')}</span>
            <span class="sz-mono sz-phase__clock-value">{clock(sim.stats.tick / TICK_RATE)}</span>
          </div>
        )
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
  const v = Math.max(0, Math.min(100, Math.round(morale)));
  return (
    <div class={`sz-morale sz-level--${level}`} title={t('hud.morale.tip')} data-tutorial-id="hud-morale">
      <span class="sz-hud__label">
        {t('hud.morale')}
        <span class="sz-mono sz-morale__value">{v}</span>
      </span>
      <div class="sz-bar sz-morale__bar" aria-hidden="true">
        <div class={`sz-bar__fill sz-level--${level}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
