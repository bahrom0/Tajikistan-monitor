import { absoluteUrl, AdapterContractError, cleanText, extractImageUrl, fetchTextWithRetry, parseDate } from '../lib/html.mjs';

export function parseNbtNewsHtml(html, source) {
  const cards = [...html.matchAll(/<div\b[^>]*class="[^"]*card[^"]*"[^>]*data-filter="pr"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)];
  const items = cards.slice(0, 30).flatMap((match) => {
    const body = match[1];
    const heading = body.match(/card-title[\s\S]*?<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!heading) return [];
    const url = absoluteUrl(heading[1], source.url);
    const title = cleanText(heading[2]);
    if (!title) return [];
    const description = cleanText(body.match(/<p\b[^>]*class="[^"]*card-text[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '').slice(0, 500);
    const date = cleanText(body.match(/<div\b[^>]*class="[^"]*views[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    return [{ id: `${source.id}-${url}`, title, description, url, sourceId: source.id, sourceName: source.name, category: 'Финансы', publishedAt: parseDate(date), severity: 'normal', imageUrl: extractImageUrl(body, url || source.url), imageAlt: title }];
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

export async function fetchNbtNews(source, options) { return parseNbtNewsHtml(await fetchTextWithRetry(source.url, options), source); }
export async function fetchNbtRates(source, options) { return parseNbtRatesHtml(await fetchTextWithRetry(source.url, options), source); }
