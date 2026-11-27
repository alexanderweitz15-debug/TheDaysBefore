// Decrees window (GDD 6, 14): cards with upside and downside, active decrees on top.
import type { CommandSink } from '../../core/types/app';
import type { MissionView } from '../../core/types/mission';
import { DECREES } from '../../data/economy/economy';
import { t, tryT } from '../i18n';

const LOCAL_PLAYER = 0;

export function DecreesWindow({ mission, commands }: { mission: MissionView; commands: CommandSink }) {
  const active = new Set(mission.activeDecrees);
  const ids = Object.keys(DECREES);
  const ordered = [...ids.filter((i) => active.has(i)), ...ids.filter((i) => !active.has(i))];
  return (
    <div data-tutorial-id="win-decrees">
      <h3>{t('decree.activeList')}</h3>
      {active.size === 0 && <p class="sz-dim">{t('decree.none')}</p>}
      <ul class="sz-win__list">
        {ordered.map((id) => {
          const on = active.has(id);
          return (
            <li key={id} class={`sz-card${on ? ' sz-card--active' : ''}`} data-tutorial-id={`decree-${id}`}>
              <div class="sz-card__head">
                <strong>{tryT(`decree.${id}.name`)}</strong>
                {on && <span class="sz-badge">{t('decree.active')}</span>}
              </div>
              <div>
                <span class="sz-dim">{t('decree.pro')}: </span>
                {tryT(`decree.${id}.pro`)}
              </div>
              <div>
                <span class="sz-dim">{t('decree.con')}: </span>
                {tryT(`decree.${id}.con`)}
              </div>
              <button
                type="button"
                class="sz-btn sz-btn--compact"
                onClick={() =>
                  commands.submit({
                    playerId: LOCAL_PLAYER,
                    type: 'SetDecree',
                    payload: { decree: id, active: !on },
                  })
                }
              >
                {on ? t('decree.revoke') : t('decree.activate')}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
