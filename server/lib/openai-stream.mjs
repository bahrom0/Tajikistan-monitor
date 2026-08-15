const DEFAULT_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

export function resolveChatCompletionsUrl(value) {
  const raw = String(value || DEFAULT_CHAT_COMPLETIONS_URL).trim();
  const url = new URL(raw);
  const path = url.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/chat/completions')) url.pathname = `${path}/chat/completions`;
  return url.toString();
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
