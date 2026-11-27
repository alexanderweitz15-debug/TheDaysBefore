// Pixi renderer: baked city map, agents, debug overlays, camera, FPS measurement. Reads the sim only.
import { Application, Container } from 'pixi.js';
import type { CreateRenderer } from '../core/types/app';
import { Camera } from './camera';
import { FpsMeter } from './fps';
import { AgentsLayer } from './layers/agents';
import { PreviewLayer } from './layers/build-preview';
import { CorpseLayer } from './layers/corpses';
import { EconomyLayer } from './layers/economy-marks';
import { FxLayer } from './layers/fx';
import { MapLayer } from './layers/map-layer';
import { OverlayLayer } from './layers/overlay';
import { ProjectilesLayer } from './layers/projectiles';
import { SelectionLayer } from './layers/selection';
import { StructuresLayer } from './layers/structures';
import { UnitsLayer } from './layers/units';
import { ZonesLayer } from './layers/zones';
import { palette } from './palette';
import { mapBake, overlayMode, repurposeTarget, selectedStructure } from './view-state';

export const createRenderer: CreateRenderer = async (host, sim) => {
  const app = new Application();
  await app.init({
    resizeTo: host,
    background: palette.background,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  host.appendChild(app.canvas);

  const world = new Container();
  const mapLayer = new MapLayer(app.renderer);
  const agents = new AgentsLayer(app.renderer);
  const overlay = new OverlayLayer();
  const corpses = new CorpseLayer(app.renderer);
  const zones = new ZonesLayer();
  const selection = new SelectionLayer();
  const structures = new StructuresLayer();
  const units = new UnitsLayer();
  const projectiles = new ProjectilesLayer();
  const fx = new FxLayer(app.renderer);
  const preview = new PreviewLayer();
  const economy = new EconomyLayer();
  world.addChild(
    mapLayer.view,
    corpses.view,
    fx.ground,
    zones.view,
    structures.view,
    ...agents.civilianViews.map((c) => c.view),
    ...agents.zombieSets.map((z) => z.view),
    agents.density.view,
    units.view,
    projectiles.view,
    fx.view,
    selection.view,
    economy.view,
    preview.view,
    overlay.view,
  );
  app.stage.addChild(world);

  const camera = new Camera(host, app.canvas, world);
  const meter = new FpsMeter();

  const onSnapshot = (s: NonNullable<typeof sim.curr>): void => {
    overlay.setWorldSize(s.widthM, s.heightM);
    camera.setWorldSize(s.widthM, s.heightM);
    agents.ingest(s);
    units.ingest(s);
    projectiles.ingest(s);
    fx.ingest(s, performance.now());
  };
  if (sim.curr) onSnapshot(sim.curr);
  const unsub = sim.onSnapshot(onSnapshot);
  const unsubZones = sim.onZones((z) => zones.setZones(z));
  const unsubStructures = sim.onStructures((list) => structures.setStructures(list));
  const unsubMap = sim.onMap((m) => {
    camera.refit();
    mapLayer.setMap(m);
    overlay.setMap(m);
    economy.setMap(m);
    mapBake.map = m;
    mapBake.progress = 0;
  });

  app.renderer.on('resize', () => camera.apply());

  app.ticker.add((ticker) => {
    const now = performance.now();
    meter.tick(now);
    camera.update(ticker.deltaMS);
    mapLayer.update();
    mapBake.progress = mapLayer.progress;
    agents.update(sim.curr, sim.alpha(now), camera.zoom, now);
    corpses.update(sim.curr?.corpses ?? null, camera.zoom);
    zones.update(camera.zoom);
    const alpha = sim.alpha(now);
    structures.update(camera.zoom, selectedStructure.peek(), now);
    units.update(sim.units, alpha, camera.zoom, now);
    projectiles.update(alpha, camera.zoom);
    if (fx.update(ticker.deltaMS, camera.zoom, now)) camera.apply();
    economy.update(sim.mission, repurposeTarget.peek(), camera.zoom);
    preview.update(sim, camera.zoom, now);
    selection.update(sim.curr?.units ?? null, camera.zoom);
    overlay.update(overlayMode.peek(), sim.debugField, camera.zoom);
  });

  return {
    fps: () => meter.fps(),
    destroy: () => {
      unsub();
      unsubMap();
      unsubZones();
      unsubStructures();
      fx.destroy();
      camera.destroy();
      app.destroy(true, { children: true });
    },
  };
};
