// Top bar (GDD 14): budget, rescued/dead/zombies, collateral, speed buttons, menu.
import type { CommandSink, SimView } from '../../core/types/app';
import { HUD_SPEEDS } from '../../data/hud';
import { numberLocale, t } from '../i18n';
import { menuVisible } from '../ui-state';
import { usePoll } from './use-poll';

const LOCAL_PLAYER = 0;

export function TopBar({ sim, commands }: { sim: SimView; commands: CommandSink }) {
  usePoll();
  const s = sim.stats;
  const c = s.counters;
  const fmt = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 0 });
  const items: Array<[string, number, string]> = [
    [t('hud.budget'), c.budget, 'budget'],
    [t('hud.rescued'), c.sheltered, 'rescued'],
    [t('hud.dead'), c.civiliansDead, 'dead'],
    [t('hud.zombies'), s.zombies, 'zombies'],
    [t('hud.collateral'), c.collateralKills, 'collateral'],
    [t('hud.soldiersLost'), c.soldiersLost, 'losses'],
  ];
  return (
    <header class="sz-panel sz-topbar" data-tutorial-id="top-bar">
      <ul class="sz-topbar__stats">
        {items.map(([label, value, id]) => (
          <li key={id} data-tutorial-id={`hud-${id}`}>
            <span class="sz-hud__label">{label}</span> <span class="sz-mono">{fmt.format(value)}</span>
          </li>
        ))}
      </ul>
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
            {t(`hud.speed.${v}` as 'hud.speed.1')}
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
    </header>
  );
}
