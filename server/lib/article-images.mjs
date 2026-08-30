import { extractImageUrl, fetchTextWithRetry } from './html.mjs';

const imageCache = new Map();

const normalizedHost = (value) => value.replace(/^www\./i, '').toLowerCase();

const belongsToSource = (articleUrl, sourceUrl) => {
  try {
    const article = new URL(articleUrl);
    const source = new URL(sourceUrl);
    if (!['http:', 'https:'].includes(article.protocol)) return false;
    const articleHost = normalizedHost(article.hostname);
    const sourceHost = normalizedHost(source.hostname);
    return articleHost === sourceHost || articleHost.endsWith(`.${sourceHost}`);
  } catch {
    return false;
  }
};

async function resolveImage(item, sourcesById, options) {
  if (item.imageUrl || !item.url) return item;
  const source = sourcesById.get(item.sourceId);
  if (!source || !belongsToSource(item.url, source.url)) return item;
  if (imageCache.has(item.url)) {
    const cached = imageCache.get(item.url);
    return cached ? { ...item, imageUrl: cached, imageAlt: item.title } : item;
  }

  try {
    const html = await fetchTextWithRetry(item.url, {
      fetchImpl: options.fetchImpl,
      attempts: options.attempts ?? 1,
      timeoutMs: options.timeoutMs ?? 8_000,
      maxBytes: options.maxBytes ?? 2_000_000,
    });
    const imageUrl = extractImageUrl(html, item.url);
    imageCache.set(item.url, imageUrl);
    return imageUrl ? { ...item, imageUrl, imageAlt: item.title } : item;
  } catch {
    imageCache.set(item.url, '');
    return item;
  }
}

export async function hydrateArticleImages(items, sources, options = {}) {
  const limit = Math.max(0, Math.min(Number(options.limit ?? 18), 30));
  const concurrency = Math.max(1, Math.min(Number(options.concurrency ?? 3), 6));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const result = [...items];
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, limit) }, async () => {
    while (cursor < Math.min(limit, result.length)) {
      const index = cursor;
      cursor += 1;
      result[index] = await resolveImage(result[index], sourcesById, options);
    }
  });
  await Promise.all(workers);
  return result;
}

export const __resetArticleImageCacheForTests = () => imageCache.clear();
