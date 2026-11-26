// Road graph edges of one tile: rail first, then street/main/bridge, each with a dark casing below the fill.
import type { Graphics } from 'pixi.js';
import { type CityMapData, ROAD_KINDS } from '../../core/types/map';
import { palette } from '../palette';
import { intersects, type Rect } from './rect';

type Kind = (typeof ROAD_KINDS)[number];

const FILL: Record<Kind, number> = {
  street: palette.map.roadStreet,
  main: palette.map.roadMain,
  bridge: palette.map.bridge,
  rail: palette.map.rail,
};
const CASING: Record<Kind, number> = {
  street: palette.map.roadCasing,
  main: palette.map.roadCasing,
  bridge: palette.map.bridgeCasing,
  rail: palette.map.roadCasing,
};
const ORDER: readonly Kind[] = ['rail', 'street', 'main', 'bridge'];
const CASING_EXTRA_M = 1.5;

export function drawRoads(g: Graphics, map: CityMapData, r: Rect): void {
  const rd = map.roads;
  // Group visible edges by kind and width so each group is a single stroke.
  const groups = new Map<number, number[]>();
  for (let e = 0; e < rd.edgeCount; e++) {
    const a = rd.edgeA[e] as number;
    const b = rd.edgeB[e] as number;
    const ax = rd.nodeX[a] as number;
    const ay = rd.nodeY[a] as number;
    const bx = rd.nodeX[b] as number;
    const by = rd.nodeY[b] as number;
    const pad = (rd.edgeWidth[e] as number) + CASING_EXTRA_M;
    const box: Rect = {
      x0: Math.min(ax, bx) - pad,
      y0: Math.min(ay, by) - pad,
      x1: Math.max(ax, bx) + pad,
      y1: Math.max(ay, by) + pad,
    };
    if (!intersects(box, r)) continue;
    const key = (rd.edgeKind[e] as number) * 256 + (rd.edgeWidth[e] as number);
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  const path = (edges: number[]): void => {
    for (const e of edges) {
      const a = rd.edgeA[e] as number;
      const b = rd.edgeB[e] as number;
      g.moveTo(rd.nodeX[a] as number, rd.nodeY[a] as number).lineTo(
        rd.nodeX[b] as number,
        rd.nodeY[b] as number,
      );
    }
  };
  for (const kind of ORDER) {
    const kindIdx = ROAD_KINDS.indexOf(kind);
    const keys = [...groups.keys()].filter((k) => Math.floor(k / 256) === kindIdx).sort((x, y) => x - y);
    for (const k of keys) {
      path(groups.get(k) as number[]);
      g.stroke({ width: (k % 256) + CASING_EXTRA_M, color: CASING[kind], cap: 'round', join: 'round' });
    }
    for (const k of keys) {
      path(groups.get(k) as number[]);
      g.stroke({ width: Math.max(1, k % 256), color: FILL[kind], cap: 'round', join: 'round' });
      if (kind === 'rail') {
        path(groups.get(k) as number[]);
        g.stroke({ width: 0.6, color: palette.map.railTie, cap: 'butt' });
      }
    }
  }
}
