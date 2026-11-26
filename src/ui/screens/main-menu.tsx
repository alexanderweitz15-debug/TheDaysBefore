import { isUnlocked, MENU_ENTRIES, type MenuEntry } from '../../data/menu';
import { LockIcon } from '../components/icons';
import { t } from '../i18n';
import { menuVisible, settingsOpen } from '../ui-state';

function activate(e: MenuEntry): void {
  if (!isUnlocked(e)) return;
  if (e.id === 'settings') settingsOpen.value = !settingsOpen.value;
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
