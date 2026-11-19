// Vercel serverless function: the AI only CHOOSES objects from the library.
// It never draws or generates anything. Needs ANTHROPIC_API_KEY in the project env.
export const config = { runtime: 'edge' };

interface Obj { id: string; name: string; meanings: string[] }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: 'no key' }, { status: 503 });
  const { text, objects } = (await req.json()) as { text: string; objects: Obj[] };
  if (!text || !Array.isArray(objects)) return Response.json({ error: 'bad request' }, { status: 400 });

  const catalog = objects.map((o) => `- ${o.id} (${o.name}): ${o.meanings.join(', ')}`).join('\n');
  const prompt = `Ты подбираешь объекты для иллюстрации к заголовку. Рисовать ничего нельзя: выбирай только из списка.

Заголовок: «${text.slice(0, 300)}»

Объекты библиотеки (id: что может означать):
${catalog}

Выбери 1–3 главных объекта, которые лучше всего передают смысл заголовка как визуальная метафора, и 0–2 фоновых объекта, которые поддерживают тему, не повторяя главные. Выбери шаблон: "title" если это обложка с текстом, "offset" если нужна динамика, "compact" если объектов мало.
Ответь только JSON без пояснений вокруг: {"main":[id...],"bg":[id...],"layout":"title|offset|compact","reason":"одно короткое предложение по-русски"}`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) return Response.json({ error: `anthropic ${r.status}` }, { status: 502 });
  const data = await r.json();
  const out: string = data?.content?.[0]?.text || '';
  const json = out.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return Response.json({ error: 'no json' }, { status: 502 });
  const ids = new Set(objects.map((o) => o.id));
  const parsed = JSON.parse(json);
  const clean = (a: unknown) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && ids.has(x)) : []);
  return Response.json({ main: clean(parsed.main), bg: clean(parsed.bg), layout: parsed.layout, reason: parsed.reason });
}
