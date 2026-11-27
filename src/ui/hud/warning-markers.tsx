// Warning signs as markers on the map (GDD 6) with a popover: text, escalation timer, investigate button.
import { useEffect, useRef } from 'preact/hooks';
import { TICK_RATE } from '../../core/loop';
import type { CommandSink, SimView } from '../../core/types/app';
import { WARNINGS } from '../../data/economy/economy';
import { WARNING_CRIT_S } from '../../data/hud-economy';
import { cameraView } from '../../render/view-state';
import { WarningIcon } from '../components/icons';
import { numberLocale, t, tryT } from '../i18n';
import { openWarning } from '../ui-state';
import { usePoll } from './use-poll';

const LOCAL_PLAYER = 0;

export function WarningMarkers({ sim, commands }: { sim: SimView; commands: CommandSink }) {
  usePoll();
  const root = useRef<HTMLDivElement>(null);
  const warnings = sim.mission?.phase === 'farm' ? sim.mission.warnings : [];
  const fmt = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 0 });

  useEffect(() => {
    let raf = 0;
    const place = (): void => {
      const el = root.current;
      if (el)
        for (const child of Array.from(el.children) as HTMLElement[]) {
          const x = Number(child.dataset.x);
          const y = Number(child.dataset.y);
          const sx = (x - cameraView.cx) * cameraView.zoom + cameraView.width / 2;
          const sy = (y - cameraView.cy) * cameraView.zoom + cameraView.height / 2;
          const inside = sx > -20 && sy > -20 && sx < cameraView.width + 20 && sy < cameraView.height + 20;
          child.style.display = inside ? '' : 'none';
          child.style.transform = `translate(${sx}px, ${sy}px)`;
        }
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={root} class="sz-markers" data-tutorial-id="warning-markers">
      {warnings.map((w) => {
        const secs = w.escalatesInTicks / TICK_RATE;
        const open = openWarning.value === w.id;
        const level = w.investigated ? 'ok' : secs < WARNING_CRIT_S ? 'crit' : 'warn';
        return (
          <div key={w.id} class="sz-marker" data-x={w.x} data-y={w.y}>
            <button
              type="button"
              class={`sz-marker__btn sz-level--${level}`}
              aria-expanded={open}
              title={t('warning.title')}
              data-tutorial-id={`warning-${w.id}`}
              onClick={() => (openWarning.value = open ? null : w.id)}
            >
              <WarningIcon />
              {w.investigated ? <span class="sz-level__mark">✓</span> : <span class="sz-level__mark">!</span>}
            </button>
            {open && (
              <div class="sz-panel sz-marker__pop" role="dialog" aria-label={t('warning.title')}>
                <strong>{tryT(w.key.startsWith('warning.') ? w.key : `warning.${w.key}`)}</strong>
                {w.investigated ? (
                  <div class="sz-dim">{t('warning.investigated')}</div>
                ) : (
                  <>
                    <div class={`sz-level--${level}`}>{t('warning.escalates', { s: fmt.format(secs) })}</div>
                    <div class="sz-dim">
                      {t('warning.cost', {
                        cost: `${fmt.format(WARNINGS.investigateCost.budget)} ${t('res.budget')}`,
                        s: WARNINGS.investigateS,
                      })}
                    </div>
                    <button
                      type="button"
                      class="sz-btn sz-btn--compact"
                      data-tutorial-id="warning-investigate"
                      onClick={() => {
                        commands.submit({
                          playerId: LOCAL_PLAYER,
                          type: 'InvestigateWarning',
                          payload: { warningId: w.id },
                        });
                        openWarning.value = null;
                      }}
                    >
                      {t('warning.investigate')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
