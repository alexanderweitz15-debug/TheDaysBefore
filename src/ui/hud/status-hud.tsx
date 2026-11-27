// Top-center counters: rescued, dead, zombies. Incubating civilians are never shown (GDD 7, needs research).

import { STRUCTURES } from '../../data/buildings/defense';
import { activeTool, buildArm } from '../../render/view-state';
import { t } from '../i18n';
import { undoRemoval } from '../tools/zone-tools';
import { pendingRemoval, toolNotice } from '../ui-state';

export function ToolHint() {
  const tool = activeTool.value;
  const notice = toolNotice.value;
  if (pendingRemoval.value !== null) {
    return (
      <div class="sz-panel sz-tool-hint" role="status" data-tutorial-id="tool-undo">
        {t('tool.remove.pending')}{' '}
        <button type="button" class="sz-btn sz-btn--compact" onClick={undoRemoval}>
          {t('tool.remove.undo')}
        </button>
      </div>
    );
  }
  if (tool === 'none') return null;
  return (
    <div class="sz-panel sz-tool-hint" role="status" data-tutorial-id="tool-hint">
      {tool === 'build' ? t(buildHint()) : t(`tool.${tool}`)}
      {notice && <div>{t(notice)}</div>}
    </div>
  );
}

function buildHint(): 'tool.build.unit' | 'tool.build.point' | 'tool.build.line' {
  const a = buildArm.value;
  if (!a || a.kind === 'unit') return 'tool.build.unit';
  return STRUCTURES[a.structure as keyof typeof STRUCTURES].line ? 'tool.build.line' : 'tool.build.point';
}
