// Re-renders a component every HUD_REFRESH_MS so it can read sim.stats and sim.units.
import { useEffect, useState } from 'preact/hooks';
import { HUD_REFRESH_MS } from '../../data/hud';

export function usePoll(ms: number = HUD_REFRESH_MS): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((v) => v + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return n;
}
