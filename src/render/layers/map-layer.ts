// Static city map baked once into texture tiles (GDD 4 Rendering). Re-baked only when the 3D setting changes.
import { Container, Graphics, type Renderer, RenderTexture, Sprite } from 'pixi.js';
import type { CityMapData } from '../../core/types/map';
import { MAP_BAKE_BUDGET_MS, MAP_PX_PER_M, MAP_TILE_M } from '../../data/render';
import { settings } from '../../ui/settings/store';
import { drawBuildings, sortBuildings } from '../map/buildings';
import { drawRoads } from '../map/roads';
import { drawTerrain } from '../map/terrain';

interface Tile {
  sprite: Sprite;
  texture: RenderTexture;
  tx: number;
  ty: number;
}

export class MapLayer {
  readonly view = new Container();
  private map: CityMapData | null = null;
  private order: Int32Array = new Int32Array(0);
  private tiles: Tile[] = [];
  private queue: number[] = [];
  private bakedThree = true;

  constructor(private readonly renderer: Renderer) {}

  setMap(map: CityMapData): void {
    this.clear();
    this.map = map;
    this.order = sortBuildings(map);
    const worldW = map.widthCells * map.cellSizeM;
    const worldH = map.heightCells * map.cellSizeM;
    const nx = Math.ceil(worldW / MAP_TILE_M);
    const ny = Math.ceil(worldH / MAP_TILE_M);
    const px = MAP_TILE_M * MAP_PX_PER_M;
    for (let ty = 0; ty < ny; ty++) {
      for (let tx = 0; tx < nx; tx++) {
        const texture = RenderTexture.create({
          width: px,
          height: px,
        });
        texture.source.style.scaleMode = 'linear';
        const sprite = new Sprite(texture);
        sprite.position.set(tx * MAP_TILE_M, ty * MAP_TILE_M);
        sprite.scale.set(1 / MAP_PX_PER_M);
        sprite.visible = false;
        this.view.addChild(sprite);
        this.tiles.push({ sprite, texture, tx, ty });
      }
    }
    this.requeue();
  }

  private requeue(): void {
    this.bakedThree = settings.buildings3d.peek();
    this.queue = this.tiles.map((_, i) => i);
  }

  private clear(): void {
    for (const t of this.tiles) t.texture.destroy(true);
    for (const c of this.view.removeChildren()) c.destroy();
    this.tiles = [];
    this.queue = [];
  }

  private bake(tile: Tile, map: CityMapData): void {
    const x0 = tile.tx * MAP_TILE_M;
    const y0 = tile.ty * MAP_TILE_M;
    const rect = { x0, y0, x1: x0 + MAP_TILE_M, y1: y0 + MAP_TILE_M };
    const g = new Graphics();
    drawTerrain(g, map, rect);
    drawRoads(g, map, rect);
    drawBuildings(g, map, rect, this.order, this.bakedThree);
    const root = new Container();
    root.scale.set(MAP_PX_PER_M);
    root.position.set(-x0 * MAP_PX_PER_M, -y0 * MAP_PX_PER_M);
    root.addChild(g);
    this.renderer.render({ container: root, target: tile.texture, clear: true });
    root.destroy({ children: true });
    tile.sprite.visible = true;
  }

  /** Bakes queued tiles within a time budget per frame. */
  update(): void {
    const map = this.map;
    if (!map) return;
    if (settings.buildings3d.peek() !== this.bakedThree && this.queue.length === 0) this.requeue();
    const start = performance.now();
    while (this.queue.length > 0 && performance.now() - start < MAP_BAKE_BUDGET_MS) {
      const tile = this.tiles[this.queue.shift() as number];
      if (tile) this.bake(tile, map);
    }
  }

  /** Fraction of tiles baked, for the loading hint. */
  get progress(): number {
    return this.tiles.length === 0 ? 0 : 1 - this.queue.length / this.tiles.length;
  }
}
