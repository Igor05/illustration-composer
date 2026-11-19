import { SOURCE_PALETTE, type Palette } from '../library/catalog';

const norm = (c: string) => c.trim().toUpperCase();

/** Source colour → target colour, slot by slot. Untouched: outline #181817, white, black. */
export function colorMap(target: Palette): Map<string, string> {
  const m = new Map<string, string>();
  SOURCE_PALETTE.bg.forEach((c, i) => m.set(norm(c), norm(target.bg[i])));
  SOURCE_PALETTE.obj.forEach((c, i) => m.set(norm(c), norm(target.obj[i])));
  return m;
}

/**
 * Recolours SVG markup by exact hex substitution in fill/stroke/stop-color.
 * Geometry is never touched: only colour values change, in a single pass so
 * two slots that swap colours cannot overwrite each other.
 */
export function recolor(markup: string, target: Palette): string {
  const map = colorMap(target);
  if ([...map].every(([a, b]) => a === b)) return markup;
  return markup.replace(/(fill|stroke|stop-color)="(#[0-9a-fA-F]{6})"/g, (all, attr, hex) => {
    const to = map.get(norm(hex));
    return to ? `${attr}="${to}"` : all;
  });
}

const HEX = /#[0-9a-fA-F]{6}\b/g;

/**
 * Accepts a palette the user pastes or uploads: JSON {"bg":[3],"obj":[3]}
 * or any text with six hex codes in order bg1 bg2 bg3 obj1 obj2 obj3.
 */
export function parsePalette(text: string, name = 'Своя палитра'): Palette {
  let bg: string[] | undefined, obj: string[] | undefined;
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j?.bg) && Array.isArray(j?.obj)) { bg = j.bg; obj = j.obj; }
  } catch { /* not JSON — fall through to plain hex list */ }
  if (!bg || !obj) {
    const hexes = text.match(HEX) || [];
    if (hexes.length < 6) throw new Error(`Нужно 6 цветов (3 фона и 3 объекта), найдено ${hexes.length}`);
    bg = hexes.slice(0, 3); obj = hexes.slice(3, 6);
  }
  const ok = (a: string[]) => a.length === 3 && a.every((c) => /^#[0-9a-fA-F]{6}$/.test(c));
  if (!ok(bg) || !ok(obj)) throw new Error('Палитра: по 3 цвета в формате #RRGGBB для фона и для объектов');
  return { id: 'custom', name, bg: bg.map(norm) as Palette['bg'], obj: obj.map(norm) as Palette['obj'] };
}
