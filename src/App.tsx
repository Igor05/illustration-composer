import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AVAILABLE_SIZES, FORMATS, LAYOUTS, OBJECTS, OBJECT_BY_ID, PALETTES, sizeItem,
  type LayoutId, type ObjState, type Palette, type SizeId,
} from './library/catalog';
import {
  assetKey, autoLayout, buildSvg, decorTransforms, instanceTransform, loadAsset, uid,
  type Asset, type Composition, type Instance,
} from './lib/composition';
import { recolor, parsePalette } from './lib/recolor';
import { parseObjectList, pickForMetaphor } from './lib/pick';
import './App.css';

type Mode = 'metaphor' | 'list';

const initial: Composition = {
  size: AVAILABLE_SIZES.includes('L') ? 'L' : AVAILABLE_SIZES[0],
  format: FORMATS[0], palette: PALETTES[0], layout: 'title', scale: 0.5, decor: true, items: [],
};

export default function App() {
  const [comp, setComp] = useState<Composition>(initial);
  const [assets, setAssets] = useState<Map<string, Asset>>(new Map());
  const [decor, setDecor] = useState<Asset>();
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('metaphor');
  const [text, setText] = useState('Финансовая грамотность для студентов');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState(1);
  const [lastPick, setLastPick] = useState<{ main: string[]; bg: string[] }>({ main: [], bg: [] });
  const [customPalette, setCustomPalette] = useState<Palette | null>(null);
  const [paletteText, setPaletteText] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ uid: string; dx: number; dy: number } | null>(null);

  // load every asset the composition needs (and the size's background decor)
  const need = useMemo(() => comp.items.map((i) => ({ i, key: assetKey(comp.size, i) })).filter(({ key }) => !assets.has(key)), [comp.items, comp.size, assets]);
  useEffect(() => {
    if (!need.length) return;
    Promise.all(need.map(({ i, key }) => loadAsset(comp.size, i.objId, i.state).then((a) => [key, a] as const)))
      .then((pairs) => setAssets((m) => new Map([...m, ...pairs])))
      .catch((e) => setStatus(String(e.message || e)));
  }, [need, comp.size]);
  useEffect(() => { loadAsset(comp.size, '', 'decor').then(setDecor).catch(() => setDecor(undefined)); }, [comp.size]);

  const sizesFor = useCallback((size: SizeId) => {
    const out: Record<string, { w: number; h: number }> = {};
    for (const o of OBJECTS) for (const st of ['main', 'bg'] as const) {
      const it = sizeItem(size, `${o.id}.${st}`);
      if (it) out[`${o.id}.${st}`] = { w: it.w, h: it.h };
    }
    return out;
  }, []);

  const compose = useCallback((main: string[], bg: string[], layout = comp.layout, s = seed, base = comp) => {
    const { items, scale } = autoLayout(main, bg, sizesFor(base.size), layout, base.format, s);
    setComp({ ...base, layout, items, scale });
    setLastPick({ main, bg });
    setSelected(null);
  }, [comp, seed, sizesFor]);

  async function run() {
    setBusy(true); setStatus('');
    try {
      if (mode === 'metaphor') {
        const p = await pickForMetaphor(text);
        compose(p.main, p.bg, p.layout ?? comp.layout);
        const names = (ids: string[]) => ids.map((id) => OBJECT_BY_ID[id]?.name).filter(Boolean).join(', ');
        setStatus(`${p.source === 'ai' ? 'AI подобрал' : 'Подбор по ключевым словам'}: ${names(p.main)}${p.bg.length ? ` · фон: ${names(p.bg)}` : ''}${p.reason ? ` — ${p.reason}` : ''}`);
      } else {
        const { ids, unknown } = parseObjectList(text);
        if (!ids.length) { setStatus('Не нашел ни одного объекта из библиотеки в списке'); return; }
        compose(ids, []);
        setStatus(unknown.length ? `Не нашел в библиотеке: ${unknown.join(', ')}` : `Собрал: ${ids.map((id) => OBJECT_BY_ID[id].name).join(', ')}`);
      }
    } finally { setBusy(false); }
  }

  // --- editing ---------------------------------------------------------------
  const sel = comp.items.find((i) => i.uid === selected) || null;
  const update = (u: string, patch: Partial<Instance>) => setComp((c) => ({ ...c, items: c.items.map((i) => (i.uid === u ? { ...i, ...patch } : i)) }));
  const remove = (u: string) => { setComp((c) => ({ ...c, items: c.items.filter((i) => i.uid !== u) })); setSelected(null); };
  const duplicate = (u: string) => setComp((c) => {
    const i = c.items.find((x) => x.uid === u); if (!i) return c;
    const copy = { ...i, uid: uid(), x: i.x + 40, y: i.y + 30 };
    setSelected(copy.uid);
    return { ...c, items: [...c.items, copy] };
  });
  const move = (u: string, where: 'up' | 'down' | 'top' | 'bottom') => setComp((c) => {
    const arr = [...c.items]; const k = arr.findIndex((i) => i.uid === u); if (k < 0) return c;
    const [it] = arr.splice(k, 1);
    const to = where === 'top' ? arr.length : where === 'bottom' ? 0 : where === 'up' ? Math.min(arr.length, k + 1) : Math.max(0, k - 1);
    arr.splice(to, 0, it);
    return { ...c, items: arr };
  });
  const addObject = (objId: string, state: ObjState) => {
    const it: Instance = { uid: uid(), objId, state, x: comp.format.w / 2, y: comp.format.h / 2, rot: 0 };
    setComp((c) => ({ ...c, items: state === 'bg' ? [it, ...c.items] : [...c.items, it] }));
    setSelected(it.uid);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected || (e.target as HTMLElement).closest('input,textarea,select')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(selected); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(selected); }
      const step = e.shiftKey ? 20 : 4;
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (arrows[e.key] && sel) { e.preventDefault(); update(selected, { x: sel.x + arrows[e.key][0], y: sel.y + arrows[e.key][1] }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toSvg = (e: React.PointerEvent) => {
    const svg = svgRef.current!; const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const onDown = (e: React.PointerEvent, i: Instance) => {
    e.stopPropagation(); setSelected(i.uid);
    const p = toSvg(e); drag.current = { uid: i.uid, dx: p.x - i.x, dy: p.y - i.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = toSvg(e); update(drag.current.uid, { x: p.x - drag.current.dx, y: p.y - drag.current.dy });
  };

  // --- settings that re-render the same scene --------------------------------
  const setSize = (size: SizeId) => {
    // switch every object to the other size's file; keep positions relative to the canvas and refit scale
    const base = { ...comp, size };
    if (lastPick.main.length || lastPick.bg.length) {
      const { scale } = autoLayout(lastPick.main, lastPick.bg, sizesFor(size), comp.layout, comp.format, seed);
      setComp({ ...base, scale });
    } else setComp(base);
  };
  const setFormat = (id: string) => {
    const format = FORMATS.find((f) => f.id === id)!;
    if (lastPick.main.length || lastPick.bg.length) compose(lastPick.main, lastPick.bg, comp.layout, seed, { ...comp, format });
    else setComp({ ...comp, format });
  };
  const setLayout = (layout: LayoutId) => {
    if (lastPick.main.length || lastPick.bg.length) compose(lastPick.main, lastPick.bg, layout);
    else setComp({ ...comp, layout });
  };
  const shuffle = () => { const s = seed + 1; setSeed(s); compose(lastPick.main, lastPick.bg, comp.layout, s); };

  const applyPaletteText = (t: string) => {
    try { const p = parsePalette(t); setCustomPalette(p); setComp((c) => ({ ...c, palette: p })); setStatus('Палитра загружена, композиция перекрашена'); }
    catch (e) { setStatus((e as Error).message); }
  };
  const onPaletteFile = async (f?: File) => { if (f) { const t = await f.text(); setPaletteText(t); applyPaletteText(t); } };

  const exportSvg = () => {
    const svg = buildSvg(comp, assets, decor);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = `illustration-${comp.format.w}x${comp.format.h}-${comp.palette.id}.svg`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const { w, h } = comp.format;
  const palettes = customPalette ? [...PALETTES, customPalette] : PALETTES;

  return (
    <div className="app">
      <aside className="panel left">
        <h1>Конструктор иллюстраций</h1>
        <p className="muted">Собирает композицию только из готовых SVG-объектов библиотеки. Ничего не генерирует и не меняет форму объектов.</p>

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'metaphor'} onClick={() => { setMode('metaphor'); setText('Финансовая грамотность для студентов'); }}>Метафора</button>
          <button role="tab" aria-selected={mode === 'list'} onClick={() => { setMode('list'); setText('книга, лампа, ручка'); }}>Список объектов</button>
        </div>
        <label className="field">
          <span>{mode === 'metaphor' ? 'Заголовок или метафора' : 'Объекты через запятую'}</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); }} />
        </label>
        <button className="primary" onClick={run} disabled={busy || !text.trim()}>{busy ? 'Подбираю…' : 'Собрать композицию'}</button>
        {status && <p className="status">{status}</p>}

        <div className="field"><span>Шаблон</span>
          <div className="seg">{LAYOUTS.map((l) => <button key={l.id} title={l.hint} aria-pressed={comp.layout === l.id} onClick={() => setLayout(l.id)}>{l.name}</button>)}</div>
        </div>
        <label className="field"><span>Формат</span>
          <select value={comp.format.id} onChange={(e) => setFormat(e.target.value)}>{FORMATS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        </label>
        <div className="field"><span>Детализация объектов</span>
          <div className="seg">{(['L', 'S'] as SizeId[]).map((s) => <button key={s} aria-pressed={comp.size === s} disabled={!AVAILABLE_SIZES.includes(s)} onClick={() => setSize(s)}>Размер {s}</button>)}</div>
        </div>
        <div className="field"><span>Цветовая схема</span>
          <div className="swatches">{palettes.map((p) => (
            <button key={p.id} className="swatch" aria-pressed={comp.palette.id === p.id} onClick={() => setComp({ ...comp, palette: p })} title={p.name}>
              {[...p.bg, ...p.obj].map((c, k) => <i key={k} style={{ background: c }} />)}
              <em>{p.name}</em>
            </button>))}
          </div>
        </div>
        <details className="field">
          <summary>Загрузить свою палитру</summary>
          <p className="muted small">JSON <code>{'{"bg":[3 цвета],"obj":[3 цвета]}'}</code> или 6 hex-кодов подряд: 3 фона (светлый→темный), затем 3 цвета объектов. Обводка и белый не меняются.</p>
          <textarea rows={2} placeholder="#E8F0FF #9DB8F2 #3F5FC8 #FFE08A #FF8A65 #FFD3C4" value={paletteText} onChange={(e) => setPaletteText(e.target.value)} />
          <div className="row"><button onClick={() => applyPaletteText(paletteText)}>Применить</button>
            <label className="file">Файл…<input type="file" accept=".json,.txt" onChange={(e) => onPaletteFile(e.target.files?.[0])} /></label></div>
        </details>
        <label className="check"><input type="checkbox" checked={comp.decor} onChange={(e) => setComp({ ...comp, decor: e.target.checked })} /> Фоновый декор</label>
        <label className="field"><span>Масштаб всех объектов · {Math.round(comp.scale * 100)}%</span>
          <input type="range" min={0.1} max={1.6} step={0.01} value={comp.scale} onChange={(e) => setComp({ ...comp, scale: +e.target.value })} />
        </label>
        <div className="row">
          <button onClick={shuffle} disabled={!lastPick.main.length && !lastPick.bg.length}>Перемешать</button>
          <button className="primary" onClick={exportSvg} disabled={!comp.items.length}>Скачать SVG</button>
        </div>
      </aside>

      <main className="stage" onPointerDown={() => setSelected(null)}>
        <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} className="canvas" style={{ aspectRatio: `${w}/${h}` }}
          onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
          <defs><clipPath id="frame"><rect width={w} height={h} /></clipPath></defs>
          <g clipPath="url(#frame)">
            <rect width={w} height={h} fill={comp.palette.bg[0]} />
            {comp.decor && decor && decorTransforms(comp.format, decor).map((t, k) => <g key={k} transform={t} dangerouslySetInnerHTML={{ __html: recolor(decor.inner, comp.palette) }} />)}
            {comp.layout === 'title' && comp.items.length > 0 && (
              w >= h ? <rect className="title-hint" x={w * 0.06} y={h * 0.3} width={w * 0.34} height={h * 0.4} rx={8} />
                : <rect className="title-hint" x={w * 0.08} y={h * 0.08} width={w * 0.84} height={h * 0.26} rx={8} />)}
            {comp.items.map((i) => {
              const a = assets.get(assetKey(comp.size, i)); if (!a) return null;
              return (
                <g key={i.uid} className={`obj${i.uid === selected ? ' selected' : ''}`} transform={instanceTransform(i, a, comp.scale)} onPointerDown={(e) => onDown(e, i)}>
                  <g dangerouslySetInnerHTML={{ __html: recolor(a.inner, comp.palette) }} />
                  {i.uid === selected && <rect className="sel-box" x={a.vb[0]} y={a.vb[1]} width={a.vb[2]} height={a.vb[3]} />}
                </g>);
            })}
          </g>
        </svg>
        {!comp.items.length && <p className="empty">Введите метафору или список объектов и нажмите «Собрать композицию». Объекты можно добавить и вручную справа.</p>}
      </main>

      <aside className="panel right">
        {sel ? (
          <section>
            <h2>{OBJECT_BY_ID[sel.objId].name} · {sel.state === 'main' ? 'главный' : 'фоновый'}</h2>
            <label className="field"><span>Поворот · {Math.round(sel.rot)}°</span>
              <input type="range" min={-180} max={180} step={1} value={sel.rot} onChange={(e) => update(sel.uid, { rot: +e.target.value })} />
            </label>
            <div className="grid2">
              <button onClick={() => update(sel.uid, { rot: sel.rot - 15 })}>↺ 15°</button>
              <button onClick={() => update(sel.uid, { rot: sel.rot + 15 })}>↻ 15°</button>
              <button onClick={() => update(sel.uid, { state: sel.state === 'main' ? 'bg' : 'main' })}>{sel.state === 'main' ? 'Сделать фоновым' : 'Сделать главным'}</button>
              <button onClick={() => duplicate(sel.uid)}>Дублировать</button>
              <button onClick={() => move(sel.uid, 'top')}>На передний план</button>
              <button onClick={() => move(sel.uid, 'bottom')}>На задний план</button>
              <button onClick={() => move(sel.uid, 'up')}>Слой выше</button>
              <button onClick={() => move(sel.uid, 'down')}>Слой ниже</button>
            </div>
            <button className="danger" onClick={() => remove(sel.uid)}>Удалить</button>
            <p className="muted small">Перетаскивайте мышью или стрелками (Shift — быстрее). Delete — удалить, ⌘/Ctrl+D — дублировать.</p>
          </section>
        ) : (
          <section><h2>Слои</h2>
            {comp.items.length ? (
              <ol className="layers">{[...comp.items].reverse().map((i) => (
                <li key={i.uid}><button onClick={() => setSelected(i.uid)}>{OBJECT_BY_ID[i.objId].name} <span className="muted">{i.state === 'main' ? 'главный' : 'фон'}</span></button></li>))}
              </ol>) : <p className="muted small">Пока пусто</p>}
          </section>
        )}
        <section>
          <h2>Библиотека · размер {comp.size}</h2>
          <div className="lib">{OBJECTS.map((o) => (
            <div key={o.id} className="lib-item">
              <span>{o.name}</span>
              <div className="row">
                <button onClick={() => addObject(o.id, 'main')} title="Добавить главный (цветной)">+ главный</button>
                <button onClick={() => addObject(o.id, 'bg')} title="Добавить фоновый (монохром)">+ фон</button>
              </div>
            </div>))}
          </div>
        </section>
      </aside>
    </div>
  );
}
