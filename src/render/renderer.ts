// Pixi renderer: world container with grid and agents, camera, FPS measurement. Reads the sim only.
import { Application, Container } from 'pixi.js';
import type { CreateRenderer } from '../core/types/app';
import { Camera } from './camera';
import { FpsMeter } from './fps';
import { AgentsLayer } from './layers/agents';
import { GridLayer } from './layers/grid';
import { palette } from './palette';

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
  const grid = new GridLayer();
  const agents = new AgentsLayer(app.renderer);
  world.addChild(grid.view, agents.view);
  app.stage.addChild(world);

  const camera = new Camera(host, app.canvas, world);
  const meter = new FpsMeter();

  const applyWorldSize = (s: { widthM: number; heightM: number }): void => {
    grid.setWorldSize(s.widthM, s.heightM);
    camera.setWorldSize(s.widthM, s.heightM);
  };
  if (sim.curr) applyWorldSize(sim.curr);
  const unsub = sim.onSnapshot(applyWorldSize);

  app.renderer.on('resize', () => camera.apply());

  app.ticker.add((ticker) => {
    const now = performance.now();
    meter.tick(now);
    camera.update(ticker.deltaMS);
    grid.setZoom(camera.zoom);
    agents.update(sim.prev, sim.curr, sim.alpha(now), camera.zoom);
  });

  return {
    fps: () => meter.fps(),
    destroy: () => {
      unsub();
      camera.destroy();
      app.destroy(true, { children: true });
    },
  };
};
