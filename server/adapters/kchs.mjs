import { absoluteUrl, AdapterContractError, cleanText, extractImageUrl, fetchTextWithRetry, parseDate } from '../lib/html.mjs';

export function parseKchsHtml(html, source) {
  const articles = [...html.matchAll(/<article\b[^>]*class="[^"]*node-article[^"]*"[^>]*>([\s\S]*?)<\/article>/gi)];
  const items = articles.slice(0, 30).flatMap((match) => {
    const body = match[1];
    const heading = body.match(/<h2\b[^>]*class="[^"]*title[^"]*"[^>]*>[\s\S]*?<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!heading) return [];
    const title = cleanText(heading[2]);
    const date = body.match(/property="dc:date dc:created"\s+content="([^"]+)"/i)?.[1] || body.match(/Опубликована:\s*([^|<]+)/i)?.[1] || '';
    const summary = body.match(/field-name-body[\s\S]*?<div\b[^>]*class="[^"]*field-item[^" ]*\s+even[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
    const description = cleanText(summary).slice(0, 500);
    const url = absoluteUrl(heading[1], source.url);
    return [{ id: `${source.id}-${url}`, title, description, url, sourceId: source.id, sourceName: source.name, category: 'ЧС', publishedAt: parseDate(date), severity: /опас|угроз|авари|сел|лавин|землетр|пожар|спас|утоп|чрезвыч|ҳалокат/i.test(`${title} ${description}`) ? 'alert' : 'normal', imageUrl: extractImageUrl(body, url || source.url), imageAlt: title }];
  });
  if (!items.length) throw new AdapterContractError('KCHS article selectors returned no items');
  return { items };
}

export async function fetchKchs(source, options) { return parseKchsHtml(await fetchTextWithRetry(source.url, options), source); }
