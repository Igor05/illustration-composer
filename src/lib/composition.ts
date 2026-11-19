import { sizeItem, type Format, type LayoutId, type ObjState, type Palette, type SizeId } from '../library/catalog';
import { recolor } from './recolor';

export interface Asset { vb: [number, number, number, number]; inner: string }

export interface Instance {
  uid: string;
  objId: string;
  state: ObjState;
  /** centre of the object on the canvas */
  x: number;
  y: number;
  rot: number;
}

export interface Composition {
  size: SizeId;
  format: Format;
  palette: Palette;
  layout: LayoutId;
  /** one scale for every object: keeps the proportions between objects exactly as drawn */
  scale: number;
  decor: boolean;
  items: Instance[]; // array order = layer order, last is on top
}

const cache = new Map<string, Promise<Asset>>();

/** Loads an untouched library SVG and keeps its viewBox + inner markup. */
export function loadAsset(size: SizeId, objId: string, state: ObjState | 'decor'): Promise<Asset> {
  const key = state === 'decor' ? 'decor' : `${objId}.${state}`;
  const item = sizeItem(size, key);
  if (!item) return Promise.reject(new Error(`Нет объекта ${key} в размере ${size}`));
  const url = `${import.meta.env.BASE_URL}${item.file}`;
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((r) => r.text()).then((txt) => {
      const vb = (txt.match(/viewBox="([^"]+)"/)?.[1] || '0 0 1 1').split(/\s+/).map(Number) as Asset['vb'];
      const inner = txt.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
      return { vb, inner };
    }));
  }
  return cache.get(url)!;
}

export const assetKey = (size: SizeId, i: Pick<Instance, 'objId' | 'state'>) => `${size}:${i.objId}.${i.state}`;

let n = 0;
export const uid = () => `o${Date.now().toString(36)}${(n++).toString(36)}`;

/** Seeded random so "перемешать" is reproducible for the same seed. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

interface Region { x: number; y: number; w: number; h: number }
function regionFor(layout: LayoutId, f: Format): Region {
  const { w, h } = f;
  if (layout === 'title') return w >= h ? { x: w * 0.44, y: h * 0.06, w: w * 0.54, h: h * 0.88 } : { x: w * 0.06, y: h * 0.42, w: w * 0.88, h: h * 0.52 };
  if (layout === 'offset') return w >= h ? { x: w * 0.34, y: h * 0.14, w: w * 0.76, h: h * 0.96 } : { x: w * 0.1, y: h * 0.3, w: w * 1.05, h: h * 0.85 };
  return { x: w * 0.06, y: h * 0.06, w: w * 0.88, h: h * 0.88 };
}

/**
 * Automatic layout: greedy cluster packing.
 * 1. The largest main object goes in the centre, every next one is tried on rings
 *    around the cluster and placed at the closest spot where it overlaps its
 *    neighbours only a little (objects may tuck behind each other, as in the examples).
 * 2. The finished cluster gets ONE shared scale to fill the template region,
 *    so the proportions between objects never change.
 * Background objects are packed after the main ones and go to the lower layers.
 */
export function autoLayout(
  main: string[], bg: string[], sizes: Record<string, { w: number; h: number }>, layout: LayoutId, f: Format, seed = 1,
): { items: Instance[]; scale: number } {
  if (!main.length && !bg.length) return { items: [], scale: 0.5 };
  const r = regionFor(layout, f);
  const rand = rng(seed);
  const entries = [
    ...main.map((id) => ({ id, state: 'main' as const })).sort((a, b) => area(b) - area(a)),
    ...bg.map((id) => ({ id, state: 'bg' as const })),
  ];
  function area(o: { id: string; state: ObjState }) { const s = sizes[`${o.id}.${o.state}`]; return s ? s.w * s.h : 0; }

  type Box = { x: number; y: number; w: number; h: number; state: ObjState };
  const boxes: Box[] = [];
  const targetAspect = r.w / r.h;
  const angleShift = rand() * Math.PI * 2;
  for (const e of entries) {
    const s = sizes[`${e.id}.${e.state}`] || { w: 300, h: 300 };
    if (!boxes.length) { boxes.push({ x: 0, y: 0, w: s.w, h: s.h, state: e.state }); continue; }
    const cx = boxes.reduce((a, b) => a + b.x, 0) / boxes.length;
    const cy = boxes.reduce((a, b) => a + b.y, 0) / boxes.length;
    let best: { x: number; y: number; score: number } | null = null;
    const maxOverlap = e.state === 'bg' ? 0.3 : 0.12;
    for (let ring = 1; ring <= 40 && !best; ring++) {
      const rad = ring * 40;
      for (let k = 0; k < 24; k++) {
        const a = angleShift + (k / 24) * Math.PI * 2;
        const x = cx + Math.cos(a) * rad * targetAspect, y = cy + Math.sin(a) * rad;
        const ok = boxes.every((b) => overlap({ x, y, w: s.w, h: s.h }, b) <= maxOverlap * Math.min(s.w * s.h, b.w * b.h));
        if (!ok) continue;
        // prefer compact clusters whose shape matches the template region
        const all = [...boxes, { x, y, w: s.w, h: s.h, state: e.state }];
        const bb = bounds(all);
        const score = bb.w * bb.h * (1 + Math.abs(Math.log((bb.w / bb.h) / targetAspect))) + rand() * 1e3;
        if (!best || score < best.score) best = { x, y, score };
      }
    }
    boxes.push({ x: best?.x ?? cx, y: best?.y ?? cy, w: s.w, h: s.h, state: e.state });
  }
  const bb = bounds(boxes);
  let scale = Math.min(r.w / bb.w, r.h / bb.h);
  if (layout === 'offset') scale *= 1.1; // let the cluster run off the edge
  scale = Math.max(0.05, Math.min(scale, 2));
  const ox = r.x + r.w / 2 - (bb.x + bb.w / 2) * scale;
  const oy = r.y + r.h / 2 - (bb.y + bb.h / 2) * scale;
  const placed = boxes.map((b, i) => ({
    uid: uid(), objId: entries[i].id, state: entries[i].state, rot: 0,
    x: ox + b.x * scale, y: oy + b.y * scale,
  } satisfies Instance));
  // layers: background objects at the bottom; among main ones, lower on the canvas = closer = on top
  const items = [
    ...placed.filter((p) => p.state === 'bg'),
    ...placed.filter((p) => p.state === 'main').sort((a, b) => a.y - b.y),
  ];
  return { items, scale };
}

function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  const dx = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
  const dy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
  return dx > 0 && dy > 0 ? dx * dy : 0;
}
function bounds(bs: { x: number; y: number; w: number; h: number }[]) {
  const x0 = Math.min(...bs.map((b) => b.x - b.w / 2)), x1 = Math.max(...bs.map((b) => b.x + b.w / 2));
  const y0 = Math.min(...bs.map((b) => b.y - b.h / 2)), y1 = Math.max(...bs.map((b) => b.y + b.h / 2));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Transform that puts an asset centred at (x,y), rotated, at the shared scale. */
export function instanceTransform(i: Instance, a: Asset, scale: number) {
  const [vx, vy, vw, vh] = a.vb;
  return `translate(${r2(i.x)} ${r2(i.y)}) rotate(${r2(i.rot)}) scale(${r2(scale * 1000) / 1000}) translate(${r2(-vx - vw / 2)} ${r2(-vy - vh / 2)})`;
}

/** Background confetti placements for the canvas, in canvas coordinates. */
export function decorTransforms(f: Format, a: Asset) {
  const [vx, vy, vw] = a.vb;
  const k = Math.max(f.w, f.h) / vw;
  return [`translate(0 0) scale(${r2(k * 1000) / 1000}) translate(${-vx} ${-vy})`];
}

/**
 * Final export: one self-contained vector SVG. Each object stays a separate,
 * named <g> with its original paths (recoloured only), so it can be edited in Figma.
 */
export function buildSvg(c: Composition, assets: Map<string, Asset>, decor?: Asset): string {
  const { w, h } = c.format;
  const parts: string[] = [];
  parts.push(`<rect width="${w}" height="${h}" fill="${c.palette.bg[0]}"/>`);
  if (c.decor && decor) for (const t of decorTransforms(c.format, decor)) parts.push(`<g id="decor" transform="${t}">${recolor(decor.inner, c.palette)}</g>`);
  c.items.forEach((i, idx) => {
    const a = assets.get(assetKey(c.size, i));
    if (!a) return;
    parts.push(`<g id="${i.objId}-${i.state}-${idx + 1}" transform="${instanceTransform(i, a, c.scale)}">${recolor(a.inner, c.palette)}</g>`);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">\n<defs><clipPath id="frame"><rect width="${w}" height="${h}"/></clipPath></defs>\n<g clip-path="url(#frame)">\n${parts.join('\n')}\n</g>\n</svg>\n`;
}
