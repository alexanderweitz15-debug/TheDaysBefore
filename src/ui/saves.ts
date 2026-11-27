// Save game handling in the UI: manual slots, autosave, rename, delete, export, import (GDD 4, 13 Daten).
import { signal } from '@preact/signals';
import { TICK_RATE } from '../core/loop';
import {
  deleteSave,
  exportSave,
  importSave,
  listSaves,
  readSave,
  writeAutosave,
  writeSave,
} from '../core/save/save-store';
import { SAVE_FORMAT_VERSION, type SaveGame, type SaveMeta } from '../core/types/save';
import { MAX_SAVE_LABEL, SAVE_SLOT_PREFIX } from '../data/game';
import { clock, tryT } from './i18n';
import { getSession, loadGame } from './session';
import { activeScenario, saveNotice } from './ui-state';

export interface SaveEntry {
  slot: string;
  meta: SaveMeta;
}

/** Saves list, newest first; refreshed after every change. */
export const saveList = signal<SaveEntry[]>([]);

export async function refreshSaves(): Promise<void> {
  try {
    const list = await listSaves();
    saveList.value = list.sort((a, b) => b.meta.savedAt.localeCompare(a.meta.savedAt));
  } catch {
    saveList.value = [];
  }
}

export const latestSave = (): SaveEntry | null => saveList.value[0] ?? null;

async function snapshot(label?: string): Promise<SaveGame> {
  const s = getSession();
  if (!s) throw new Error('no session');
  const { tick, ...rest } = await s.save();
  const scen = activeScenario.value;
  const name = scen ? tryT(`scenario.${scen.textKey}.name`) : '';
  return {
    ...rest,
    meta: {
      formatVersion: SAVE_FORMAT_VERSION,
      scenarioId: scen?.id ?? null,
      tick,
      savedAt: new Date().toISOString(),
      label: (label?.trim() || `${name} ${clock(tick / TICK_RATE)}`).slice(0, MAX_SAVE_LABEL),
    },
  };
}

function nextManualSlot(): string {
  const used = saveList.value
    .filter((s) => s.slot.startsWith(SAVE_SLOT_PREFIX))
    .map((s) => Number(s.slot.slice(SAVE_SLOT_PREFIX.length)) || 0);
  return `${SAVE_SLOT_PREFIX}${Math.max(0, ...used) + 1}`;
}

function fail(): void {
  saveNotice.value = 'saves.error';
}

/** Writes a manual save; `slot` null makes a new slot. */
export async function saveManual(slot: string | null, label?: string): Promise<void> {
  try {
    await writeSave(slot ?? nextManualSlot(), await snapshot(label));
    saveNotice.value = 'saves.saved';
  } catch {
    fail();
  }
  await refreshSaves();
}

export async function autosave(): Promise<void> {
  try {
    await writeAutosave(await snapshot(undefined));
  } catch {
    // Autosave failures are silent: the next one retries.
  }
  await refreshSaves();
}

export async function loadSlot(slot: string): Promise<void> {
  try {
    const save = await readSave(slot);
    if (save) loadGame(save);
    else fail();
  } catch {
    fail();
  }
}

export async function removeSlot(slot: string): Promise<void> {
  await deleteSave(slot).catch(fail);
  await refreshSaves();
}

export async function renameSlot(slot: string, label: string): Promise<void> {
  try {
    const save = await readSave(slot);
    if (save)
      await writeSave(slot, {
        ...save,
        meta: { ...save.meta, label: label.trim().slice(0, MAX_SAVE_LABEL) },
      });
  } catch {
    fail();
  }
  await refreshSaves();
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportSlot(slot: string): Promise<void> {
  try {
    const save = await readSave(slot);
    if (save) downloadBlob(await exportSave(save), `${slot}.sperrzone-save.json`);
  } catch {
    fail();
  }
}

export async function importFile(file: File): Promise<void> {
  try {
    await writeSave(nextManualSlot(), await importSave(file));
    saveNotice.value = 'saves.imported';
  } catch {
    saveNotice.value = 'saves.importFailed';
  }
  await refreshSaves();
}
