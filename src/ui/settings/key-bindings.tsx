// Free key binding (GDD 13 Steuerung): click an action, press a key; conflicts are marked with text, not color alone.
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { DEFAULT_KEYS, KEY_ACTIONS, type KeyAction, RESERVED_KEYS } from '../../data/game';
import { t } from '../i18n';
import { keyOf, setSetting, settings } from './store';

const listening = signal<KeyAction | null>(null);

/** Readable name of a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names: Record<string, string> = { Space: 'Space', Equal: '+ / =', Minus: '-', Home: 'Home' };
  return names[code] ?? code;
}

/** Actions that share a key with another action. */
export function conflicts(): Set<KeyAction> {
  const byKey = new Map<string, KeyAction[]>();
  for (const a of KEY_ACTIONS) {
    const k = keyOf(a);
    byKey.set(k, [...(byKey.get(k) ?? []), a]);
  }
  const out = new Set<KeyAction>();
  for (const list of byKey.values()) if (list.length > 1) for (const a of list) out.add(a);
  return out;
}

function bind(action: KeyAction, code: string): void {
  const next = { ...settings.keys.value };
  if (code === DEFAULT_KEYS[action]) delete next[action];
  else next[action] = code;
  setSetting('keys', next);
}

export function KeyBindings() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const action = listening.value;
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      listening.value = null;
      if (e.code === 'Escape' || RESERVED_KEYS.includes(e.code)) return;
      if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight'].includes(e.code))
        return;
      bind(action, e.code);
    };
    // Capture phase: runs before the global Esc handler and the game keys.
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      listening.value = null;
    };
  }, []);
  const clash = conflicts();
  return (
    <div class="sz-keys" data-tutorial-id="settings-keys">
      <p class="sz-dim">{t('settings.keys.hint')}</p>
      {KEY_ACTIONS.map((a) => (
        <div key={a} class="sz-field sz-field--row" data-conflict={clash.has(a) ? 'true' : undefined}>
          <span>{t(`key.${a}`)}</span>
          {clash.has(a) && (
            <span class="sz-badge sz-badge--warn" role="alert">
              {t('settings.keys.conflict')}
            </span>
          )}
          <button
            type="button"
            class="sz-btn sz-btn--compact sz-mono"
            data-tutorial-id={`settings-key-${a}`}
            aria-label={`${t(`key.${a}`)}: ${keyLabel(keyOf(a))}`}
            onClick={() => (listening.value = listening.value === a ? null : a)}
          >
            {listening.value === a ? t('settings.keys.press') : keyLabel(keyOf(a))}
          </button>
          <button
            type="button"
            class="sz-btn sz-btn--compact"
            title={t('settings.keys.reset')}
            aria-label={`${t('settings.keys.reset')}: ${t(`key.${a}`)}`}
            disabled={keyOf(a) === DEFAULT_KEYS[a]}
            onClick={() => bind(a, DEFAULT_KEYS[a])}
          >
            ↺
          </button>
        </div>
      ))}
    </div>
  );
}
