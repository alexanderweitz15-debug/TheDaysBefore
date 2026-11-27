// Command bar (GDD 14): build tabs Units / Defense / Civil with icons and costs; window buttons as small icons at the right.
import type { StructureKind, UnitTypeId } from '../../core/commands';
import type { SimView } from '../../core/types/app';
import { STRUCTURES } from '../../data/buildings/defense';
import { UNIT_TYPE_ORDER, UNITS } from '../../data/units/present';
import { activeTool, type BuildArm, buildArm, type ToolName } from '../../render/view-state';
import { Glyph } from '../components/icons';
import { numberLocale, t } from '../i18n';
import { cancelTool } from '../tools/zone-tools';
import { commandTab, type SidePanelId, sidePanel } from '../ui-state';
import { usePoll } from './use-poll';

const TABS = ['units', 'defense', 'civil'] as const;
const WINDOWS: ReadonlyArray<{ id: SidePanelId; key: string }> = [
  { id: 'economy', key: '' },
  { id: 'population', key: 'P' },
  { id: 'decrees', key: '' },
];
const STRUCTURE_ORDER: readonly StructureKind[] = [
  'barricade',
  'wall',
  'gate',
  'wire',
  'mines',
  'charge',
  'watchtower',
  'depot',
];
const CIVIL: ReadonlyArray<{
  tool: Exclude<ToolName, 'none' | 'build' | 'attackArea'>;
  key: 'K' | 'Z' | 'V';
}> = [
  { tool: 'corridor', key: 'K' },
  { tool: 'safeZone', key: 'Z' },
  { tool: 'rallyPoint', key: 'V' },
];

function arm(a: BuildArm): void {
  cancelTool();
  buildArm.value = a;
  activeTool.value = 'build';
}

interface ItemProps {
  id: string;
  glyph: string;
  label: string;
  cost: string;
  locked: boolean;
  active: boolean;
  onPick: () => void;
}

function Item({ id, glyph, label, cost, locked, active, onPick }: ItemProps) {
  return (
    <button
      type="button"
      class="sz-btn sz-cmd"
      aria-disabled={locked ? 'true' : undefined}
      aria-pressed={active}
      title={locked ? t('cmd.noBudget') : `${t('cmd.cost')}: ${cost}`}
      data-tutorial-id={`cmd-${id}`}
      onClick={() => !locked && onPick()}
    >
      <Glyph id={glyph} />
      <span class="sz-cmd__label">{label}</span>
      <span class="sz-mono sz-cmd__cost">{cost}</span>
    </button>
  );
}

export function CommandBar({ sim }: { sim: SimView }) {
  usePoll();
  const budget = sim.mission?.resources.budget.amount ?? sim.stats.counters.budget;
  const fmt = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 0 });
  const tab = commandTab.value;
  const tool = activeTool.value;
  const armed = buildArm.value;
  return (
    <nav class="sz-panel sz-cmdbar" data-tutorial-id="command-bar" aria-label={t('cmd.bar')}>
      <div class="sz-cmdbar__tabs" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            class="sz-btn sz-btn--compact"
            aria-selected={tab === id}
            data-tutorial-id={`cmd-tab-${id}`}
            onClick={() => (commandTab.value = id)}
          >
            {t(`cmd.tab.${id}`)}
          </button>
        ))}
        <span class="sz-cmdbar__sep" aria-hidden="true" />
        <fieldset class="sz-cmdbar__windows">
          <legend class="sz-sr">{t('cmd.windows')}</legend>
          {WINDOWS.map((w) => {
            const name = w.key ? `${t(`win.${w.id}`)} (${w.key})` : t(`win.${w.id}`);
            return (
              <button
                key={w.id}
                type="button"
                class="sz-btn sz-btn--icon"
                aria-pressed={sidePanel.value === w.id}
                aria-label={name}
                title={name}
                data-tutorial-id={`cmd-win-${w.id}`}
                onClick={() => (sidePanel.value = sidePanel.value === w.id ? null : w.id)}
              >
                <Glyph id={w.id} size={20} />
              </button>
            );
          })}
        </fieldset>
      </div>
      <div class="sz-cmdbar__items" role="tabpanel">
        {tab === 'units' &&
          UNIT_TYPE_ORDER.filter((u) => u !== 'militia').map((u: UnitTypeId) => (
            <Item
              key={u}
              id={`unit-${u}`}
              glyph={u}
              label={t(`unit.${u}`)}
              cost={fmt.format(UNITS[u].cost)}
              locked={budget < UNITS[u].cost}
              active={tool === 'build' && armed?.kind === 'unit' && armed.unit === u}
              onPick={() => arm({ kind: 'unit', unit: u })}
            />
          ))}
        {tab === 'defense' &&
          STRUCTURE_ORDER.map((k) => {
            const s = STRUCTURES[k];
            return (
              <Item
                key={k}
                id={`structure-${k}`}
                glyph={k}
                label={t(`structure.${k}`)}
                cost={s.line ? t('cmd.costPerM', { cost: fmt.format(s.cost) }) : fmt.format(s.cost)}
                locked={budget < s.cost}
                active={tool === 'build' && armed?.kind === 'structure' && armed.structure === k}
                onPick={() => arm({ kind: 'structure', structure: k })}
              />
            );
          })}
        {tab === 'civil' &&
          CIVIL.map((c) => (
            <Item
              key={c.tool}
              id={`civil-${c.tool}`}
              glyph={c.tool}
              label={`${t(`cmd.${c.tool}`)} (${c.key})`}
              cost={t('cmd.free')}
              locked={false}
              active={tool === c.tool}
              onPick={() => {
                cancelTool();
                activeTool.value = c.tool;
              }}
            />
          ))}
      </div>
    </nav>
  );
}
