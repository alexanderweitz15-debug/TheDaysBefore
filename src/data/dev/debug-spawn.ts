// Debug spawn presets (M1 debug panel). Not part of the game rules.
export const DEBUG_SPAWN = {
  /** Zombies spawned at the cursor. */
  cursorCount: 1_000,
  /** Total horde spread along the map edges, in batches of `hordeBatch`. */
  hordeCount: 30_000,
  hordeBatch: 1_000,
  /** Inset of horde spawn points from the map edge in meters. */
  hordeInsetM: 24,
} as const;
