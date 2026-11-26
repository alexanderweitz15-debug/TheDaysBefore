// Dev harness: renders the fixture city with a fake SimView. Open /src/render/dev/harness.html with `pnpm dev`.
import type { SimView } from '../../core/types/app';
import type { CityMapData } from '../../core/types/map';
import { writeSnapshotHeader } from '../../core/types/snapshot';
import type { ZoneView } from '../../core/types/zones';
import { mountUi } from '../../ui/app';
import { createRenderer } from '../renderer';
import { fixtureMap } from './fixture-map';

const map = fixtureMap(250);
const w = map.widthCells * map.cellSizeM;
const zc = Number(new URLSearchParams(location.search).get('z') ?? 3000);
const cc = 800;
const buf = new ArrayBuffer(8 * 4 + (zc + cc + 400) * 13 + 64);
const snap = writeSnapshotHeader(buf, 1, w, w, zc, cc, 400);
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
const sim: SimView = {
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
    counters: { sheltered: 76, incubating: 3, civiliansDead: 12, zombiesKilled: 0, outbreakTick: 10 },
  },
  zones,
  onZones: (cb) => {
    cb(zones);
    return () => undefined;
  },
  onSnapshot: () => () => undefined,
  map,
  onMap: (cb: (m: CityMapData) => void) => {
    cb(map);
    return () => undefined;
  },
  debugField: null,
  requestDebugField: () => undefined,
};
const renderer = await createRenderer(document.getElementById('map') as HTMLElement, sim);
mountUi(document.getElementById('ui') as HTMLElement, {
  sim,
  commands: { submit: () => undefined },
  renderer,
});
