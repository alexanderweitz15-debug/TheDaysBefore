// Pixi renderer: baked city map, agents, debug overlays, camera, FPS measurement. Reads the sim only.
import { Application, Container } from 'pixi.js';
import type { CreateRenderer } from '../core/types/app';
import { Camera } from './camera';
import { FpsMeter } from './fps';
import { AgentsLayer } from './layers/agents';
import { MapLayer } from './layers/map-layer';
import { OverlayLayer } from './layers/overlay';
import { palette } from './palette';
import { overlayMode } from './view-state';

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
  world.addChild(
    mapLayer.view,
    agents.civilians.view,
    agents.zombies.view,
    agents.density.view,
    overlay.view,
  );
  app.stage.addChild(world);

  const camera = new Camera(host, app.canvas, world);
  const meter = new FpsMeter();

  const onSnapshot = (s: NonNullable<typeof sim.curr>): void => {
    overlay.setWorldSize(s.widthM, s.heightM);
    camera.setWorldSize(s.widthM, s.heightM);
    agents.ingest(s);
  };
  if (sim.curr) onSnapshot(sim.curr);
  const unsub = sim.onSnapshot(onSnapshot);
  const unsubMap = sim.onMap((m) => {
    mapLayer.setMap(m);
    overlay.setMap(m);
  });

  app.renderer.on('resize', () => camera.apply());

  app.ticker.add((ticker) => {
    const now = performance.now();
    meter.tick(now);
    camera.update(ticker.deltaMS);
    mapLayer.update();
    agents.update(sim.curr, sim.alpha(now), camera.zoom);
    overlay.update(overlayMode.peek(), sim.debugField, camera.zoom);
  });

  return {
    fps: () => meter.fps(),
    destroy: () => {
      unsub();
      unsubMap();
      camera.destroy();
      app.destroy(true, { children: true });
    },
  };
};
