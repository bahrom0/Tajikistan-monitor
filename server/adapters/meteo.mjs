import { AdapterContractError, cleanText, fetchTextWithRetry } from '../lib/html.mjs';

export function parseMeteoHtml(html, source, now = new Date()) {
  const alertText = cleanText(html.match(/<h2\b[^>]*>\s*Предупреждение!\s*<\/h2>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
  const forecastSection = html.match(/Прогноз погоды на сегодня[\s\S]*?<ul\b[^>]*class="[^"]*splide__list[^"]*"[^>]*>([\s\S]*?)<\/ul>/i)?.[1] || '';
  const forecasts = [...forecastSection.matchAll(/<li\b[^>]*class="[^"]*splide__slide[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)].flatMap((match) => {
    const headings = [...match[1].matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)].map((item) => cleanText(item[1]));
    return headings.length < 2 ? [] : [{ city: headings[0], temperature: headings[1].replace(/\s+/g, ''), observedAt: now.toISOString(), sourceUrl: source.url }];
  });
  if (!alertText && !forecasts.length) throw new AdapterContractError('Meteo alert and forecast selectors returned no data');
  const alerts = alertText ? [{ id: `${source.id}-alert-${now.toISOString().slice(0, 10)}`, text: alertText, severity: 'alert', publishedAt: now.toISOString(), sourceUrl: source.url }] : [];
  const items = alerts.map((alert) => ({ id: alert.id, title: 'Метеорологическое предупреждение', description: alert.text, url: source.url, sourceId: source.id, sourceName: source.name, category: 'Погода', publishedAt: alert.publishedAt, severity: 'alert' }));
  return { items, weather: { alerts, forecasts } };
}

export async function fetchMeteo(source, options) { return parseMeteoHtml(await fetchTextWithRetry(source.url, options), source); }
