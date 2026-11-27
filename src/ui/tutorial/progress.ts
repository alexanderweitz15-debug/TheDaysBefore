// Completed tutorial lessons, persisted (GDD 15). Lessons 1 and 2 also unlock the menu hint.
import { signal } from '@preact/signals';
import { z } from 'zod';
import { loadVersioned, saveVersioned, type VersionedSpec } from '../../core/save/versioned-storage';

const spec: VersionedSpec<{ done: string[] }> = {
  key: 'sperrzone.tutorial',
  version: 1,
  schema: z.object({ done: z.array(z.string()) }),
  defaults: { done: [] },
};

const done = signal<string[]>(loadVersioned(spec).done);

export const lessonDone = (id: string): boolean => done.value.includes(id);

export function markLessonDone(id: string): void {
  if (done.peek().includes(id)) return;
  done.value = [...done.peek(), id];
  saveVersioned(spec, { done: done.value });
}
