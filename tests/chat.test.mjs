import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkdownBlocks } from '../src/lib/markdown.mjs';
import { CHAT_TOOLS_DEFINITIONS, executeChatTool } from '../server/lib/chat-tools.mjs';
import { createToolMarkupStreamFilter, normalizeToolArguments, parseTextToolCalls } from '../server/lib/chat-tool-protocol.mjs';
import {
  createConversation,
  listConversations,
  createMessage,
  listMessages,
  updateConversation,
  deleteConversation,
  truncateMessagesAfter,
  generateConversationTitle,
  buildOptimizedContext,
} from '../server/lib/chat-persistence.mjs';

test('parseMarkdownBlocks parses fenced code blocks and tables', () => {
  const input = `## Заголовок
Вот пример кода:
\`\`\`typescript
const greeting = "Салом, Тоҷикистон";
console.log(greeting);
\`\`\`

И таблица:
| Валюта | Название | Курс |
| :--- | :--- | :--- |
| USD | Доллар США | 10.93 |
| EUR | Евро | 11.95 |
`;

  const blocks = parseMarkdownBlocks(input);
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[0].text, 'Заголовок');
  assert.equal(blocks[1].type, 'paragraph');
  assert.equal(blocks[2].type, 'code');
  assert.equal(blocks[2].language, 'typescript');
  assert.match(blocks[2].code, /greeting/);
  assert.equal(blocks[3].type, 'paragraph');
  assert.equal(blocks[4].type, 'table');
  assert.deepEqual(blocks[4].headers, ['Валюта', 'Название', 'Курс']);
  assert.equal(blocks[4].rows.length, 2);
  assert.equal(blocks[4].rows[0][0], 'USD');
});

test('chat-tools definition contains required functions', () => {
  const names = CHAT_TOOLS_DEFINITIONS.map((t) => t.function.name);
  assert.ok(names.includes('search_news'));
  assert.ok(names.includes('get_recent_news'));
  assert.ok(names.includes('get_location_info'));
  assert.ok(names.includes('get_weather_and_rates'));
  assert.ok(names.includes('research_place'));
});

test('DSML fallback tool calls are parsed and never leak into streamed text', () => {
  const dsml = `< | | DSML | | toolcalls>< | | DSML | | invoke name="researchplace">< | | DSML | | parameter name="location" string="true">Худжанд< / | | DSML | / | parameter>< | | DSML | | parameter name="perioddays" string="false">7< / | | DSML | / | parameter>< / | | DSML | / | invoke>< / | | DSML | / | toolcalls>`;
  const parsed = parseTextToolCalls(`Сначала проверю источники. ${dsml}`);

  assert.equal(parsed.cleanText, 'Сначала проверю источники.');
  assert.equal(parsed.toolCalls.length, 1);
  assert.equal(parsed.toolCalls[0].name, 'research_place');
  assert.deepEqual(JSON.parse(parsed.toolCalls[0].arguments), {
    location_id: 'Худжанд',
    period_days: 7,
  });

  let visible = '';
  const filter = createToolMarkupStreamFilter((text) => { visible += text; });
  for (const chunk of ['Сначала проверю. < | | D', 'SML | | toolcalls>', dsml.slice(dsml.indexOf('>') + 1)]) {
    filter.feed(chunk);
  }
  filter.flush();
  assert.equal(visible, 'Сначала проверю. ');
  assert.equal(filter.suppressed, true);
});

test('decorated DSML opening tags and native argument aliases are normalized', () => {
  const dsml = `< | | DSML | | toolcalls>< / | / DSML | / invoke name="searchwebexa">< | / DSML | / parameter name="query" string="true">новости Худжанд< / | / DSML / | / parameter>< | | DSML | | parameter name="numresults" string="false">6< / | / DSML / | / parameter>< / | / DSML | | invoke>< / | / DSML / | / toolcalls>`;
  const parsed = parseTextToolCalls(dsml);

  assert.equal(parsed.cleanText, '');
  assert.equal(parsed.toolCalls.length, 1);
  assert.equal(parsed.toolCalls[0].name, 'search_web_exa');
  assert.deepEqual(JSON.parse(parsed.toolCalls[0].arguments), {
    query: 'новости Худжанд',
    num_results: 6,
  });
  assert.deepEqual(normalizeToolArguments('search_news', { location: 'Худжанд', keywords: '' }), {
    location_id: 'Худжанд',
    query: 'Худжанд',
  });
});

test('executeChatTool handles search_news and get_location_info', async () => {
  const dummyLocations = [
    { id: 'dushanbe', name_ru: 'Душанбе', name_tg: 'Душанбе', type: 'capital', longitude: 68.78, latitude: 38.56 },
    { id: 'khujand', name_ru: 'Худжанд', name_tg: 'Хуҷанд', type: 'city', longitude: 69.62, latitude: 40.28 },
    { id: 'city-khujand', name_ru: 'Худжанд', name_tg: 'Хуҷанд', type: 'city', longitude: 69.62, latitude: 40.28 },
  ];
  const locationsById = new Map(dummyLocations.map((l) => [l.id, l]));

  const mockContext = {
    loadNews: async () => ({
      items: [
        {
          id: '1',
          title: 'В Душанбе открылась выставка',
          description: 'Официальное культурное событие',
          sourceName: 'Ховар',
          category: 'Культура',
          publishedAt: '2026-08-21T10:00:00Z',
          severity: 'normal',
          locations: [{ locationId: 'dushanbe', nameRu: 'Душанбе' }],
          url: 'https://khovar.tj/news/1',
        },
      ],
      rates: [{ code: 'USD', nameRu: 'Доллар США', rateTjs: 10.93, unit: 1, effectiveAt: '2026-08-21' }],
      weather: { alerts: [], forecasts: [{ city: 'Душанбе', temperature: '+38' }] },
    }),
    locationsById,
    locationDataset: { locations: dummyLocations },
    aliasDataset: {},
  };

  // Test search_news
  const searchRes = await executeChatTool('search_news', { query: 'выставка' }, mockContext);
  assert.equal(searchRes.success, true);
  assert.equal(searchRes.articles.length, 1);
  assert.equal(searchRes.sources.length, 1);
  assert.equal(searchRes.sources[0].domain, 'Ховар');

  // Test get_location_info
  const locRes = await executeChatTool('get_location_info', { location_query: 'Худжанд' }, mockContext);
  assert.equal(locRes.success, true);
  assert.equal(locRes.location.id, 'khujand');
  assert.equal(locRes.location.name_tg, 'Хуҷанд');

  // Test get_weather_and_rates
  const weatherRes = await executeChatTool('get_weather_and_rates', { type: 'all' }, mockContext);
  assert.equal(weatherRes.success, true);
  assert.ok(weatherRes.data.exchange_rates);
  assert.ok(weatherRes.data.weather);

  const researchRes = await executeChatTool('research_place', { location_id: 'khudzhand', period_days: 7 }, mockContext);
  assert.equal(researchRes.success, true);
  assert.equal(researchRes.place.id, 'city-khujand');
});

test('chat persistence CRUD and sliding window context work correctly', async () => {
  const sessionId = 'test-session-' + Date.now();

  // Create conversation
  const conv = await createConversation({ sessionId, title: 'Тестовый диалог' });
  assert.ok(conv.id);
  assert.equal(conv.title, 'Тестовый диалог');

  // Add messages
  const msg1 = await createMessage({ conversationId: conv.id, role: 'user', content: 'Привет' });
  const msg2 = await createMessage({ conversationId: conv.id, role: 'assistant', content: 'Салом!' });
  const msg3 = await createMessage({ conversationId: conv.id, role: 'user', content: 'Какая погода?' });

  const messages = await listMessages(conv.id);
  assert.equal(messages.length, 3);
  assert.equal(messages[0].content, 'Привет');
  assert.equal(messages[1].content, 'Салом!');

  // Test sliding window context
  const context = buildOptimizedContext('System Prompt', messages, 'И какой курс?', 2);
  assert.equal(context[0].role, 'system');
  assert.equal(context.length, 4); // system + last 2 past messages + current prompt

  // Truncate messages after msg1
  await truncateMessagesAfter(conv.id, msg1.id);
  const truncatedMsgs = await listMessages(conv.id);
  assert.equal(truncatedMsgs.length, 1);
  assert.equal(truncatedMsgs[0].id, msg1.id);

  // Update conversation title
  const updated = await updateConversation(conv.id, { title: 'Обновленный заголовок' }, { sessionId });
  assert.equal(updated.title, 'Обновленный заголовок');

  // List conversations
  const list = await listConversations({ sessionId });
  assert.ok(list.some((c) => c.id === conv.id));

  // Delete conversation
  await deleteConversation(conv.id, { sessionId });
  const afterDelete = await listConversations({ sessionId });
  assert.ok(!afterDelete.some((c) => c.id === conv.id));
});
