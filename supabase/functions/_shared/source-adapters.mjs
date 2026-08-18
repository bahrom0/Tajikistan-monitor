const decodeHtml = (value = '') => value
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));

export const cleanText = (value = '') => decodeHtml(value)
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const absoluteUrl = (value, baseUrl) => {
  try { return new URL(decodeHtml(value), baseUrl).toString(); } catch { return ''; }
};

const parseDate = (value, fallback = new Date()) => {
  const input = cleanText(value);
  const match = input.match(/\b(\d{2})[./](\d{2})[./](\d{4})\b/);
  if (match) return new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00+05:00`).toISOString();
  const parsed = Date.parse(input);
  return Number.isNaN(parsed) ? fallback.toISOString() : new Date(parsed).toISOString();
};

export class AdapterContractError extends Error {
  constructor(message) { super(message); this.name = 'AdapterContractError'; this.code = 'ADAPTER_CONTRACT'; }
}

export async function fetchTextWithRetry(url, { fetchImpl = fetch, timeoutMs = 10_000, attempts = 3, maxBytes = 3_000_000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': 'TajikistanMonitor/0.1 (+olympiad educational project)',
          Accept: 'text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.5',
        },
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.code = `HTTP_${response.status}`;
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      const declared = Number(response.headers.get('content-length') || 0);
      if (declared > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`);
      return new TextDecoder().decode(bytes);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || error.retryable === false || /exceeds/.test(String(error.message))) break;
      await new Promise((resolve) => setTimeout(resolve, 200 * (2 ** (attempt - 1))));
    }
  }
  throw lastError;
}

const rssText = (value = '') => cleanText(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
const rssField = (xml, names) => {
  for (const name of names) {
    const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return rssText(match[1]);
  }
  return '';
};

export function parseFeed(xml, source, now = new Date()) {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)];
  const items = blocks.slice(0, 30).map((match, index) => {
    const body = match[2];
    const title = rssField(body, ['title']) || 'Без заголовка';
    const rawDate = rssField(body, ['pubDate', 'published', 'updated']);
    const parsedContent = rssField(body, ['content:encoded', 'content', 'description', 'summary']);
    const description = parsedContent.slice(0, 5000);
    const simpleLink = rssField(body, ['link']);
    const url = simpleLink.startsWith('http') ? simpleLink : (body.match(/<link[^>]+href=["']([^"']+)/i)?.[1] ?? '');
    const publishedAt = parseDate(rawDate, now);
    return {
      externalId: `${source.id}-${url || `${publishedAt}-${index}-${title}`}`,
      title, description, content: parsedContent.slice(0, 12_000), url, sourceId: source.id, sourceName: source.name,
      category: source.kind, publishedAt,
      severity: /авари|землетр|сел|опас|чрезвыч|ҳалокат/i.test(`${title} ${description}`) ? 'alert' : 'normal',
    };
  });
  if (!items.length) throw new AdapterContractError('RSS returned no items');
  return { items };
}

export function parseKchsHtml(html, source) {
  const articles = [...html.matchAll(/<article\b[^>]*class="[^"]*node-article[^"]*"[^>]*>([\s\S]*?)<\/article>/gi)];
  const items = articles.slice(0, 30).flatMap((match) => {
    const body = match[1];
    const heading = body.match(/<h2\b[^>]*class="[^"]*title[^"]*"[^>]*>[\s\S]*?<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!heading) return [];
    const title = cleanText(heading[2]);
    const date = body.match(/property="dc:date dc:created"\s+content="([^"]+)"/i)?.[1] || body.match(/Опубликована:\s*([^|<]+)/i)?.[1] || '';
    const parsedContent = cleanText(body.match(/field-name-body[\s\S]*?<div\b[^>]*class="[^"]*field-item[^" ]*\s+even[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    const description = parsedContent.slice(0, 5000);
    const url = absoluteUrl(heading[1], source.url);
    return [{ externalId: `${source.id}-${url}`, title, description, content: parsedContent.slice(0, 12_000), url, sourceId: source.id, sourceName: source.name, category: 'ЧС', publishedAt: parseDate(date), severity: /опас|угроз|авари|сел|лавин|землетр|пожар|спас|утоп|чрезвыч|ҳалокат/i.test(`${title} ${description}`) ? 'alert' : 'normal' }];
  });
  if (!items.length) throw new AdapterContractError('KCHS article selectors returned no items');
  return { items };
}

export function parseMeteoHtml(html, source, now = new Date()) {
  const alertText = cleanText(html.match(/<h2\b[^>]*>\s*Предупреждение!\s*<\/h2>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
  const section = html.match(/Прогноз погоды на сегодня[\s\S]*?<ul\b[^>]*class="[^"]*splide__list[^"]*"[^>]*>([\s\S]*?)<\/ul>/i)?.[1] || '';
  const forecasts = [...section.matchAll(/<li\b[^>]*class="[^"]*splide__slide[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)].flatMap((match) => {
    const headings = [...match[1].matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)].map((item) => cleanText(item[1]));
    return headings.length < 2 ? [] : [{ city: headings[0], temperature: headings[1].replace(/\s+/g, ''), observedAt: now.toISOString(), sourceUrl: source.url }];
  });
  if (!alertText && !forecasts.length) throw new AdapterContractError('Meteo alert and forecast selectors returned no data');
  const alerts = alertText ? [{ externalId: `${source.id}-alert-${now.toISOString().slice(0, 10)}`, text: alertText, severity: 'alert', publishedAt: now.toISOString(), sourceUrl: source.url }] : [];
  const items = alerts.map((alert) => ({ externalId: alert.externalId, title: 'Метеорологическое предупреждение', description: alert.text, content: alert.text.slice(0, 12_000), url: source.url, sourceId: source.id, sourceName: source.name, category: 'Погода', publishedAt: alert.publishedAt, severity: 'alert' }));
  return { items, weather: { alerts, forecasts } };
}

export function parseNbtNewsHtml(html, source) {
  const cards = [...html.matchAll(/<div\b[^>]*class="[^"]*card[^"]*"[^>]*data-filter="pr"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)];
  const items = cards.slice(0, 30).flatMap((match) => {
    const body = match[1];
    const heading = body.match(/card-title[\s\S]*?<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!heading) return [];
    const url = absoluteUrl(heading[1], source.url);
    const title = cleanText(heading[2]);
    const parsedContent = cleanText(body.match(/<p\b[^>]*class="[^"]*card-text[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
    const description = parsedContent.slice(0, 5000);
    const date = cleanText(body.match(/<div\b[^>]*class="[^"]*views[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    return [{ externalId: `${source.id}-${url}`, title, description, content: parsedContent.slice(0, 12_000), url, sourceId: source.id, sourceName: source.name, category: 'Финансы', publishedAt: parseDate(date), severity: 'normal' }];
  });
  if (!items.length) throw new AdapterContractError('NBT news card selectors returned no items');
  return { items };
}

const currencyIso = { '840': 'USD', '978': 'EUR', '156': 'CNY', '756': 'CHF', '810': 'RUB', '643': 'RUB' };
export function parseNbtRatesHtml(html, source) {
  const activeDate = html.match(/<option\b[^>]*value="(\d{2}\.\d{2}\.\d{4})"[^>]*selected/i)?.[1] || '';
  const table = html.match(/<tbody\b[^>]*class="[^"]*new__rate__nbt-table[^"]*"[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || '';
  const rates = [...table.matchAll(/<tr\b[^>]*class="[^"]*sortTRnbt[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap((row) => {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cleanText(cell[1]));
    return cells.length < 5 || !Number.isFinite(Number(cells[4])) ? [] : [{ numericCode: cells[1], code: currencyIso[cells[1]] || cells[1], unit: Number(cells[2]), nameRu: cells[3], rateTjs: Number(cells[4]), effectiveAt: parseDate(activeDate), sourceUrl: source.url }];
  });
  if (!rates.length) throw new AdapterContractError('NBT rate table selectors returned no rows');
  return { items: [], rates };
}

export async function fetchSourceAdapter(source, options = {}) {
  const html = await fetchTextWithRetry(source.url, options);
  if (source.adapter === 'rss') return parseFeed(html, source);
  if (source.adapter === 'kchs') return parseKchsHtml(html, source);
  if (source.adapter === 'meteo') return parseMeteoHtml(html, source);
  if (source.adapter === 'nbt-news') return parseNbtNewsHtml(html, source);
  if (source.adapter === 'nbt-rates') return parseNbtRatesHtml(html, source);
  throw new Error(`Unknown source adapter: ${source.adapter}`);
}
