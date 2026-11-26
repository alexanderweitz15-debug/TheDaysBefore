// Dev harness: renders the fixture city with a fake SimView. Open /src/render/dev/harness.html with `pnpm dev`.
import type { SimView } from '../../core/types/app';
import type { CityMapData } from '../../core/types/map';
import { writeSnapshotHeader } from '../../core/types/snapshot';
import { mountUi } from '../../ui/app';
import { createRenderer } from '../renderer';
import { fixtureMap } from './fixture-map';

const map = fixtureMap(250);
const w = map.widthCells * map.cellSizeM;
const zc = Number(new URLSearchParams(location.search).get('z') ?? 3000);
const cc = 800;
const buf = new ArrayBuffer(8 * 4 + (zc + cc) * 13 + 8);
const snap = writeSnapshotHeader(buf, 1, w, w, zc, cc);
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
