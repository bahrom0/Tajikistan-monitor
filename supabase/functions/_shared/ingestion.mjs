export function canonicalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|yclid|mc_cid|mc_eid)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/{2,}/g, '/');
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/$/, '');
    const sortedParams = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    ));
    url.search = '';
    for (const [key, parameterValue] of sortedParams) url.searchParams.append(key, parameterValue);
    return url.toString();
  } catch {
    return '';
  }
}

const ARTICLE_STOP_WORDS = new Set([
  'для', 'как', 'что', 'это', 'при', 'или', 'его', 'она', 'они', 'был', 'была', 'были',
  'дар', 'барои', 'аст', 'буд', 'шуда', 'карда', 'бо', 'ва', 'ёки', 'аз', 'ба',
]);

export function normalizeArticleText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function articleTokens(value, limit = 200) {
  const seen = new Set();
  const tokens = [];
  for (const token of normalizeArticleText(value).split(' ')) {
    if (token.length < 3 || ARTICLE_STOP_WORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= limit) break;
  }
  return tokens;
}

export function normalizeLocationIds(value) {
  const rawLocations = Array.isArray(value) ? value : [];
  return [...new Set(rawLocations.flatMap((location) => {
    if (typeof location === 'string') return [location];
    if (location && typeof location === 'object') {
      const id = location.locationId ?? location.location_id ?? location.id;
      return typeof id === 'string' ? [id] : [];
    }
    return [];
  }).filter((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(id)))].sort();
}

/**
 * @param {{ title: unknown, description: unknown, url: unknown, locations?: unknown[] }} article
 */
export async function createArticleIdentity({ title, description, url, locations = [] }) {
  const normalizedTitle = normalizeArticleText(title);
  const normalizedText = normalizeArticleText(description);
  const canonicalUrl = canonicalizeUrl(url);
  const normalizedContent = `${normalizedTitle}\n${normalizedText}`;
  return {
    canonicalUrl,
    normalizedTitle,
    normalizedText,
    titleTokens: articleTokens(normalizedTitle, 40),
    textTokens: articleTokens(normalizedText, 200),
    locationIds: normalizeLocationIds(locations),
    contentHash: await sha256(normalizedContent),
  };
}

export function tokenJaccard(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (!leftSet.size || !rightSet.size) return 0;
  let intersection = 0;
  for (const token of leftSet) if (rightSet.has(token)) intersection += 1;
  return intersection / new Set([...leftSet, ...rightSet]).size;
}

export function strictDuplicateScore(left, right) {
  const publishedDelta = Math.abs(Date.parse(left.publishedAt) - Date.parse(right.publishedAt));
  if (!Number.isFinite(publishedDelta) || publishedDelta > 12 * 60 * 60 * 1000) return null;
  if (left.category !== right.category) return null;
  const leftLocations = new Set(left.locationIds || []);
  const rightLocations = new Set(right.locationIds || []);
  const bothWithoutPlaces = leftLocations.size === 0 && rightLocations.size === 0;
  const bothWithPlaces = leftLocations.size > 0 && rightLocations.size > 0;
  if (!bothWithoutPlaces && !bothWithPlaces) return null;
  if (bothWithPlaces && ![...leftLocations].some((id) => rightLocations.has(id))) return null;
  const titleScore = tokenJaccard(left.titleTokens, right.titleTokens);
  const textScore = tokenJaccard(left.textTokens, right.textTokens);
  const timeScore = 1 - (publishedDelta / (12 * 60 * 60 * 1000));
  const score = bothWithPlaces
    ? (titleScore * 0.52) + (textScore * 0.33) + (timeScore * 0.10) + 0.05
    : (titleScore * 0.58) + (textScore * 0.37) + (timeScore * 0.05);
  const accepted = bothWithPlaces
    ? titleScore >= 0.90 && textScore >= 0.82 && score >= 0.91
    : titleScore >= 0.96 && textScore >= 0.90 && score >= 0.94;
  return accepted ? score : null;
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function retryDelaySeconds(attempt) {
  return Math.min(1800, 60 * (2 ** Math.max(0, Number(attempt || 1) - 1)));
}

export const safeError = (error) => ({
  code: String(error?.name || error?.code || 'INGESTION_ERROR').slice(0, 100),
  message: String(error?.message || error || 'Unknown ingestion error').slice(0, 500),
});
