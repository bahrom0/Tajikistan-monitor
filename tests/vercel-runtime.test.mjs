import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { shouldPersistChatLocally } from '../server/lib/chat-persistence.mjs';
import { fetchOpenAiStream } from '../server/lib/openai-stream.mjs';
import { requestClientIp } from '../server/lib/request-client.mjs';

test('Vercel client IP uses trusted forwarding headers without requiring a socket', () => {
  assert.equal(requestClientIp({ headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }, socket: null }), '203.0.113.7');
  assert.equal(requestClientIp({ headers: { 'x-real-ip': '198.51.100.4' }, socket: null }), '198.51.100.4');
  assert.equal(requestClientIp({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }), '127.0.0.1');
  assert.equal(requestClientIp({ headers: {}, socket: null }), 'local');
});

test('local chat files are disabled on Vercel but remain available in local development', () => {
  assert.equal(shouldPersistChatLocally({ VERCEL: '1' }), false);
  assert.equal(shouldPersistChatLocally({}), true);
  assert.equal(shouldPersistChatLocally({ VERCEL: '1', CHAT_LOCAL_PERSISTENCE: 'true' }), false);
  assert.equal(shouldPersistChatLocally({ CHAT_LOCAL_PERSISTENCE: 'false' }), false);
});

test('Vercel AI function is placed in Asia and outlives application AI timeouts', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const api = config.functions['api/index.mjs'];

  assert.deepEqual(config.regions, ['hkg1']);
  assert.equal(api.maxDuration, 300);
  assert.equal(api.supportsCancellation, true);
  assert.ok(api.maxDuration * 1000 > 180_000);
});

test('AI provider timing logs contain operational metadata but no prompt or key', async () => {
  const entries = [];
  const ticks = [100, 140, 175];
  const provider = await fetchOpenAiStream({ model: 'test-model', messages: [{ role: 'user', content: 'private prompt' }] }, {
    operation: 'test_operation',
    apiKey: 'private-key',
    baseUrl: 'https://provider.example/v1',
    region: 'hkg1',
    now: () => ticks.shift(),
    logger: { info: (event, details) => entries.push({ event, details }), warn: () => {} },
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://provider.example/v1/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer private-key');
      return new Response('', { status: 200 });
    },
  });

  provider.markFirstEvent();
  provider.markFirstEvent();

  assert.deepEqual(entries, [
    { event: 'ai_provider_headers', details: { operation: 'test_operation', model: 'test-model', providerHost: 'provider.example', region: 'hkg1', status: 200, durationMs: 40 } },
    { event: 'ai_provider_first_event', details: { operation: 'test_operation', model: 'test-model', providerHost: 'provider.example', region: 'hkg1', durationMs: 75, afterHeadersMs: 35 } },
  ]);
  assert.doesNotMatch(JSON.stringify(entries), /private prompt|private-key/);
});
