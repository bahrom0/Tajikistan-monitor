const text = (value = '') => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

const field = (xml, names) => {
  for (const name of names) {
    const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return text(match[1]);
  }
  return '';
};

const link = (xml) => {
  const simple = field(xml, ['link']);
  if (simple.startsWith('http')) return simple;
  return xml.match(/<link[^>]+href=["']([^"']+)/i)?.[1] ?? '';
};

export function parseFeed(xml, source) {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)];
  return blocks.slice(0, 30).map((match, index) => {
    const body = match[2];
    const title = field(body, ['title']) || 'Без заголовка';
    const publishedAt = field(body, ['pubDate', 'published', 'updated']);
    const description = field(body, ['description', 'summary', 'content:encoded', 'content']);
    const url = link(body);
    return {
      id: `${source.id}-${publishedAt || index}-${title}`,
      title,
      description: description.slice(0, 360),
      url,
      sourceId: source.id,
      sourceName: source.name,
      category: source.kind,
      publishedAt: Number.isNaN(Date.parse(publishedAt)) ? new Date().toISOString() : new Date(publishedAt).toISOString(),
      severity: /авари|землетр|сел|опас|чрезвыч|ҳалокат/i.test(`${title} ${description}`) ? 'alert' : 'normal',
    };
  });
}

export async function fetchSource(source, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(source.url, {
    signal: AbortSignal.timeout(10_000),
    headers: { 'User-Agent': 'TajikistanMonitor/0.1 (+olympiad educational project)', Accept: 'application/rss+xml, application/xml, text/xml' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseFeed(await response.text(), source);
}
