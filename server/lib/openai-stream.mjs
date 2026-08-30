const DEFAULT_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

export function resolveChatCompletionsUrl(value) {
  const raw = String(value || DEFAULT_CHAT_COMPLETIONS_URL).trim();
  const url = new URL(raw);
  const path = url.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/chat/completions')) url.pathname = `${path}/chat/completions`;
  return url.toString();
}

export async function fetchOpenAiStream(requestBody, {
  signal,
  operation = 'ai',
  fetchImpl = fetch,
  apiKey = process.env.OPENAI_API_KEY,
  baseUrl = process.env.OPENAI_BASE_URL,
  region = process.env.VERCEL_REGION || 'local',
  now = Date.now,
  logger = console,
} = {}) {
  const url = resolveChatCompletionsUrl(baseUrl);
  const startedAt = now();
  const metadata = {
    operation,
    model: String(requestBody?.model || ''),
    providerHost: new URL(url).hostname,
    region,
  };

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
    });
    const headersAt = now();
    logger.info?.('ai_provider_headers', {
      ...metadata,
      status: response.status,
      durationMs: headersAt - startedAt,
    });

    let firstEventSeen = false;
    return {
      response,
      markFirstEvent() {
        if (firstEventSeen) return;
        firstEventSeen = true;
        const firstEventAt = now();
        logger.info?.('ai_provider_first_event', {
          ...metadata,
          durationMs: firstEventAt - startedAt,
          afterHeadersMs: firstEventAt - headersAt,
        });
      },
    };
  } catch (error) {
    logger.warn?.('ai_provider_request_failed', {
      ...metadata,
      durationMs: now() - startedAt,
      message: error instanceof Error ? error.message : 'unknown',
    });
    throw error;
  }
}

export async function* parseOpenAiSse(body) {
  const decoder = new TextDecoder();
  let buffer = '';

  const parseEvent = (event) => {
    const data = event
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();
    if (!data || data === '[DONE]') return null;
    return JSON.parse(data);
  };

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const payload = parseEvent(event);
      if (payload) yield payload;
      boundary = buffer.indexOf('\n\n');
    }
  }

  buffer = (buffer + decoder.decode()).replace(/\r\n?/g, '\n');
  if (buffer.trim()) {
    const payload = parseEvent(buffer);
    if (payload) yield payload;
  }
}

export function contentDelta(payload) {
  const content = payload?.choices?.[0]?.delta?.content;
  return typeof content === 'string' ? content : '';
}
