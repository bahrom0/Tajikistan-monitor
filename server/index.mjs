import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sources, referenceSources } from './config/sources.mjs';
import { fetchSourceAdapter } from './adapters/index.mjs';
import { createAiGeolocationResolver, createGeolocator } from './lib/geolocate.mjs';
import { contentDelta, parseOpenAiSse, resolveChatCompletionsUrl } from './lib/openai-stream.mjs';

const port = Number(process.env.PORT || 8787);
const root = fileURLToPath(new URL('../', import.meta.url));
const locationDataset = JSON.parse(await readFile(join(root, 'src/data/geography/locations.json'), 'utf8'));
const aliasDataset = JSON.parse(await readFile(join(root, 'src/data/geography/location-aliases.json'), 'utf8'));
const geolocate = createGeolocator(locationDataset.locations, aliasDataset);
const resolveGeolocation = createAiGeolocationResolver({ enabled: process.env.GEOLOCATION_AI_ENABLED === 'true', apiKey: process.env.OPENAI_API_KEY, baseUrl: process.env.OPENAI_BASE_URL, model: process.env.OPENAI_MODEL });
const cache = { expiresAt: 0, items: [], statuses: [], weather: { alerts: [], forecasts: [] }, rates: [] };

const demoItems = [
  { id: 'demo-1', title: 'Монитор готов принимать официальные новости', description: 'После подключения к сети сервер автоматически загрузит свежие публикации выбранных ведомств.', sourceId: 'system', sourceName: 'Tajikistan Monitor', category: 'Система', publishedAt: new Date().toISOString(), severity: 'normal', url: '' },
  { id: 'demo-2', title: 'Источники ограничены территорией Таджикистана', description: 'В каркасе нет глобальных военных, биржевых, морских или рекламных модулей.', sourceId: 'system', sourceName: 'Tajikistan Monitor', category: 'Система', publishedAt: new Date(Date.now() - 300000).toISOString(), severity: 'normal', url: '' },
];

async function loadNews(force = false) {
  if (!force && cache.expiresAt > Date.now()) return cache;
  const settled = await Promise.allSettled(sources.map(async (source) => ({ source, result: await fetchSourceAdapter(source) })));
  const items = [];
  const weather = { alerts: [], forecasts: [] };
  const rates = [];
  const statuses = settled.map((result, index) => {
    const source = sources[index];
    if (result.status === 'fulfilled') {
      const payload = result.value.result;
      items.push(...(payload.items || []));
      weather.alerts.push(...(payload.weather?.alerts || []));
      weather.forecasts.push(...(payload.weather?.forecasts || []));
      rates.push(...(payload.rates || []));
      const count = (payload.items?.length || 0) + (payload.weather?.forecasts?.length || 0) + (payload.rates?.length || 0);
      return { id: source.id, name: source.name, status: 'online', count, checkedAt: new Date().toISOString() };
    }
    const degraded = result.reason?.code === 'ADAPTER_CONTRACT';
    return { id: source.id, name: source.name, status: degraded ? 'degraded' : 'offline', count: 0, checkedAt: new Date().toISOString(), error: result.reason instanceof Error ? result.reason.message : 'Ошибка источника' };
  });
  const locatedItems = (items.length ? items : demoItems).map(geolocate);
  cache.items = (await Promise.all(locatedItems.map(resolveGeolocation))).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  cache.statuses = statuses;
  cache.weather = weather;
  cache.rates = rates;
  cache.expiresAt = Date.now() + 5 * 60_000;
  return cache;
}

const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function explainNews(req, res) {
  const body = await readBody(req);
  const title = String(body.title || '').slice(0, 500);
  const description = String(body.description || '').slice(0, 3000);
  const question = String(body.question || 'Объясни эту новость простыми словами').slice(0, 500);
  if (!process.env.OPENAI_API_KEY) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    return res.end(`Простыми словами: «${title}». ${description || 'В публикации пока нет подробного описания.'} Для полноценного анализа добавьте OPENAI_API_KEY в .env.`);
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(new Error('AI provider timeout')), 120_000);
  res.once('close', () => abortController.abort());
  let response;
  try {
    response = await fetch(resolveChatCompletionsUrl(process.env.OPENAI_BASE_URL), {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, Accept: 'text/event-stream', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', temperature: 0.2, stream: true, messages: [
        { role: 'system', content: 'Ты аналитик новостей Таджикистана. Отвечай простым русским языком, отделяй факты от предположений и не выдумывай детали. Форматируй ответ аккуратным Markdown: короткие разделы, абзацы и списки только когда они полезны.' },
        { role: 'user', content: `Заголовок: ${title}\nОписание: ${description}\nВопрос: ${question}` },
      ] }),
      signal: abortController.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
  if (!response.ok) {
    clearTimeout(timeout);
    return json(res, 502, { error: `AI provider: HTTP ${response.status}` });
  }
  if (!response.body) {
    clearTimeout(timeout);
    return json(res, 502, { error: 'AI provider не вернул поток данных' });
  }

  res.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-cache, no-store',
    'x-accel-buffering': 'no',
    'x-content-type-options': 'nosniff',
  });
  res.flushHeaders();
  res.socket?.setNoDelay(true);

  try {
    for await (const payload of parseOpenAiSse(response.body)) {
      const token = contentDelta(payload);
      if (token && !res.write(token)) await once(res, 'drain');
    }
    res.end();
  } catch (error) {
    res.destroy(error instanceof Error ? error : new Error('AI stream failed'));
  } finally {
    clearTimeout(timeout);
  }
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
async function serveStatic(url, res) {
  const requested = url === '/' ? 'index.html' : url.slice(1);
  const safe = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, 'dist', safe);
  try { if (!(await stat(file)).isFile()) throw new Error(); } catch { file = join(root, 'dist', 'index.html'); }
  try { res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' }); res.end(await readFile(file)); }
  catch { json(res, 404, { error: 'Сначала выполните npm run build' }); }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, service: 'tajikistan-monitor', time: new Date().toISOString() });
    if (url.pathname === '/api/news' && req.method === 'GET') {
      const data = await loadNews(url.searchParams.get('refresh') === '1');
      return json(res, 200, { items: data.items, updatedAt: new Date().toISOString() });
    }
    if (url.pathname === '/api/status' && req.method === 'GET') {
      const data = await loadNews();
      return json(res, 200, { sources: data.statuses, references: referenceSources });
    }
    if (url.pathname === '/api/weather' && req.method === 'GET') {
      const data = await loadNews();
      return json(res, 200, { ...data.weather, updatedAt: new Date().toISOString() });
    }
    if (url.pathname === '/api/exchange-rates' && req.method === 'GET') {
      const data = await loadNews();
      return json(res, 200, { base: 'TJS', rates: data.rates, updatedAt: new Date().toISOString() });
    }
    if (url.pathname === '/api/ai/explain' && req.method === 'POST') return await explainNews(req, res);
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Маршрут не найден' });
    return await serveStatic(url.pathname, res);
  } catch (error) {
    if (res.headersSent || res.destroyed) return res.destroy();
    return json(res, 500, { error: error instanceof Error ? error.message : 'Внутренняя ошибка' });
  }
}).listen(port, '127.0.0.1', () => console.log(`Tajikistan Monitor API: http://127.0.0.1:${port}`));
