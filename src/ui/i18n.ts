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
