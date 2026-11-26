// Transient UI state shared between screens.
import { signal } from '@preact/signals';

export const menuVisible = signal(true);
export const settingsOpen = signal(false);
