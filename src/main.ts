// Bootstrap: worker-backed simulation, renderer, UI overlay.
import { SimClient } from './core/sim-client';
import { FREE_MODE } from './data/scenarios';
import { createRenderer } from './render/renderer';
import { mountUi } from './ui/app';

async function boot(): Promise<void> {
  const mapHost = document.getElementById('map');
  const uiRoot = document.getElementById('ui');
  if (!mapHost || !uiRoot) throw new Error('index.html is missing #map or #ui');
  const sim = new SimClient(FREE_MODE.seed, FREE_MODE.size, (err) => {
    console.error('Simulation crashed', err.message, { seed: err.seed, commands: err.commandLog.length });
  });
  const renderer = await createRenderer(mapHost, sim);
  mountUi(uiRoot, { sim, commands: sim, session: sim, renderer });
}

void boot();
