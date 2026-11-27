// Dev harness: renders the fixture city with a fake SimView. Open /src/render/dev/harness.html with `pnpm dev`.
import type { SimView } from '../../core/types/app';
import type { StructureView, UnitView } from '../../core/types/combat';
import type { CityMapData } from '../../core/types/map';
import type { ScenarioDef } from '../../core/types/mission';
import { writeSnapshotHeader } from '../../core/types/snapshot';
import type { ZoneView } from '../../core/types/zones';
import { mountUi } from '../../ui/app';
import { activeScenario, commandTab, menuVisible, orderDraft } from '../../ui/ui-state';
import { createRenderer } from '../renderer';
import { activeTool, buildArm, jumpCamera, selectedStructure, toolDraft } from '../view-state';
import { fixtureMap } from './fixture-map';

const map = fixtureMap(250);
const w = map.widthCells * map.cellSizeM;
const q = new URLSearchParams(location.search);
const zc = Number(q.get('z') ?? 3000);
const cc = 800;
const buf = new ArrayBuffer(16 * 4 + (zc + cc + 400 + 8 + 12 + 7) * 13 + 8 * 16 + 64);
const snap = writeSnapshotHeader(
  buf,
  1,
  w,
  w,
  { zombies: zc, civilians: cc, corpses: 400, units: 7, projectiles: 12 },
  8,
);
for (let i = 0; i < zc; i++) {
  snap.zombies.ids[i] = i;
  snap.zombies.pos[i * 2] = 200 + ((i * 37) % 600);
  snap.zombies.pos[i * 2 + 1] = 200 + ((i * 91) % 500);
}
for (let i = 0; i < cc; i++) {
  snap.civilians.ids[i] = i;
  snap.civilians.pos[i * 2] = 600 + ((i * 53) % 700);
  snap.civilians.pos[i * 2 + 1] = 500 + ((i * 17) % 400);
}
for (let i = 0; i < zc; i++)
  snap.zombies.kind[i] = i % 50 === 0 ? 1 : i % 97 === 0 ? 2 : i % 400 === 0 ? 3 : 0;
snap.zombies.kind[0] = 4;
for (let i = 0; i < cc; i++) snap.civilians.kind[i] = i % 9 === 0 ? 3 : i % 13 === 0 ? 6 : 1;
for (let i = 0; i < 400; i++) {
  snap.corpses.ids[i] = i;
  snap.corpses.pos[i * 2] = 650 + ((i * 41) % 500);
  snap.corpses.pos[i * 2 + 1] = 520 + ((i * 29) % 300);
  snap.corpses.kind[i] = 0;
}
const unitTypes = [
  'infantry',
  'mgTeam',
  'sniperTeam',
  'mortar',
  'engineers',
  'riotPolice',
  'medics',
] as const;
for (let i = 0; i < 7; i++) {
  snap.units.ids[i] = i;
  snap.units.pos[i * 2] = 900 + i * 10;
  snap.units.pos[i * 2 + 1] = 500;
  snap.units.kind[i] = i;
}
const units: UnitView[] = unitTypes.map((type, i) => ({
  id: i,
  type,
  members: [8, 6, 2, 3, 4, 6, 2][i] as number,
  hp: [1, 0.6, 0.2, 0.08, 1, 0.9, 1][i] as number,
  ammo: [0.9, 0.4, 1, 0.2, 1, 1, 1][i] as number,
  stance: 'hold',
  fireMode: 'free',
  target: i === 1 ? [960, 500] : null,
  morale: 0.8,
  rank: (i % 3) as 0 | 1 | 2,
}));
// Projectiles: bullets flying east, one shell.
for (let i = 0; i < 12; i++) {
  snap.projectiles.ids[i] = i;
  snap.projectiles.pos[i * 2] = 910 + i * 3;
  snap.projectiles.pos[i * 2 + 1] = 495 + (i % 4);
  snap.projectiles.kind[i] = i === 11 ? 1 : 0;
}
const mk = (
  id: number,
  kind: StructureView['kind'],
  shape: number[],
  o: Partial<StructureView> = {},
): StructureView => ({
  id,
  kind,
  shape,
  rotation: 0,
  hp: 800,
  maxHp: 800,
  state: 'done',
  progress: 1,
  flag: false,
  ...o,
});
const structures: StructureView[] = [
  mk(1, 'wall', [850, 560, 960, 560]),
  mk(2, 'wall', [850, 575, 960, 575], { hp: 300 }),
  mk(3, 'wall', [850, 590, 960, 590], { hp: 60 }),
  mk(4, 'wall', [850, 605, 960, 605], { state: 'building', progress: 0.5, hp: 400 }),
  mk(5, 'wall', [850, 620, 960, 620], { state: 'destroyed', hp: 0 }),
  mk(6, 'barricade', [700, 660, 780, 675], { maxHp: 150, hp: 150 }),
  mk(7, 'wire', [700, 690, 780, 700], { maxHp: 60, hp: 60 }),
  mk(8, 'gate', [810, 660], { flag: false, maxHp: 1200, hp: 1200 }),
  mk(9, 'gate', [810, 685], { flag: true, maxHp: 1200, hp: 1200 }),
  mk(10, 'mines', [860, 690], { maxHp: 1, hp: 1 }),
  mk(11, 'charge', [900, 660], { flag: true, maxHp: 50, hp: 50 }),
  mk(12, 'watchtower', [900, 700], { maxHp: 400, hp: 400 }),
  mk(13, 'depot', [945, 690], { maxHp: 600, hp: 450 }),
  mk(14, 'watchtower', [945, 740], { state: 'destroyed', hp: 0, maxHp: 400 }),
];
const zones: ZoneView[] = [
  { id: 1, kind: 'safeZone', shape: [700, 600, 900, 760], capacity: 200, occupants: 64, breached: false },
  { id: 2, kind: 'safeZone', shape: [1000, 600, 1150, 700], capacity: 100, occupants: 12, breached: true },
  {
    id: 3,
    kind: 'corridor',
    shape: [400, 700, 600, 700, 700, 800],
    capacity: 0,
    occupants: 0,
    breached: false,
  },
  { id: 4, kind: 'rallyPoint', shape: [1200, 900], capacity: 80, occupants: 5, breached: false },
];
const listeners: ((s: typeof snap) => void)[] = [];
const withOrders = q.has('orders');
const sim: SimView = {
  orders: withOrders
    ? [
        {
          id: 1,
          kind: 'defendLine',
          shape: [800, 700, 1100, 640],
          buildingId: -1,
          requested: { infantry: 3, mgTeam: 1 },
          assigned: [1, 2, 3],
          inPosition: 2,
          stance: 'hold',
          status: 'active',
        },
        {
          id: 2,
          kind: 'holdZone',
          shape: [1200, 800, 1450, 950],
          buildingId: -1,
          requested: { infantry: 2 },
          assigned: [],
          inPosition: 0,
          stance: 'hold',
          status: 'pending',
        },
        {
          id: 3,
          kind: 'occupyBuilding',
          shape: [900, 900],
          buildingId: 5,
          requested: { infantry: 1 },
          assigned: [4],
          inPosition: 1,
          stance: 'hold',
          status: 'active',
        },
        {
          id: 4,
          kind: 'occupyBuilding',
          shape: [900, 900],
          buildingId: 9,
          requested: { infantry: 1 },
          assigned: [5],
          inPosition: 1,
          stance: 'hold',
          status: 'failing',
        },
      ]
    : [],
  reserve: withOrders ? { idle: { infantry: 2, sniperTeam: 1 }, returning: 1 } : { idle: {}, returning: 0 },
  garrisons: withOrders
    ? [
        { buildingId: 5, unitIds: [4], integrity: 0.8 },
        { buildingId: 9, unitIds: [5], integrity: 0.2 },
      ]
    : [],
  prev: null,
  curr: snap,
  alpha: () => 1,
  stats: {
    tick: 1,
    speed: 1,
    ticksPerSecond: 20,
    tickMsAvg: 1,
    tickMsMax: 2,
    zombies: zc,
    civilians: cc,
    worldGenMs: 42,
    corpses: 400,
    counters: {
      sheltered: 76,
      incubating: 3,
      civiliansDead: 12,
      zombiesKilled: 0,
      outbreakTick: 10,
      collateralKills: 1,
      soldiersLost: 2,
      budget: 1000,
    },
  },
  units,
  structures,
  onStructures: (cb) => {
    cb(structures);
    return () => undefined;
  },
  zones,
  onZones: (cb) => {
    cb(zones);
    return () => undefined;
  },
  onSnapshot: (cb) => {
    listeners.push(cb);
    return () => undefined;
  },
  map,
  onMap: (cb: (m: CityMapData) => void) => {
    cb(map);
    return () => undefined;
  },
  debugField: null,
  requestDebugField: () => undefined,
  mission: null,
  debrief: null,
  onDebrief: () => () => undefined,
};
const renderer = await createRenderer(document.getElementById('map') as HTMLElement, sim);
mountUi(document.getElementById('ui') as HTMLElement, {
  sim,
  commands: { submit: () => undefined },
  session: {
    restart: () => undefined,
    save: () => Promise.reject(new Error('harness')),
    load: () => undefined,
    replay: () => Promise.reject(new Error('harness')),
    verifyReplay: () => Promise.reject(new Error('harness')),
  },
  renderer,
});

menuVisible.value = false;
if (q.has('hud')) activeScenario.value = {} as ScenarioDef;
if (q.has('tab')) commandTab.value = q.get('tab') as 'orders';
// Scenario from the URL: ?zoom=4&cx=920&cy=520&sel=13&tool=attack|wall|mine&fx=1
const zoom = Number(q.get('zoom') ?? 0);
if (zoom > 0) jumpCamera(Number(q.get('cx') ?? 920), Number(q.get('cy') ?? 520), zoom);
if (q.has('sel')) selectedStructure.value = Number(q.get('sel'));
const tool = q.get('tool');
if (tool === 'order') {
  orderDraft.value = { kind: 'defendLine', squads: { infantry: 1 }, stance: 'hold' };
  activeTool.value = 'defendLine';
  toolDraft.startX = 700;
  toolDraft.startY = 500;
  toolDraft.cursorX = 1000;
  toolDraft.cursorY = 560;
} else if (tool === 'attack') {
  activeTool.value = 'attackArea';
  toolDraft.cursorX = 960;
  toolDraft.cursorY = 560;
} else if (tool === 'wall' || tool === 'mine') {
  activeTool.value = 'build';
  buildArm.value = { kind: 'structure', structure: tool === 'wall' ? 'wall' : 'mines' };
  toolDraft.startX = tool === 'wall' ? 850 : Number.NaN;
  toolDraft.startY = 650;
  toolDraft.cursorX = tool === 'wall' ? 950 : 900;
  toolDraft.cursorY = tool === 'wall' ? 660 : 650;
}
// Effects: a burst of events per tick (shots, impacts, one explosion every 2 s).
if (q.get('fx') === '1') {
  let tick = 2;
  window.setInterval(() => {
    const s = writeSnapshotHeader(
      buf,
      tick++,
      w,
      w,
      { zombies: zc, civilians: cc, corpses: 400, units: 7, projectiles: 12 },
      8,
    );
    const ev: number[][] = [
      [0, 905, 500, 0],
      [0, 915, 500, 0.1],
      [1, 970, 505, 0],
      [1, 972, 500, 0],
      [3, 960, 560, 0],
      [3, 962, 560, 0],
      [5, 940, 540, 0],
      tick % 40 === 0 ? [2, 990, 520, 12] : [4, 860, 690, 8],
    ];
    for (let i = 0; i < ev.length; i++) s.fx.set(ev[i] as number[], i * 4);
    if (tick % 40 !== 0 && tick % 20 !== 0) s.fx.set([1, 975, 502, 0], 7 * 4);
    for (const cb of listeners) cb(s);
  }, 50);
}
