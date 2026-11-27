// Pause menu (GDD 14 screen 7): resume, save, load, settings, restart, surrender (always confirmed), main menu.
import type { CommandSink } from '../../core/types/app';
import { t } from '../i18n';
import { restartMission, toMainMenu } from '../session';
import { settings } from '../settings/store';
import { activeLessonId, confirmAction, menuVisible, savesMode, settingsOpen } from '../ui-state';
import { SavesPanel } from './saves-panel';

const LOCAL_PLAYER = 0;

type Action = NonNullable<typeof confirmAction.value>;

export function PauseMenu({ commands }: { commands?: CommandSink }) {
  const pending = confirmAction.value;
  const run = (a: Action): void => {
    confirmAction.value = null;
    if (a === 'restart') restartMission();
    else if (a === 'main') toMainMenu();
    else {
      commands?.submit({ playerId: LOCAL_PLAYER, type: 'Surrender', payload: {} });
      menuVisible.value = false;
    }
  };
  const ask = (a: Action): void => {
    // Surrender always asks; restart and main menu follow the setting.
    if (a === 'surrender' || settings.confirmLeave.value) confirmAction.value = a;
    else run(a);
  };
  const btn = (id: string, label: string, onClick: () => void, cls = '') => (
    <li>
      <button type="button" class={`sz-btn ${cls}`} data-tutorial-id={`pause-${id}`} onClick={onClick}>
        {label}
      </button>
    </li>
  );
  return (
    <>
      <nav class="sz-panel sz-menu" aria-label={t('pause.title')} data-tutorial-id="pause-menu">
        <h1>{t('app.title')}</h1>
        <h2>{t('pause.title')}</h2>
        {pending ? (
          <div role="alertdialog" aria-label={t(`pause.confirm.${pending}`)} data-tutorial-id="pause-confirm">
            <p>{t(`pause.confirm.${pending}`)}</p>
            <ul>
              {btn('confirm-yes', t('pause.confirm.yes'), () => run(pending), 'sz-btn--danger')}
              {btn('confirm-no', t('pause.confirm.no'), () => (confirmAction.value = null))}
            </ul>
          </div>
        ) : (
          <ul>
            {btn('resume', t('pause.resume'), () => (menuVisible.value = false), 'sz-btn--primary')}
            {btn(
              'save',
              t('pause.save'),
              () => (savesMode.value = savesMode.value === 'save' ? null : 'save'),
            )}
            {btn(
              'load',
              t('pause.load'),
              () => (savesMode.value = savesMode.value === 'load' ? null : 'load'),
            )}
            {btn('settings', t('menu.settings'), () => (settingsOpen.value = !settingsOpen.value))}
            {btn('restart', t('pause.restart'), () => ask('restart'))}
            {activeLessonId.value === null && btn('surrender', t('pause.surrender'), () => ask('surrender'))}
            {btn('main', t('pause.mainMenu'), () => ask('main'))}
          </ul>
        )}
      </nav>
      {savesMode.value && <SavesPanel mode={savesMode.value} />}
    </>
  );
}
