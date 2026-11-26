// Bootstrap: worker-backed simulation, renderer, UI overlay.
import { SimClient } from './core/sim-client';
import { createRenderer } from './render/renderer';
import { mountUi } from './ui/app';

const SEED = 0x5e2201;

async function boot(): Promise<void> {
  const mapHost = document.getElementById('map');
  const uiRoot = document.getElementById('ui');
  if (!mapHost || !uiRoot) throw new Error('index.html is missing #map or #ui');
  const sim = new SimClient(SEED, 'medium', (err) => {
    console.error('Simulation crashed', err.message, { seed: err.seed, commands: err.commandLog.length });
  });
  const renderer = await createRenderer(mapHost, sim);
  mountUi(uiRoot, { sim, commands: sim, renderer });
}

void boot();
