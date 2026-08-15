export const decodeHtml = (value = '') => value
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

export const absoluteUrl = (value, baseUrl) => {
  try { return new URL(decodeHtml(value), baseUrl).toString(); } catch { return ''; }
};

export const parseDate = (value, fallback = new Date()) => {
  const text = cleanText(value);
  const match = text.match(/\b(\d{2})[./](\d{2})[./](\d{4})\b/);
  if (match) return new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00+05:00`).toISOString();
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? fallback.toISOString() : new Date(parsed).toISOString();
};

export class AdapterContractError extends Error {
  constructor(message) { super(message); this.name = 'AdapterContractError'; this.code = 'ADAPTER_CONTRACT'; }
}

export async function fetchTextWithRetry(url, { fetchImpl = fetch, timeoutMs = 12_000, attempts = 3, maxBytes = 3_000_000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'TajikistanMonitor/0.1 (+olympiad educational project; contact: local-owner)', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5' } });
      if (!response.ok) { const error = new Error(`HTTP ${response.status}`); error.retryable = response.status === 429 || response.status >= 500; throw error; }
      const declared = Number(response.headers?.get?.('content-length') || 0);
      if (declared > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`);
      const body = await response.text();
      if (Buffer.byteLength(body, 'utf8') > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`);
      return body;
    } catch (error) {
      lastError = error;
      if (attempt === attempts || error.retryable === false || /exceeds/.test(error.message)) break;
      await new Promise((resolve) => setTimeout(resolve, 200 * (2 ** (attempt - 1))));
    }
  }
  throw lastError;
}
