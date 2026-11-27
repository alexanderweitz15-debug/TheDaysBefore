// Transient UI state shared between screens.
import { signal } from '@preact/signals';
import type { MessageKey } from '../data/i18n/de';

export const menuVisible = signal(true);
export const settingsOpen = signal(false);

export const debugOpen = signal(false);
/** True while the debug panel waits for a click on the map to place zombies. */
export const spawnArmed = signal(false);
/** True while the debug panel waits for a click on the map to start an outbreak. */
/** Zone id whose removal waits for the undo window, or null. */
export const pendingRemoval = signal<number | null>(null);
/** Short tool message key (e.g. corridor point limit), or null. */
export const toolNotice = signal<MessageKey | null>(null);
/** Active tab of the command bar. */
export const commandTab = signal<'units' | 'defense' | 'civil'>('units');
/** Structure id waiting for the second press to confirm demolition, or null. */
export const demolishConfirm = signal<number | null>(null);
export const outbreakArmed = signal(false);
