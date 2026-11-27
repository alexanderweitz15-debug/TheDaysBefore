import { useEffect } from 'preact/hooks';
import type { CommandSink } from '../../core/types/app';
import { isUnlocked, MENU_ENTRIES, type MenuEntry } from '../../data/menu';
import { SCENARIOS } from '../../data/scenarios';
import { LESSONS, LOCKED_LESSONS } from '../../data/tutorial';
import { LockIcon } from '../components/icons';
import { t } from '../i18n';
import { latestSave, loadSlot, refreshSaves, saveList } from '../saves';
import { startLesson, startSkirmish } from '../session';
import { lessonDone } from '../tutorial/progress';
import {
  activeScenario,
  briefingOpen,
  briefingScenarioId,
  menuVisible,
  settingsOpen,
  tutorialMenuOpen,
} from '../ui-state';
import { PauseMenu } from './pause-menu';

function activate(e: MenuEntry): void {
  if (!isUnlocked(e)) return;
  if (e.id === 'settings') settingsOpen.value = !settingsOpen.value;
  else if (e.id === 'scenario') {
    briefingScenarioId.value ??= SCENARIOS[0]?.id ?? null;
    briefingOpen.value = true;
    menuVisible.value = false;
  } else if (e.id === 'skirmish') startSkirmish();
  else if (e.id === 'tutorial') tutorialMenuOpen.value = true;
  else if (e.id === 'continue') {
    const s = latestSave();
    if (s) void loadSlot(s.slot);
  }
}

function Entry({ entry }: { entry: MenuEntry }) {
  const locked = !isUnlocked(entry);
  const noSave = entry.id === 'continue' && !locked && latestSave() === null;
  const reason = locked ? t('menu.locked', { milestone: entry.unlock }) : noSave ? t('menu.noSave') : null;
  return (
    <li>
      <button
        type="button"
        class="sz-btn"
        aria-disabled={reason ? 'true' : undefined}
        aria-describedby={reason ? `menu-reason-${entry.id}` : undefined}
        data-tutorial-id={entry.tutorialId}
        onClick={() => !noSave && activate(entry)}
      >
        <span>{t(entry.labelKey)}</span>
        {reason && (
          <span class="sz-reason" id={`menu-reason-${entry.id}`}>
            {locked && <LockIcon title={t('menu.lockedLabel')} />}
            {reason}
          </span>
        )}
      </button>
    </li>
  );
}

function TutorialMenu() {
  return (
    <nav class="sz-panel sz-menu" aria-label={t('menu.tutorial')} data-tutorial-id="tutorial-menu">
      <h1>{t('app.title')}</h1>
      <h2>{t('menu.tutorial')}</h2>
      <ul>
        {LESSONS.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              class="sz-btn"
              data-tutorial-id={`lesson-${l.id}`}
              onClick={() => startLesson(l.id)}
            >
              <span>{t(l.title)}</span>
              {lessonDone(l.id) && <span class="sz-badge">{t('tutorial.done')}</span>}
            </button>
          </li>
        ))}
        {LOCKED_LESSONS.map((l) => (
          <li key={l.id}>
            <button type="button" class="sz-btn" aria-disabled="true">
              <span>{t(l.title)}</span>
              <span class="sz-reason">
                <LockIcon title={t('menu.lockedLabel')} />
                {t('menu.locked', { milestone: l.milestone })}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" class="sz-btn sz-btn--compact" onClick={() => (tutorialMenuOpen.value = false)}>
        {t('menu.back')}
      </button>
    </nav>
  );
}

export function MainMenu({ commands }: { commands: CommandSink }) {
  useEffect(() => {
    void refreshSaves();
  }, []);
  void saveList.value;
  if (briefingOpen.value) return null;
  if (!menuVisible.value) {
    // In a mission Esc opens the pause menu; only the free-mode backdrop keeps the button.
    if (activeScenario.value !== null) return null;
    return (
      <button
        type="button"
        class="sz-panel sz-btn sz-btn--compact sz-show-hint"
        data-tutorial-id="menu-show"
        onClick={() => (menuVisible.value = true)}
      >
        {t('menu.show')}
      </button>
    );
  }
  if (activeScenario.value !== null) return <PauseMenu commands={commands} />;
  if (tutorialMenuOpen.value) return <TutorialMenu />;
  return (
    <nav class="sz-panel sz-menu" aria-label={t('menu.title')} data-tutorial-id="main-menu">
      <h1>{t('app.title')}</h1>
      <h2>{t('menu.title')}</h2>
      <ul>
        {MENU_ENTRIES.map((e) => (
          <Entry key={e.id} entry={e} />
        ))}
      </ul>
      <button
        type="button"
        class="sz-btn sz-btn--compact sz-hide"
        data-tutorial-id="menu-hide"
        onClick={() => (menuVisible.value = false)}
      >
        {t('menu.hide')}
      </button>
    </nav>
  );
}
