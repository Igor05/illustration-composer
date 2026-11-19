import { OBJECTS, type LayoutId } from '../library/catalog';

export interface Pick { main: string[]; bg: string[]; layout?: LayoutId; reason?: string; source: 'ai' | 'keywords' }

const words = (t: string) => t.toLowerCase().replace(/ё/g, 'е').match(/[a-zа-я0-9]+/g) || [];
// crude Russian stemming: drop a case/number ending, then compare the first 5 letters,
// so "книгу/книги/книга", "лампы/лампа", "цветов/цветы", "учебы/учеба" all meet
const ENDING = /(ами|ями|ого|его|ому|ему|ов|ев|ей|ам|ям|ах|ях|ом|ем|ой|ий|ый|ая|яя|ое|ее|ые|ие|а|я|у|ю|ы|и|е|о|ь|й)$/;
const stem = (w: string) => {
  const s = w.replace(ENDING, '');
  return (s.length >= 3 ? s : w).slice(0, 5);
};

/** Scenario 2: the person lists the objects they want. Order is kept, unknown words are reported back. */
export function parseObjectList(text: string): { ids: string[]; unknown: string[] } {
  const ids: string[] = [], unknown: string[] = [];
  for (const chunk of text.split(/[,;\n]+|\sи\s/).map((s) => s.trim()).filter(Boolean)) {
    const ws = words(chunk).map(stem);
    const hit = OBJECTS.find((o) => o.names.some((n) => ws.includes(stem(n.replace(/ё/g, 'е')))));
    if (hit) ids.push(hit.id); else unknown.push(chunk);
  }
  return { ids, unknown };
}

/** Scenario 1 fallback: score objects by overlap between the headline and each object's meanings. */
export function pickByKeywords(text: string): Pick {
  const ws = new Set(words(text).map(stem));
  const scored = OBJECTS.map((o) => {
    let s = 0;
    for (const m of o.meanings) {
      const mw = words(m).map(stem);
      if (mw.every((w) => ws.has(w))) s += mw.length;
    }
    if (o.names.some((n) => ws.has(stem(n)))) s += 3;
    return { id: o.id, s };
  }).sort((a, b) => b.s - a.s);
  const hits = scored.filter((x) => x.s > 0).map((x) => x.id);
  const main = (hits.length ? hits : ['lamp', 'book']).slice(0, 3);
  // background: next related objects; otherwise a stable pseudo-random pair derived from the text
  let bg = hits.slice(3, 5);
  if (!bg.length) {
    const h = [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const pool = OBJECTS.map((o) => o.id).filter((id) => !main.includes(id));
    bg = [pool[h % pool.length], pool[(h >>> 5) % pool.length]].filter((id, i, a) => id && a.indexOf(id) === i);
  }
  return { main, bg, source: 'keywords', reason: hits.length ? undefined : 'Совпадений по словам нет, взял нейтральный набор' };
}

/** Scenario 1: ask the AI to choose objects (it never draws anything), fall back to keywords. */
export async function pickForMetaphor(text: string): Promise<Pick> {
  try {
    const r = await fetch('/api/pick', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, objects: OBJECTS.map(({ id, name, meanings }) => ({ id, name, meanings: meanings.slice(0, 8) })) }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const valid = (a: unknown) => (Array.isArray(a) ? a : []).filter((id): id is string => typeof id === 'string' && OBJECTS.some((o) => o.id === id));
    const main = valid(j.main).slice(0, 4);
    if (!main.length) throw new Error('empty');
    const bg = valid(j.bg).filter((id) => !main.includes(id)).slice(0, 3);
    const layout = ['title', 'offset', 'compact'].includes(j.layout) ? (j.layout as LayoutId) : undefined;
    return { main, bg, layout, reason: typeof j.reason === 'string' ? j.reason : undefined, source: 'ai' };
  } catch {
    return pickByKeywords(text);
  }
}
