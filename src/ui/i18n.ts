// Reactive translation. Reads the language signal, so components using t() re-render on language change.
import { de, type MessageKey } from '../data/i18n/de';
import { en } from '../data/i18n/en';
import { settings } from './settings/store';

const TABLES: Record<'de' | 'en', Record<MessageKey, string>> = { de, en };

export type { MessageKey };

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const text = TABLES[settings.language.value][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

/** Locale tag for number formatting. */
export function numberLocale(): string {
  return settings.language.value === 'de' ? 'de-DE' : 'en-US';
}

/** Translates a key that may not exist (data-driven suffixes); falls back to the raw key. */
export function tryT(key: string, params?: Record<string, string | number>): string {
  return key in de ? t(key as MessageKey, params) : key;
}

/** Formats seconds as m:ss. */
export function clock(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
