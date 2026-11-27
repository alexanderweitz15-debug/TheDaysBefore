// Top bar (GDD 14): resources left, phase and morale center, speed and menu right.
import type { CommandSink, SimView } from '../../core/types/app';
import { HUD_SPEEDS } from '../../data/hud';
import { numberLocale, t } from '../i18n';
import { menuVisible } from '../ui-state';
import { MoraleIndicator, PhaseIndicator } from './phase-indicator';
import { ResourceBar } from './resource-bar';
import { usePoll } from './use-poll';

const LOCAL_PLAYER = 0;

export function TopBar({ sim, commands }: { sim: SimView; commands: CommandSink }) {
  usePoll();
  const s = sim.stats;
  const m = sim.mission;
  const fmt = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 0 });
  return (
    <header class="sz-panel sz-topbar" data-tutorial-id="top-bar">
      <div class="sz-topbar__left">
        {m ? (
          <ResourceBar resources={m.resources} />
        ) : (
          <span class="sz-mono sz-res__value" data-tutorial-id="hud-budget">
            {t('hud.budget')} {fmt.format(s.counters.budget)}
          </span>
        )}
      </div>
      <div class="sz-topbar__center">
        {m && <PhaseIndicator mission={m} commands={commands} sim={sim} />}
        {m && <MoraleIndicator morale={m.morale} />}
      </div>
      <div class="sz-topbar__right">
        <fieldset class="sz-topbar__speed" title={t('hud.speed.tip')}>
          <legend class="sz-sr">{t('hud.speed')}</legend>
          {HUD_SPEEDS.map((v) => (
            <button
              key={v}
              type="button"
              class="sz-btn sz-btn--compact"
              aria-pressed={s.speed === v}
              data-tutorial-id={`speed-${v}`}
              onClick={() =>
                commands.submit({ playerId: LOCAL_PLAYER, type: 'SetGameSpeed', payload: { speed: v } })
              }
            >
              {v === 0 ? <PauseGlyph label={t('hud.speed.0')} /> : t(`hud.speed.${v}` as 'hud.speed.1')}
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          class="sz-btn sz-btn--compact"
          data-tutorial-id="hud-menu"
          onClick={() => (menuVisible.value = !menuVisible.value)}
        >
          {t('hud.menu')}
        </button>
      </div>
    </header>
  );
}

function PauseGlyph({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" role="img" aria-label={label}>
      <title>{label}</title>
      <path d="M3 2v8M9 2v8" stroke="currentColor" stroke-width="2.2" fill="none" />
    </svg>
  );
}
