// One-time build step: cuts the Figma export of each size into separate,
// untouched SVG objects and writes the manifest the app reads.
// Usage: node scripts/extract-library.mjs   (needs `playwright` + Chromium)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Figma layer name -> library object. Names come from the "Библиотека компонентов" page.
const OBJECTS = {
  S: {
    book:       { main: 'Group 2136136335', bg: 'Group 2136136341' },
    phone:      { main: 'Телефон',          bg: 'Телефон_2' },
    puzzle:     { main: 'Пазлы',            bg: 'Пазлы_2' },
    coin:       { main: 'Монета',           bg: 'Монета_2' },
    headphones: { main: 'Наушники',         bg: 'Наушники_2' },
    lamp:       { main: 'Лампа',            bg: 'Лампа_2' },
    flowers:    { main: 'Group 2136136345', bg: 'Group 2136136346' },
    wallet:     { main: 'Кошелек',          bg: 'Кошелек_2' },
    folder:     { main: 'Group 2136136337', bg: 'Group 2136136342' },
    pen:        { main: 'Group 2136136336', bg: 'Group 2136136343' },
  },
};
const DECOR = { S: 'конфетти' }; // background confetti inside the first "Фон" square

const sizes = Object.keys(OBJECTS).filter((s) => fs.existsSync(path.join(ROOT, 'source', `size-${s}.svg`)));
const browser = await chromium.launch();
const manifest = { sizes: {} };

for (const size of sizes) {
  const page = await browser.newPage();
  await page.goto('file://' + path.join(ROOT, 'source', `size-${size}.svg`));
  const wanted = { ...Object.fromEntries(Object.entries(OBJECTS[size]).flatMap(([k, v]) => [[`${k}.main`, v.main], [`${k}.bg`, v.bg]])), decor: DECOR[size] };
  const out = await page.evaluate((wanted) => {
    // Figma writes UTF-8 names as Latin-1 entities; undo that to match layer names.
    const fix = (s) => { try { return decodeURIComponent(escape(s)); } catch { return s; } };
    const byName = new Map([...document.querySelectorAll('g[id]')].map((g) => [fix(g.id), g]));
    const res = {};
    for (const [key, name] of Object.entries(wanted)) {
      const g = byName.get(name);
      if (!g) { res[key] = null; continue; }
      const bb = g.getBBox();
      const clone = g.cloneNode(true);
      // ids are Figma layer names; drop them so instances never collide.
      [clone, ...clone.querySelectorAll('[id]')].forEach((e) => e.removeAttribute('id'));
      let box = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
      if (key === 'decor') { // decor is positioned relative to its 500x500 background square
        const sq = g.closest('g')?.parentElement?.querySelector('rect') || g.parentElement.querySelector('rect');
        const r = sq.getBBox();
        const t = (sq.getAttribute('transform') || '').match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/);
        const ox = t ? +t[1] : r.x, oy = t ? +t[2] : r.y;
        box = { x: ox, y: oy, w: r.width, h: r.height };
      }
      res[key] = { box, inner: clone.innerHTML.replace(/\sxmlns="[^"]*"/g, '') };
    }
    return res;
  }, wanted);

  const dir = path.join(ROOT, 'public', 'library', size);
  fs.mkdirSync(dir, { recursive: true });
  const items = {};
  for (const [key, v] of Object.entries(out)) {
    if (!v) { console.warn(`[${size}] not found: ${key}`); continue; }
    const r = (n) => Math.round(n * 100) / 100;
    const { x, y, w, h } = v.box;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(x)} ${r(y)} ${r(w)} ${r(h)}" width="${r(w)}" height="${r(h)}">${v.inner}</svg>\n`;
    const file = `${key.replace('.', '-')}.svg`;
    fs.writeFileSync(path.join(dir, file), svg);
    items[key] = { file: `library/${size}/${file}`, w: r(w), h: r(h) };
  }
  manifest.sizes[size] = items;
  console.log(`[${size}] ${Object.keys(items).length} files`);
}
await browser.close();
fs.writeFileSync(path.join(ROOT, 'src', 'library', 'extracted.json'), JSON.stringify(manifest, null, 2));
