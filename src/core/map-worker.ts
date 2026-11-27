// Map-only worker for previews (briefing): generates the scenario city without starting a simulation.
// UI and render must not import src/sim, so they ask core for the map and draw it themselves.
import { generateCity } from '../sim/map/generate';
import type { CityMapData, CitySize } from './types/map';

export interface MapRequest {
  seed: number;
  size: CitySize;
}

export interface MapResponse {
  map: CityMapData;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (ev: MessageEvent<MapRequest>) => {
  const map = generateCity(ev.data.seed, ev.data.size);
  scope.postMessage({ map } satisfies MapResponse);
};
