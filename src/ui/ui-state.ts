// Transient UI state shared between screens.
import { signal } from '@preact/signals';
import type { Stance, UnitTypeId } from '../core/commands';
import type { ScenarioDef } from '../core/types/mission';
import type { DebriefData } from '../core/types/outcome';
import type { OrderTool } from '../data/hud-orders';
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
export const commandTab = signal<'units' | 'orders' | 'defense' | 'civil'>('units');
/** Structure id waiting for the second press to confirm demolition, or null. */
export const demolishConfirm = signal<number | null>(null);
export const outbreakArmed = signal(false);

/** Side window (GDD 14 Fenster). The game keeps running while one is open. */
export type SidePanelId = 'economy' | 'population' | 'decrees';
export const sidePanel = signal<SidePanelId | null>(null);
/** Briefing screen visible (scenario chosen in the main menu). */
export const briefingOpen = signal(false);
/** Id of the scenario shown in the briefing. */
export const briefingScenarioId = signal<string | null>(null);
/** Scenario of the running mission, null in free mode (menu background). */
export const activeScenario = signal<ScenarioDef | null>(null);
/** Loading screen state: set from "start" until the map is drawn and the first mission state arrived. */
export const loadingState = signal<{ startedAt: number; scenario: ScenarioDef | null } | null>(null);
/** Warning sign whose popover is open, or null. */
export const openWarning = signal<number | null>(null);

/** Active tab of the settings panel. */
export const settingsTab = signal<'game' | 'graphics' | 'audio' | 'controls' | 'interface'>('game');

/** Save/load panel mode inside the pause menu, or null. */
export const savesMode = signal<'save' | 'load' | null>(null);
/** Pending confirmation in the pause menu. */
export const confirmAction = signal<'restart' | 'surrender' | 'main' | null>(null);
/** Debrief screen (GDD 10) with its data. */
export const debriefOpen = signal(false);
/** Tutorial lesson list visible in the main menu. */
export const tutorialMenuOpen = signal(false);
/** Running lesson id, null outside the tutorial. */
export const activeLessonId = signal<string | null>(null);
/** Short feedback line of the saves panel (i18n key), or null. */
export const saveNotice = signal<string | null>(null);
/** Debrief data of the finished mission. */
export const debriefData = signal<DebriefData | null>(null);

/** Order being prepared: strength per type and stance are chosen in the dialog, the shape is drawn on the map. */
export interface OrderDraft {
  kind: OrderTool;
  squads: Partial<Record<UnitTypeId, number>>;
  stance: Stance;
}
export const orderDraft = signal<OrderDraft | null>(null);
/** Order list panel folded to its header. */
export const ordersCollapsed = signal(false);
