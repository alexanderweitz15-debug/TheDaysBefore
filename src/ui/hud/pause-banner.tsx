// Visible hint while the game is paused (manual or autopause).
import type { SimView } from '../../core/types/app';
import { t } from '../i18n';
import { usePoll } from './use-poll';

export function PauseBanner({ sim }: { sim: SimView }) {
  usePoll(150);
  if (sim.stats.speed !== 0 || !sim.mission || sim.mission.outcome != null) return null;
  return (
    <div class="sz-panel sz-pause-banner" role="status" data-tutorial-id="pause-banner">
      {t('hud.paused')}
    </div>
  );
}
