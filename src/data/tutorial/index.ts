// Tutorial registry. Lessons 3 to 5 arrive with M11 and are shown locked.
import { LESSON_1 } from './lesson1';
import { LESSON_2 } from './lesson2';
import type { Lesson } from './types';

export const LESSONS: readonly Lesson[] = [LESSON_1, LESSON_2];
/** Lessons announced in the GDD but not built yet: id, title key, milestone. */
export const LOCKED_LESSONS = [
  { id: 'lesson3', title: 'tutorial.l3.title', milestone: 11 },
  { id: 'lesson4', title: 'tutorial.l4.title', milestone: 11 },
  { id: 'lesson5', title: 'tutorial.l5.title', milestone: 11 },
] as const;

/** Distance (px) of the hint panel to the marked element and marker ring padding. */
export const MARKER_PAD_PX = 6;
/** How often the controller checks the completion condition (ms). */
export const CHECK_MS = 200;
