// Transient UI state shared between screens.
import { signal } from '@preact/signals';

export const menuVisible = signal(true);
export const settingsOpen = signal(false);

export const debugOpen = signal(false);
/** True while the debug panel waits for a click on the map to place zombies. */
export const spawnArmed = signal(false);
