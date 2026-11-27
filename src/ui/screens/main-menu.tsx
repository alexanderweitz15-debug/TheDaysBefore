import { isUnlocked, MENU_ENTRIES, type MenuEntry } from '../../data/menu';
import { SCENARIOS } from '../../data/scenarios';
import { LockIcon } from '../components/icons';
import { t } from '../i18n';
import { restartMission, toMainMenu } from '../session';
import { activeScenario, briefingOpen, briefingScenarioId, menuVisible, settingsOpen } from '../ui-state';

function activate(e: MenuEntry): void {
  if (!isUnlocked(e)) return;
  if (e.id === 'settings') settingsOpen.value = !settingsOpen.value;
  else if (e.id === 'scenario') {
    briefingScenarioId.value ??= SCENARIOS[0]?.id ?? null;
    briefingOpen.value = true;
    menuVisible.value = false;
  }
}

function Entry({ entry }: { entry: MenuEntry }) {
  const locked = !isUnlocked(entry);
  const reason = t('menu.locked', { milestone: entry.unlock });
  return (
    <li>
      <button
        type="button"
        class="sz-btn"
        aria-disabled={locked ? 'true' : undefined}
        aria-describedby={locked ? `menu-reason-${entry.id}` : undefined}
        data-tutorial-id={entry.tutorialId}
        onClick={() => activate(entry)}
      >
        <span>{t(entry.labelKey)}</span>
        {locked && (
          <span class="sz-reason" id={`menu-reason-${entry.id}`}>
            <LockIcon title={t('menu.lockedLabel')} />
            {reason}
          </span>
        )}
      </button>
    </li>
  );
}

export function MainMenu() {
  if (briefingOpen.value) return null;
  if (!menuVisible.value) {
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
  const inMission = activeScenario.value !== null;
  return (
    <nav class="sz-panel sz-menu" aria-label={t('menu.title')} data-tutorial-id="main-menu">
      <h1>{t('app.title')}</h1>
      <h2>{inMission ? t('pause.title') : t('menu.title')}</h2>
      {inMission && (
        <ul data-tutorial-id="pause-menu">
          <li>
            <button
              type="button"
              class="sz-btn"
              data-tutorial-id="pause-resume"
              onClick={() => (menuVisible.value = false)}
            >
              {t('pause.resume')}
            </button>
          </li>
          <li>
            <button
              type="button"
              class="sz-btn"
              title={t('pause.restart.tip')}
              data-tutorial-id="pause-restart"
              onClick={restartMission}
            >
              {t('pause.restart')}
            </button>
          </li>
          <li>
            <button type="button" class="sz-btn" data-tutorial-id="pause-main" onClick={toMainMenu}>
              {t('pause.mainMenu')}
            </button>
          </li>
        </ul>
      )}
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
