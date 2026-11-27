// Population window (GDD 6, 14): sliders for workers, conscripts and helpers (free = remainder), morale influences.
import { useEffect, useState } from 'preact/hooks';
import type { CommandSink } from '../../core/types/app';
import type { MissionView } from '../../core/types/mission';
import { MORALE_MAX, POP_SLIDER_STEP } from '../../data/hud-economy';
import { numberLocale, t, tryT } from '../i18n';

const LOCAL_PLAYER = 0;
const ROLES = ['workers', 'conscripts', 'helpers'] as const;
type Role = (typeof ROLES)[number];
type Assign = Record<Role, number>;

function toPct(m: MissionView): Assign {
  const total = Math.max(1, m.population.total);
  return {
    workers: Math.round((m.population.workers / total) * 100),
    conscripts: Math.round((m.population.conscripts / total) * 100),
    helpers: Math.round((m.population.helpers / total) * 100),
  };
}

export function PopulationWindow({ mission, commands }: { mission: MissionView; commands: CommandSink }) {
  const fmt = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 0 });
  const signed = new Intl.NumberFormat(numberLocale(), {
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  });
  const [draft, setDraft] = useState<Assign | null>(null);
  const shown = draft ?? toPct(mission);
  const used = shown.workers + shown.conscripts + shown.helpers;
  const free = Math.max(0, 100 - used);
  useEffect(
    () => setDraft(null),
    [mission.population.workers, mission.population.conscripts, mission.population.helpers],
  );
  const set = (role: Role, value: number): void => {
    const others = used - shown[role];
    setDraft({ ...shown, [role]: Math.max(0, Math.min(100 - others, value)) });
  };
  const commit = (): void => {
    if (!draft) return;
    commands.submit({ playerId: LOCAL_PLAYER, type: 'AssignWorkers', payload: { ...draft } });
    window.setTimeout(() => setDraft(null), 1500);
  };
  const people = (pct: number): string =>
    t('pop.people', { n: fmt.format((pct / 100) * mission.population.total) });
  const morale = mission.morale;
  const level = morale <= 10 ? 'crit' : morale <= 25 ? 'warn' : 'ok';
  return (
    <div data-tutorial-id="win-population">
      <p>{t('pop.total', { n: fmt.format(mission.population.total) })}</p>
      <section class="sz-win__section">
        {ROLES.map((role) => (
          <label key={role} class="sz-slider" title={t(`pop.${role}.tip`)} data-tutorial-id={`pop-${role}`}>
            <span class="sz-slider__head">
              <span>{t(`pop.${role}`)}</span>
              <span class="sz-mono">
                {shown[role]} % · {people(shown[role])}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={POP_SLIDER_STEP}
              value={shown[role]}
              onInput={(e) => set(role, Number(e.currentTarget.value))}
              onChange={commit}
            />
          </label>
        ))}
        <div class="sz-slider" title={t('pop.free.tip')}>
          <span class="sz-slider__head">
            <span>{t('pop.free')}</span>
            <span class="sz-mono">
              {free} % · {people(free)}
            </span>
          </span>
        </div>
      </section>
      <section class="sz-win__section" data-tutorial-id="pop-morale">
        <h3>
          {t('hud.morale')}{' '}
          <span class={`sz-mono sz-level--${level}`}>
            {Math.round(morale)}/{MORALE_MAX}
          </span>
        </h3>
        <div
          class="sz-bar"
          role="progressbar"
          aria-valuenow={Math.round(morale)}
          aria-valuemin={0}
          aria-valuemax={MORALE_MAX}
        >
          <div class={`sz-bar__fill sz-level--${level}`} style={{ width: `${morale}%` }} />
        </div>
        <p class="sz-dim">
          {t('pop.moraleLow')} {t('pop.moraleHigh')}
        </p>
        <h4>{t('pop.factors')}</h4>
        {mission.moraleFactors.length === 0 && <p class="sz-dim">{t('pop.noFactors')}</p>}
        <ul class="sz-win__list">
          {mission.moraleFactors.map((f) => (
            <li key={f.key} class="sz-factor">
              <span>{tryT(`morale.${f.key}`)}</span>
              <span class={`sz-mono ${f.value < 0 ? 'sz-level--crit' : ''}`}>
                {f.value < 0 ? '▼ ' : f.value > 0 ? '▲ ' : ''}
                {signed.format(f.value)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
