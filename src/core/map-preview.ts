// Main-thread helper: generates a city map in a throwaway worker (briefing preview).
import type { MapRequest, MapResponse } from './map-worker';
import type { CityMapData, CitySize } from './types/map';

export function requestMap(seed: number, size: CitySize): Promise<CityMapData> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./map-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<MapResponse>) => {
      worker.terminate();
      resolve(ev.data.map);
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    worker.postMessage({ seed, size } satisfies MapRequest);
  });
}
