import assert from 'node:assert/strict';
import test from 'node:test';
import { contentDelta, parseOpenAiSse, resolveChatCompletionsUrl } from '../server/lib/openai-stream.mjs';

const streamFrom = (...chunks) => new ReadableStream({
  start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
    controller.close();
  },
});

test('chat completions URL accepts a provider base URL or a full endpoint', () => {
  assert.equal(resolveChatCompletionsUrl('https://integrate.api.nvidia.com/v1'), 'https://integrate.api.nvidia.com/v1/chat/completions');
  assert.equal(resolveChatCompletionsUrl('https://example.test/v1/chat/completions'), 'https://example.test/v1/chat/completions');
});

test('OpenAI-compatible SSE parser handles network chunk boundaries', async () => {
  const body = streamFrom(
    'data: {"choices":[{"delta":{"con',
    'tent":"При"}}]}\r',
    '\n\r\ndata: {"choices":[{"delta":{"content":"вет"}}]}\n',
    '\ndata: [DONE]\n\n',
  );
  const tokens = [];
  for await (const payload of parseOpenAiSse(body)) tokens.push(contentDelta(payload));
  assert.deepEqual(tokens, ['При', 'вет']);
});

test('reasoning deltas are not exposed as user-facing answer text', () => {
  assert.equal(contentDelta({ choices: [{ delta: { reasoning_content: 'hidden reasoning' } }] }), '');
});
