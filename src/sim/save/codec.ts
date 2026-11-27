// Generic state codec for save games. Walks an object graph (own enumerable fields), stores scalars, strings,
// arrays and objects as a JSON tree and every distinct ArrayBuffer once as a compressed block. Restoring walks
// the same graph of a freshly constructed world and overwrites it in place, so prototypes, closures and the
// aliasing of typed arrays stay intact. Objects with getState/setState (the RNG) store that state.
import { decodeBlock, encodeBlock } from './blocks';

type View =
  | Uint8Array
  | Int8Array
  | Uint8ClampedArray
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array;
type ViewCtor = new (buffer: ArrayBufferLike, byteOffset: number, length: number) => View;

const CTORS: Record<string, ViewCtor> = {
  Uint8Array,
  Int8Array,
  Uint8ClampedArray,
  Uint16Array,
  Int16Array,
  Uint32Array,
  Int32Array,
  Float32Array,
  Float64Array,
};

type Node =
  | number
  | string
  | boolean
  | null
  | Node[]
  | { $f: string }
  | { $u: 1 }
  | { $s: 1 }
  | { $r: number }
  | { $g: number[] }
  | { $v: [number, number, number, string] }
  | { $o: Record<string, Node>; $c: string };

interface Stateful {
  getState(): Uint32Array;
  setState(s: Uint32Array): void;
}

const isStateful = (v: object): v is Stateful =>
  typeof (v as Stateful).getState === 'function' && typeof (v as Stateful).setState === 'function';

function encodeNumber(v: number): Node {
  if (Number.isFinite(v) && !Object.is(v, -0)) return v;
  return { $f: Number.isNaN(v) ? 'NaN' : Object.is(v, -0) ? '-0' : v > 0 ? 'Inf' : '-Inf' };
}

function decodeNumber(f: string): number {
  return f === 'NaN' ? Number.NaN : f === '-0' ? -0 : f === 'Inf' ? Number.POSITIVE_INFINITY : -Infinity;
}

/**
 * Encodes `root`. Objects and buffers in `skip` are left out (the fresh world keeps its own value); `meta` is
 * stored beside the tree. Layout: header (8 bytes, written by the caller), JSON length, JSON, blocks.
 */
export function encodeState(
  root: object,
  skip: ReadonlySet<object>,
  meta: unknown,
  header: Uint8Array,
): Uint8Array {
  const objIds = new Map<object, number>();
  const bufIds = new Map<ArrayBufferLike, number>();
  const buffers: { buffer: ArrayBufferLike; width: number }[] = [];
  let nextObj = 0;

  const visit = (v: unknown): Node => {
    if (v === undefined) return { $u: 1 };
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
    if (typeof v === 'number') return encodeNumber(v);
    if (typeof v !== 'object') return { $u: 1 };
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
      const view = v as View;
      if (skip.has(view) || skip.has(view.buffer)) return { $s: 1 };
      let id = bufIds.get(view.buffer);
      if (id === undefined) {
        id = buffers.length;
        bufIds.set(view.buffer, id);
        buffers.push({ buffer: view.buffer, width: view.BYTES_PER_ELEMENT });
      }
      return { $v: [id, view.byteOffset, view.length, view.constructor.name] };
    }
    if (skip.has(v)) return { $s: 1 };
    const seen = objIds.get(v);
    if (seen !== undefined) return { $r: seen };
    objIds.set(v, nextObj++);
    if (Array.isArray(v)) return v.map(visit);
    if (isStateful(v)) return { $g: Array.from(v.getState()) };
    const fields: Record<string, Node> = {};
    for (const k of Object.keys(v)) {
      const f = (v as Record<string, unknown>)[k];
      if (typeof f !== 'function') fields[k] = visit(f);
    }
    return { $o: fields, $c: (v as object).constructor?.name ?? 'Object' };
  };

  const tree = visit(root);
  const json = new TextEncoder().encode(JSON.stringify({ meta, tree }));
  const blocks = buffers.map((b) => encodeBlock(new Uint8Array(b.buffer), b.width));
  let size = header.length + 4 + json.length;
  for (const b of blocks) size += b.length;
  const out = new Uint8Array(size);
  out.set(header, 0);
  let pos = header.length;
  new DataView(out.buffer).setUint32(pos, json.length, true);
  pos += 4;
  out.set(json, pos);
  pos += json.length;
  for (const b of blocks) {
    out.set(b, pos);
    pos += b.length;
  }
  return out;
}

/** Reads the meta object stored by encodeState without restoring anything. */
export function readMeta(bytes: Uint8Array, headerLength: number): unknown {
  return parse(bytes, headerLength).doc.meta;
}

function parse(bytes: Uint8Array, headerLength: number): { doc: { meta: unknown; tree: Node }; pos: number } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = dv.getUint32(headerLength, true);
  const start = headerLength + 4;
  const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + len)));
  return { doc, pos: start + len };
}

/** Restores state written by encodeState into the freshly constructed `root` (same classes, same layout). */
export function decodeState(root: object, bytes: Uint8Array, headerLength: number): void {
  const { doc, pos: blocksAt } = parse(bytes, headerLength);
  // Block offsets, decoded lazily on first use.
  const offsets: number[] = [];
  for (let pos = blocksAt; pos < bytes.length; ) {
    offsets.push(pos);
    pos += new DataView(bytes.buffer, bytes.byteOffset + pos, 12).getUint32(8, true) + 12;
  }
  const restored: (ArrayBufferLike | undefined)[] = [];
  const claimed = new Set<ArrayBufferLike>();
  const objs: object[] = [];

  const bufferFor = (id: number, fresh: unknown): ArrayBufferLike => {
    const have = restored[id];
    if (have) return have;
    const at = offsets[id];
    if (at === undefined) throw new Error(`save: missing block ${id}`);
    const byteLength = new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(0, true);
    let buf: ArrayBufferLike;
    if (ArrayBuffer.isView(fresh) && fresh.buffer.byteLength === byteLength && !claimed.has(fresh.buffer))
      buf = fresh.buffer;
    else buf = new ArrayBuffer(byteLength);
    claimed.add(buf);
    decodeBlock(bytes, at, new Uint8Array(buf));
    restored[id] = buf;
    return buf;
  };

  const restore = (
    holder: Record<string | number, unknown>,
    key: string | number,
    node: Node,
    path: string,
  ): void => {
    const fresh = holder[key];
    if (node === null || typeof node !== 'object') {
      holder[key] = node;
      return;
    }
    if (Array.isArray(node)) {
      const arr = Array.isArray(fresh) ? fresh : [];
      objs.push(arr);
      arr.length = node.length;
      for (let i = 0; i < node.length; i++) restore(arr as never, i, node[i] as Node, `${path}[${i}]`);
      holder[key] = arr;
      return;
    }
    if ('$f' in node) holder[key] = decodeNumber(node.$f);
    else if ('$u' in node) holder[key] = undefined;
    else if ('$s' in node) return;
    else if ('$r' in node) {
      const o = objs[node.$r];
      if (!o) throw new Error(`save: bad reference at ${path}`);
      holder[key] = o;
    } else if ('$g' in node) {
      if (!fresh || typeof fresh !== 'object' || !isStateful(fresh))
        throw new Error(`save: no state at ${path}`);
      objs.push(fresh);
      fresh.setState(Uint32Array.from(node.$g));
    } else if ('$v' in node) {
      const [id, off, len, type] = node.$v;
      const Ctor = CTORS[type];
      if (!Ctor) throw new Error(`save: unknown array type ${type} at ${path}`);
      const buf = bufferFor(id, fresh);
      const ok =
        fresh instanceof Ctor &&
        fresh.buffer === buf &&
        fresh.byteOffset === off &&
        (fresh as View).length === len;
      if (!ok) holder[key] = new Ctor(buf, off, len);
    } else {
      let obj = fresh as Record<string, unknown> | null | undefined;
      const cls = node.$c;
      if (!obj || typeof obj !== 'object') {
        if (cls !== 'Object') throw new Error(`save: cannot create ${cls} at ${path}`);
        obj = {};
        holder[key] = obj;
      } else if ((obj.constructor?.name ?? 'Object') !== cls) {
        throw new Error(`save: ${path} is ${obj.constructor?.name}, saved ${cls}`);
      }
      objs.push(obj);
      for (const k of Object.keys(node.$o)) restore(obj, k, node.$o[k] as Node, `${path}.${k}`);
    }
  };

  const holder = { root } as Record<string, unknown>;
  restore(holder, 'root', doc.tree, 'root');
  if (holder.root !== root) throw new Error('save: root replaced');
}
