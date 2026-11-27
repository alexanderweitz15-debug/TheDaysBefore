// Main menu entries in display order. `unlock` is the milestone that implements the feature (GDD 14, screen 2).

export type MenuEntryId =
  | 'continue'
  | 'campaign'
  | 'scenario'
  | 'skirmish'
  | 'endless'
  | 'challenges'
  | 'sandbox'
  | 'editor'
  | 'tutorial'
  | 'codex'
  | 'stats'
  | 'settings';

export interface MenuEntry {
  readonly id: MenuEntryId;
  /** i18n key of the label. */
  readonly labelKey: `menu.${MenuEntryId}`;
  /** Milestone number that unlocks the entry; 0 means available now. */
  readonly unlock: number;
  readonly tutorialId: string;
}

/** Highest milestone implemented so far. Raise when a milestone ships. */
export const BUILT_MILESTONE = 4;

const entry = (id: MenuEntryId, unlock: number): MenuEntry => ({
  id,
  labelKey: `menu.${id}`,
  unlock,
  tutorialId: `menu-${id}`,
});

export const MENU_ENTRIES: readonly MenuEntry[] = [
  entry('continue', 5),
  entry('campaign', 11),
  entry('scenario', 4),
  entry('skirmish', 5),
  entry('endless', 11),
  entry('challenges', 11),
  entry('sandbox', 12),
  entry('editor', 12),
  entry('tutorial', 5),
  entry('codex', 6),
  entry('stats', 11),
  entry('settings', 0),
];

export const isUnlocked = (e: MenuEntry): boolean => e.unlock <= BUILT_MILESTONE;
