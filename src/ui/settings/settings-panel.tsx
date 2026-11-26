import { t } from '../i18n';
import { settingsOpen } from '../ui-state';
import {
  LANGUAGES,
  type Language,
  resetSettings,
  SETTING_LIMITS,
  type Settings,
  setSetting,
  settings,
} from './store';

interface SliderProps {
  id: 'uiScale' | 'cameraSpeed';
  label: string;
  tip: string;
}

function Slider({ id, label, tip }: SliderProps) {
  const lim = SETTING_LIMITS[id];
  const value = settings[id].value;
  return (
    <div class="sz-field" title={tip}>
      <label for={`set-${id}`}>
        {label} <span class="sz-value sz-mono">{value} %</span>
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
  id: 'perfOverlay' | 'edgeScroll';
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
