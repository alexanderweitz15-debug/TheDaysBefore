// Save and load list (GDD 14 pause menu, 13 Daten): new slot, overwrite, load, rename, delete, export, import.
import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { TICK_RATE } from '../../core/loop';
import { MAX_SAVE_LABEL } from '../../data/game';
import { clock, numberLocale, t, tryT } from '../i18n';
import {
  exportSlot,
  importFile,
  loadSlot,
  refreshSaves,
  removeSlot,
  renameSlot,
  type SaveEntry,
  saveList,
  saveManual,
} from '../saves';
import { activeScenario, saveNotice, savesMode } from '../ui-state';

function Row({ e, mode }: { e: SaveEntry; mode: 'save' | 'load' }) {
  const editing = useSignal(false);
  const name = useSignal(e.meta.label);
  const auto = e.slot.startsWith('auto-');
  const when = new Date(e.meta.savedAt).toLocaleString(numberLocale());
  return (
    <li class="sz-save" data-tutorial-id={`save-${e.slot}`}>
      <div class="sz-save__info">
        {editing.value ? (
          <input
            type="text"
            maxLength={MAX_SAVE_LABEL}
            value={name.value}
            aria-label={t('saves.rename')}
            onInput={(ev) => (name.value = ev.currentTarget.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') {
                void renameSlot(e.slot, name.value);
                editing.value = false;
              }
              if (ev.key === 'Escape') {
                ev.stopPropagation();
                editing.value = false;
              }
            }}
          />
        ) : (
          <strong>{e.meta.label}</strong>
        )}{' '}
        {auto && <span class="sz-badge">{t('saves.auto')}</span>}
        <div class="sz-dim sz-save__meta">
          {e.meta.scenarioId ? tryT(`scenario.${e.meta.scenarioId}.name`) : t('saves.free')} ·{' '}
          {clock(e.meta.tick / TICK_RATE)} · {when}
        </div>
      </div>
      <div class="sz-save__actions">
        {mode === 'load' ? (
          <button
            type="button"
            class="sz-btn sz-btn--compact sz-btn--primary"
            onClick={() => void loadSlot(e.slot)}
          >
            {t('saves.load')}
          </button>
        ) : (
          !auto && (
            <button
              type="button"
              class="sz-btn sz-btn--compact"
              onClick={() => void saveManual(e.slot, e.meta.label)}
            >
              {t('saves.overwrite')}
            </button>
          )
        )}
        {!auto && (
          <button
            type="button"
            class="sz-btn sz-btn--compact"
            onClick={() => {
              if (editing.value) void renameSlot(e.slot, name.value);
              editing.value = !editing.value;
            }}
          >
            {t('saves.rename')}
          </button>
        )}
        <button type="button" class="sz-btn sz-btn--compact" onClick={() => void exportSlot(e.slot)}>
          {t('saves.export')}
        </button>
        <button
          type="button"
          class="sz-btn sz-btn--compact sz-btn--danger"
          onClick={() => void removeSlot(e.slot)}
        >
          {t('saves.delete')}
        </button>
      </div>
    </li>
  );
}

export function SavesPanel({ mode }: { mode: 'save' | 'load' }) {
  const label = useSignal('');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    saveNotice.value = null;
    void refreshSaves();
  }, []);
  const list = saveList.value;
  return (
    <section class="sz-panel sz-saves" data-tutorial-id="saves-panel" aria-labelledby="saves-title">
      <header>
        <h2 id="saves-title">{mode === 'save' ? t('saves.titleSave') : t('saves.titleLoad')}</h2>
        <button type="button" class="sz-btn sz-btn--compact" onClick={() => (savesMode.value = null)}>
          {t('settings.close')}
        </button>
      </header>
      {mode === 'save' && activeScenario.value && (
        <div class="sz-field sz-field--row">
          <input
            type="text"
            maxLength={MAX_SAVE_LABEL}
            placeholder={t('saves.labelPlaceholder')}
            aria-label={t('saves.labelPlaceholder')}
            value={label.value}
            data-tutorial-id="saves-label"
            onInput={(e) => (label.value = e.currentTarget.value)}
          />
          <button
            type="button"
            class="sz-btn sz-btn--compact sz-btn--primary"
            data-tutorial-id="saves-new"
            onClick={() => {
              void saveManual(null, label.value);
              label.value = '';
            }}
          >
            {t('saves.new')}
          </button>
        </div>
      )}
      {saveNotice.value && (
        <p role="status" class="sz-dim">
          {tryT(saveNotice.value)}
        </p>
      )}
      {list.length === 0 ? <p class="sz-dim">{t('saves.empty')}</p> : null}
      <ul class="sz-saves__list">
        {list.map((e) => (
          <Row key={e.slot} e={e} mode={mode} />
        ))}
      </ul>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) void importFile(f);
          e.currentTarget.value = '';
        }}
      />
      <button type="button" class="sz-btn sz-btn--compact" onClick={() => file.current?.click()}>
        {t('saves.import')}
      </button>
    </section>
  );
}
