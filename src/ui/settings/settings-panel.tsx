import type { GameSpeed } from '../../core/commands';
import { AUTOSAVE_OPTIONS, COST_LEVEL, DEFAULT_SPEEDS, FPS_LIMITS, GRAPHICS_PRESETS } from '../../data/game';
import { numberLocale, t } from '../i18n';
import { settingsOpen, settingsTab } from '../ui-state';
import { KeyBindings } from './key-bindings';
import {
  applyGraphicsPreset,
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
  id:
    | 'uiScale'
    | 'cameraSpeed'
    | 'spriteLimit'
    | 'corpseLimit'
    | 'renderScale'
    | 'volMaster'
    | 'volEffects'
    | 'volAmbient'
    | 'volUi'
    | 'volHorde';
  unit?: string;
  label: string;
  tip: string;
}

const LIMIT_OF = {
  uiScale: SETTING_LIMITS.uiScale,
  cameraSpeed: SETTING_LIMITS.cameraSpeed,
  spriteLimit: SETTING_LIMITS.spriteLimit,
  corpseLimit: SETTING_LIMITS.corpseLimit,
  renderScale: SETTING_LIMITS.renderScale,
  volMaster: SETTING_LIMITS.volume,
  volEffects: SETTING_LIMITS.volume,
  volAmbient: SETTING_LIMITS.volume,
  volUi: SETTING_LIMITS.volume,
  volHorde: SETTING_LIMITS.volume,
} as const;

/** Performance cost badge (GDD 13: low, medium, high) with text, not color alone. */
function Cost({ id }: { id: keyof typeof COST_LEVEL }) {
  return (
    <span class="sz-badge sz-cost" title={t('settings.cost.tip')}>
      {t(`settings.cost.${COST_LEVEL[id]}`)}
    </span>
  );
}

function Slider({ id, label, tip, unit = ' %' }: SliderProps) {
  const lim = LIMIT_OF[id];
  const value = settings[id].value;
  return (
    <div class="sz-field" title={tip}>
      <label for={`set-${id}`}>
        {label} {id in COST_LEVEL && <Cost id={id as keyof typeof COST_LEVEL} />}{' '}
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
    | 'noFlashes'
    | 'autopause'
    | 'confirmLeave'
    | 'monoAudio'
    | 'muteInBackground';
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

interface SelectProps<V extends string | number> {
  id: string;
  label: string;
  tip: string;
  value: V;
  options: readonly V[];
  text: (v: V) => string;
  onPick: (v: V) => void;
  cost?: keyof typeof COST_LEVEL;
}

function Select<V extends string | number>({
  id,
  label,
  tip,
  value,
  options,
  text,
  onPick,
  cost,
}: SelectProps<V>) {
  return (
    <div class="sz-field" title={tip}>
      <label for={`set-${id}`}>
        {label} {cost && <Cost id={cost} />}
      </label>
      <select
        id={`set-${id}`}
        data-tutorial-id={`settings-${id}`}
        value={String(value)}
        onChange={(e) => {
          const raw = e.currentTarget.value;
          const hit = options.find((o) => String(o) === raw);
          if (hit !== undefined) onPick(hit);
        }}
      >
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>
            {text(o)}
          </option>
        ))}
      </select>
    </div>
  );
}

const TABS = ['game', 'graphics', 'audio', 'controls', 'interface'] as const;
type Tab = (typeof TABS)[number];

const TAB_KEYS: Record<Tab, readonly (keyof Settings)[]> = {
  game: ['gameSpeed', 'autopause', 'autosaveMin', 'confirmLeave', 'confirmRemoval'],
  graphics: [
    'graphicsPreset',
    'renderScale',
    'fpsLimit',
    'spriteLimit',
    'corpseLimit',
    'particles',
    'buildings3d',
    'violence',
    'screenShake',
    'noFlashes',
  ],
  audio: ['volMaster', 'volEffects', 'volAmbient', 'volUi', 'volHorde', 'monoAudio', 'muteInBackground'],
  controls: ['keys', 'edgeScroll', 'cameraSpeed'],
  interface: ['language', 'uiScale', 'perfOverlay', 'unitBars', 'patternMode', 'reducedMotion', 'devTools'],
};

function TabGame() {
  return (
    <>
      <Select
        id="gameSpeed"
        label={t('settings.gameSpeed')}
        tip={t('settings.gameSpeed.tip')}
        value={settings.gameSpeed.value as GameSpeed}
        options={DEFAULT_SPEEDS}
        text={(v) => t(`hud.speed.${v}` as 'hud.speed.1')}
        onPick={(v) => setSetting('gameSpeed', v)}
      />
      <Check id="autopause" label={t('settings.autopause')} tip={t('settings.autopause.tip')} />
      <Select
        id="autosaveMin"
        label={t('settings.autosave')}
        tip={t('settings.autosave.tip')}
        value={settings.autosaveMin.value}
        options={AUTOSAVE_OPTIONS}
        text={(v) => (v === 0 ? t('settings.autosave.off') : t('settings.autosave.every', { n: v }))}
        onPick={(v) => setSetting('autosaveMin', v)}
      />
      <Check id="confirmLeave" label={t('settings.confirmLeave')} tip={t('settings.confirmLeave.tip')} />
      <Check
        id="confirmRemoval"
        label={t('settings.confirmRemoval')}
        tip={t('settings.confirmRemoval.tip')}
      />
    </>
  );
}

function TabGraphics() {
  return (
    <>
      <Select
        id="graphicsPreset"
        label={t('settings.preset')}
        tip={t('settings.preset.tip')}
        value={settings.graphicsPreset.value}
        options={GRAPHICS_PRESETS}
        text={(v) => t(`settings.preset.${v}`)}
        onPick={applyGraphicsPreset}
      />
      <Slider id="renderScale" label={t('settings.renderScale')} tip={t('settings.renderScale.tip')} />
      <Select
        id="fpsLimit"
        label={t('settings.fpsLimit')}
        tip={t('settings.fpsLimit.tip')}
        value={settings.fpsLimit.value}
        options={FPS_LIMITS}
        text={(v) => (v === 0 ? t('settings.fpsLimit.none') : String(v))}
        onPick={(v) => setSetting('fpsLimit', v)}
        cost="fpsLimit"
      />
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
      <Select
        id="particles"
        label={t('settings.particles')}
        tip={t('settings.particles.tip')}
        value={settings.particles.value}
        options={PARTICLE_LEVELS}
        text={(v) => t(`settings.particles.${v}`)}
        onPick={(v: ParticleLevel) => setSetting('particles', v)}
        cost="particles"
      />
      <Check id="buildings3d" label={t('settings.buildings3d')} tip={t('settings.buildings3d.tip')} />
      <Select
        id="violence"
        label={t('settings.violence')}
        tip={t('settings.violence.tip')}
        value={settings.violence.value}
        options={VIOLENCE_LEVELS}
        text={(v) => t(`settings.violence.${v}`)}
        onPick={(v: Violence) => setSetting('violence', v)}
      />
      <Check id="screenShake" label={t('settings.screenShake')} tip={t('settings.screenShake.tip')} />
      <Check id="noFlashes" label={t('settings.noFlashes')} tip={t('settings.noFlashes.tip')} />
    </>
  );
}

function TabAudio() {
  return (
    <>
      <Slider id="volMaster" label={t('settings.vol.master')} tip={t('settings.vol.tip')} />
      <Slider id="volEffects" label={t('settings.vol.effects')} tip={t('settings.vol.tip')} />
      <Slider id="volAmbient" label={t('settings.vol.ambient')} tip={t('settings.vol.tip')} />
      <Slider id="volUi" label={t('settings.vol.ui')} tip={t('settings.vol.tip')} />
      <Slider id="volHorde" label={t('settings.vol.horde')} tip={t('settings.vol.horde.tip')} />
      <Check id="monoAudio" label={t('settings.monoAudio')} tip={t('settings.monoAudio.tip')} />
      <Check
        id="muteInBackground"
        label={t('settings.muteInBackground')}
        tip={t('settings.muteInBackground.tip')}
      />
    </>
  );
}

function TabInterface() {
  return (
    <>
      <Select
        id="language"
        label={t('settings.language')}
        tip={t('settings.language.tip')}
        value={settings.language.value}
        options={LANGUAGES}
        text={(v) => t(`settings.language.${v}`)}
        onPick={(v: Language) => setSetting('language', v)}
      />
      <Slider id="uiScale" label={t('settings.uiScale')} tip={t('settings.uiScale.tip')} />
      <Check id="perfOverlay" label={t('settings.perfOverlay')} tip={t('settings.perfOverlay.tip')} />
      <Select
        id="unitBars"
        label={t('settings.unitBars')}
        tip={t('settings.unitBars.tip')}
        value={settings.unitBars.value}
        options={UNIT_BAR_MODES}
        text={(v) => t(`settings.unitBars.${v}`)}
        onPick={(v: UnitBarMode) => setSetting('unitBars', v)}
      />
      <Check id="patternMode" label={t('settings.patternMode')} tip={t('settings.patternMode.tip')} />
      <Check id="reducedMotion" label={t('settings.reducedMotion')} tip={t('settings.reducedMotion.tip')} />
      <Check id="devTools" label={t('settings.devTools')} tip={t('settings.devTools.tip')} />
    </>
  );
}

export function SettingsPanel() {
  const tab = settingsTab.value;
  return (
    <section class="sz-panel sz-settings" data-tutorial-id="settings" aria-labelledby="settings-title">
      <header>
        <h2 id="settings-title">{t('settings.title')}</h2>
        <button type="button" class="sz-btn sz-btn--compact" onClick={() => (settingsOpen.value = false)}>
          {t('settings.close')}
        </button>
      </header>
      <div class="sz-tabs" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            class="sz-btn sz-btn--compact"
            aria-selected={tab === id}
            data-tutorial-id={`settings-tab-${id}`}
            onClick={() => (settingsTab.value = id)}
          >
            {t(`settings.tab.${id}`)}
          </button>
        ))}
      </div>
      {tab === 'game' && <TabGame />}
      {tab === 'graphics' && <TabGraphics />}
      {tab === 'audio' && <TabAudio />}
      {tab === 'controls' && (
        <>
          <KeyBindings />
          <Check id="edgeScroll" label={t('settings.edgeScroll')} tip={t('settings.edgeScroll.tip')} />
          <Slider id="cameraSpeed" label={t('settings.cameraSpeed')} tip={t('settings.cameraSpeed.tip')} />
        </>
      )}
      {tab === 'interface' && <TabInterface />}
      <button
        type="button"
        class="sz-btn sz-btn--compact"
        data-tutorial-id="settings-reset"
        onClick={() => {
          resetSettings(TAB_KEYS[tab]);
          if (tab === 'graphics') applyGraphicsPreset(settings.graphicsPreset.value);
        }}
      >
        {t('settings.reset')}
      </button>
    </section>
  );
}
