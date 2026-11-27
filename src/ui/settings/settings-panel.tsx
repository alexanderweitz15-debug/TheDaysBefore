import { numberLocale, t } from '../i18n';
import { settingsOpen } from '../ui-state';
import {
  LANGUAGES,
  type Language,
  PARTICLE_LEVELS,
  type ParticleLevel,
  resetSettings,
  SETTING_LIMITS,
  type Settings,
  setSetting,
  settings,
  UNIT_BAR_MODES,
  type UnitBarMode,
  VIOLENCE_LEVELS,
  type Violence,
} from './store';

interface SliderProps {
  id: 'uiScale' | 'cameraSpeed' | 'spriteLimit' | 'corpseLimit';
  unit?: string;
  label: string;
  tip: string;
}

function Slider({ id, label, tip, unit = ' %' }: SliderProps) {
  const lim = SETTING_LIMITS[id];
  const value = settings[id].value;
  return (
    <div class="sz-field" title={tip}>
      <label for={`set-${id}`}>
        {label}{' '}
        <span class="sz-value sz-mono">
          {value.toLocaleString(numberLocale())}
          {unit}
        </span>
      </label>
      <input
        id={`set-${id}`}
        type="range"
        min={lim.min}
        max={lim.max}
        step={lim.step}
        value={value}
        data-tutorial-id={`settings-${id}`}
        onInput={(e) => setSetting(id, Number(e.currentTarget.value))}
      />
    </div>
  );
}

interface CheckProps {
  id:
    | 'perfOverlay'
    | 'edgeScroll'
    | 'buildings3d'
    | 'devTools'
    | 'patternMode'
    | 'reducedMotion'
    | 'confirmRemoval'
    | 'screenShake'
    | 'noFlashes';
  label: string;
  tip: string;
}

function Check({ id, label, tip }: CheckProps) {
  const key: keyof Settings = id;
  return (
    <div class="sz-field sz-field--row" title={tip}>
      <label for={`set-${id}`}>{label}</label>
      <input
        id={`set-${id}`}
        type="checkbox"
        checked={settings[key].value as boolean}
        data-tutorial-id={`settings-${id}`}
        onChange={(e) => setSetting(id, e.currentTarget.checked)}
      />
    </div>
  );
}

export function SettingsPanel() {
  return (
    <section class="sz-panel sz-settings" data-tutorial-id="settings" aria-labelledby="settings-title">
      <header>
        <h2 id="settings-title">{t('settings.title')}</h2>
        <button type="button" class="sz-btn sz-btn--compact" onClick={() => (settingsOpen.value = false)}>
          {t('settings.close')}
        </button>
      </header>
      <div class="sz-field" title={t('settings.language.tip')}>
        <label for="set-language">{t('settings.language')}</label>
        <select
          id="set-language"
          data-tutorial-id="settings-language"
          value={settings.language.value}
          onChange={(e) => setSetting('language', e.currentTarget.value as Language)}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {t(`settings.language.${l}`)}
            </option>
          ))}
        </select>
      </div>
      <Slider id="uiScale" label={t('settings.uiScale')} tip={t('settings.uiScale.tip')} />
      <Check id="perfOverlay" label={t('settings.perfOverlay')} tip={t('settings.perfOverlay.tip')} />
      <Check id="edgeScroll" label={t('settings.edgeScroll')} tip={t('settings.edgeScroll.tip')} />
      <Slider id="cameraSpeed" label={t('settings.cameraSpeed')} tip={t('settings.cameraSpeed.tip')} />
      <Check id="buildings3d" label={t('settings.buildings3d')} tip={t('settings.buildings3d.tip')} />
      <Slider
        id="spriteLimit"
        unit=""
        label={t('settings.spriteLimit')}
        tip={t('settings.spriteLimit.tip')}
      />
      <Slider
        id="corpseLimit"
        unit=""
        label={t('settings.corpseLimit')}
        tip={t('settings.corpseLimit.tip')}
      />
      <div class="sz-field" title={t('settings.violence.tip')}>
        <label for="set-violence">{t('settings.violence')}</label>
        <select
          id="set-violence"
          data-tutorial-id="settings-violence"
          value={settings.violence.value}
          onChange={(e) => setSetting('violence', e.currentTarget.value as Violence)}
        >
          {VIOLENCE_LEVELS.map((v) => (
            <option key={v} value={v}>
              {t(`settings.violence.${v}`)}
            </option>
          ))}
        </select>
      </div>
      <div class="sz-field" title={t('settings.unitBars.tip')}>
        <label for="set-unitBars">{t('settings.unitBars')}</label>
        <select
          id="set-unitBars"
          data-tutorial-id="settings-unitBars"
          value={settings.unitBars.value}
          onChange={(e) => setSetting('unitBars', e.currentTarget.value as UnitBarMode)}
        >
          {UNIT_BAR_MODES.map((v) => (
            <option key={v} value={v}>
              {t(`settings.unitBars.${v}`)}
            </option>
          ))}
        </select>
      </div>
      <div class="sz-field" title={t('settings.particles.tip')}>
        <label for="set-particles">{t('settings.particles')}</label>
        <select
          id="set-particles"
          data-tutorial-id="settings-particles"
          value={settings.particles.value}
          onChange={(e) => setSetting('particles', e.currentTarget.value as ParticleLevel)}
        >
          {PARTICLE_LEVELS.map((v) => (
            <option key={v} value={v}>
              {t(`settings.particles.${v}`)}
            </option>
          ))}
        </select>
      </div>
      <Check id="screenShake" label={t('settings.screenShake')} tip={t('settings.screenShake.tip')} />
      <Check id="noFlashes" label={t('settings.noFlashes')} tip={t('settings.noFlashes.tip')} />
      <Check id="patternMode" label={t('settings.patternMode')} tip={t('settings.patternMode.tip')} />
      <Check id="reducedMotion" label={t('settings.reducedMotion')} tip={t('settings.reducedMotion.tip')} />
      <Check
        id="confirmRemoval"
        label={t('settings.confirmRemoval')}
        tip={t('settings.confirmRemoval.tip')}
      />
      <Check id="devTools" label={t('settings.devTools')} tip={t('settings.devTools.tip')} />
      <button
        type="button"
        class="sz-btn sz-btn--compact"
        data-tutorial-id="settings-reset"
        onClick={resetSettings}
      >
        {t('settings.reset')}
      </button>
    </section>
  );
}
