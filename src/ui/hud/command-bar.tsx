// Command bar (GDD 14): tabs Units (buys into the reserve) / Orders / Defense / Civil with icons and costs;
// window buttons as small icons at the right.
import type { StructureKind, UnitTypeId } from '../../core/commands';
import type { CommandSink, SimView } from '../../core/types/app';
import { STRUCTURES } from '../../data/buildings/defense';
import { BUY_SHIFT_COUNT, ORDER_TOOLS, type OrderTool } from '../../data/hud-orders';
import { UNIT_TYPE_ORDER, UNITS } from '../../data/units/present';
import { activeTool, type BuildArm, buildArm, type ToolName } from '../../render/view-state';
import { Glyph } from '../components/icons';
import { numberLocale, t, tryT } from '../i18n';
import { areaFireUnits, armAttackArea } from '../tools/attack-tool';
import { armOrder, hqPosition } from '../tools/order-tool';
import { cancelTool } from '../tools/zone-tools';
import { commandTab, type SidePanelId, sidePanel } from '../ui-state';
import { usePoll } from './use-poll';

const LOCAL_PLAYER = 0;
const TABS = ['units', 'orders', 'defense', 'civil'] as const;
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
  tool: Exclude<ToolName, 'none' | 'build' | 'attackArea' | OrderTool>;
  key: 'K' | 'Z' | 'V';
}> = [
  { tool: 'corridor', key: 'K' },
  { tool: 'safeZone', key: 'Z' },
  { tool: 'rallyPoint', key: 'V' },
];

/** Short button label if the unit has one (i18n unit.<id>.short), else the full name. */
function shortName(u: UnitTypeId): string {
  const k = `unit.${u}.short`;
  const v = tryT(k);
  return v === k ? t(`unit.${u}`) : v;
}

function arm(a: BuildArm): void {
  cancelTool();
  buildArm.value = a;
  activeTool.value = 'build';
}

interface ItemProps {
  id: string;
  glyph: string;
  label: string;
  tip?: string;
  cost: string;
  locked: boolean;
  active: boolean;
  badge?: string;
  onPick: (shift: boolean) => void;
}

function Item({ id, glyph, label, tip, cost, locked, active, badge, onPick }: ItemProps) {
  return (
    <button
      type="button"
      class="sz-btn sz-cmd"
      aria-disabled={locked ? 'true' : undefined}
      aria-pressed={active}
      title={`${tip ?? label}\n${locked ? t('cmd.noBudget') : `${t('cmd.cost')}: ${cost}`}`}
      data-tutorial-id={`cmd-${id}`}
      onClick={(e) => !locked && onPick(e.shiftKey)}
    >
      <Glyph id={glyph} />
      <span class="sz-cmd__label">{label}</span>
      <span class="sz-mono sz-cmd__cost">{cost}</span>
      {badge && <span class="sz-mono sz-cmd__badge">{badge}</span>}
    </button>
  );
}

export function CommandBar({ sim, commands }: { sim: SimView; commands: CommandSink }) {
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
              label={shortName(u)}
              tip={`${t(`unit.${u}`)}\n${t('cmd.buy.tip', { count: BUY_SHIFT_COUNT })}`}
              cost={fmt.format(UNITS[u].cost)}
              locked={budget < UNITS[u].cost}
              active={false}
              badge={t('cmd.reserve', { count: sim.reserve.idle[u] ?? 0 })}
              onPick={(shift) => {
                // Purchases go into the reserve at the HQ; the position is only a hint for the sim.
                const hq = hqPosition(sim);
                const n = shift
                  ? Math.max(1, Math.min(BUY_SHIFT_COUNT, Math.floor(budget / UNITS[u].cost)))
                  : 1;
                for (let i = 0; i < n; i++)
                  commands.submit({
                    playerId: LOCAL_PLAYER,
                    type: 'PlaceUnit',
                    payload: { unitType: u, x: hq.x, y: hq.y },
                  });
              }}
            />
          ))}
        {tab === 'orders' && (
          <>
            {ORDER_TOOLS.map((k) => (
              <Item
                key={k}
                id={`order-${k}`}
                glyph={k}
                label={t(`cmd.order.${k}`)}
                tip={`${t(`cmd.order.${k}`)}\n${t('cmd.order.tip')}`}
                cost={t(`cmd.order.${k}.how`)}
                locked={false}
                active={tool === k}
                onPick={() => armOrder(sim, k)}
              />
            ))}
            {areaFireUnits(sim).length > 0 && (
              <Item
                id="fire-support"
                glyph="mortar"
                label={t('cmd.fireSupport')}
                cost={t('cmd.fireSupport.how')}
                locked={false}
                active={tool === 'attackArea'}
                onPick={() => armAttackArea(sim)}
              />
            )}
          </>
        )}
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
