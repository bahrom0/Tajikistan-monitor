import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildRuleEnrichment,
  enrichArticle,
  ENRICHMENT_PROMPT_VERSION,
} from '../supabase/functions/_shared/article-enrichment.mjs';
import { locationsDataset as edgeGeography } from '../supabase/functions/_shared/geography-data.mjs';
import canonicalGeography from '../src/data/geography/locations.json' with { type: 'json' };
import { parseFeed } from '../supabase/functions/_shared/source-adapters.mjs';

const article = (overrides = {}) => ({
  title: 'Предупреждение об опасности схода селя в Душанбе',
  description: 'Жителям Душанбе рекомендуют избегать русел рек.',
  content: 'Жителям Душанбе рекомендуют избегать русел рек.',
  url: 'https://www.kchs.tj/example',
  sourceId: 'kchs',
  sourceKind: 'ЧС',
  language: 'ru',
  severity: 'alert',
  ...overrides,
});

test('Edge enrichment geography stays aligned with the canonical dataset', () => {
  const canonical = canonicalGeography.locations.map(({ id, type, name_ru, name_tg, parent_id, longitude, latitude }) => ({ id, type, name_ru, name_tg, parent_id, longitude, latitude }));
  assert.deepEqual(edgeGeography.locations, canonical);
});

test('rules resolve canonical place, category and official warning before AI', () => {
  const result = buildRuleEnrichment(article());
  assert.equal(result.category, 'ЧС');
  assert.equal(result.importance, 'warning');
  assert.ok(result.locations.some((location) => location.location_id === 'city-dushanbe'));
  assert.ok(result.locations.every((location) => location.evidence));
});

test('critical is deterministic and restricted to explicit official signals', () => {
  const official = buildRuleEnrichment(article({
    title: 'Объявлено чрезвычайное положение в Душанбе',
    content: 'Объявлено чрезвычайное положение в Душанбе.',
  }));
  const media = buildRuleEnrichment(article({
    sourceId: 'requested-media',
    title: 'Объявлено чрезвычайное положение в Душанбе',
    content: 'Объявлено чрезвычайное положение в Душанбе.',
  }));
  assert.equal(official.importance, 'critical');
  assert.equal(media.importance, 'warning');
});

test('AI enrichment accepts only structured evidence and canonical location ids', async () => {
  const input = article({
    title: 'В Душанбе временно изменят движение транспорта',
    description: 'Движение будет ограничено возле центральной площади.',
    content: 'Движение будет ограничено возле центральной площади.',
    severity: 'normal',
  });
  const result = await enrichArticle(input, {
    enabled: true,
    apiKey: 'test-key',
    baseUrl: 'https://provider.test/v1',
    model: 'test-model',
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      category: 'Транспорт',
      category_confidence: 0.94,
      importance: 'important',
      importance_confidence: 0.88,
      importance_evidence: ['Движение будет ограничено'],
      locations: [{ location_id: 'city-dushanbe', confidence: 0.9, evidence: 'В Душанбе' }],
      context_summary: 'В столице временно изменится схема движения.',
      key_facts: ['Изменение временное'],
      uncertainties: ['Точный срок не указан'],
    }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.category, 'Транспорт');
  assert.equal(result.importance, 'important');
  assert.equal(result.model, 'test-model');
  assert.equal(result.promptVersion, ENRICHMENT_PROMPT_VERSION);
  assert.ok(result.locations.some((location) => location.location_id === 'city-dushanbe'));
});

test('AI cannot invent a location or promote unverified content to critical', async () => {
  const input = article({ title: 'Открылась выставка', description: 'В музее открылась выставка.', content: 'В музее открылась выставка.', severity: 'normal' });
  const result = await enrichArticle(input, {
    enabled: true,
    apiKey: 'test-key',
    baseUrl: 'https://provider.test/v1',
    model: 'test-model',
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      category: 'Культура', category_confidence: 0.9,
      importance: 'critical', importance_confidence: 0.99,
      importance_evidence: ['несуществующая чрезвычайная ситуация'],
      locations: [{ location_id: 'city-invented', confidence: 1, evidence: 'В музее' }],
      context_summary: 'Культурное событие.', key_facts: [], uncertainties: [],
    }) } }] }), { status: 200 }),
  });
  assert.equal(result.importance, 'info');
  assert.equal(result.locations.length, 0);
});

test('AI provider failure preserves rule result and records a safe failure', async () => {
  const result = await enrichArticle(article(), {
    enabled: true,
    apiKey: 'test-key',
    baseUrl: 'https://provider.test/v1',
    model: 'test-model',
    fetchImpl: async () => new Response('', { status: 503 }),
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.importance, 'warning');
  assert.equal(result.errorCode, 'AI_HTTP_503');
});

test('RSS adapter keeps bounded sanitized content for enrichment', () => {
  const longText = 'Душанбе '.repeat(900);
  const feed = `<rss><channel><item><title>Тест</title><link>https://example.test/a</link><description><![CDATA[${longText}]]></description></item></channel></rss>`;
  const parsed = parseFeed(feed, { id: 'test', name: 'Test', kind: 'Общество', url: 'https://example.test/feed' });
  assert.equal(parsed.items.length, 1);
  assert.ok(parsed.items[0].content.length > 500);
  assert.ok(parsed.items[0].content.length <= 12_000);
  assert.ok(parsed.items[0].description.length <= 5000);
});

test('task 4 migration keeps enrichment private for writes and worker caches AI', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20260815195007_task_04_ai_article_enrichment.sql', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../supabase/functions/ingest-worker/index.ts', import.meta.url), 'utf8');
  assert.match(migration, /create table public\.article_enrichments/i);
  assert.match(migration, /create table public\.article_locations/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /grant execute on function public\.store_article_enrichment/i);
  assert.match(migration, /alter table public\.article_locations enable row level security/i);
  assert.doesNotMatch(migration, /security definer|sb_secret_|sb_publishable_/i);
  assert.match(worker, /buildRuleEnrichment/);
  assert.match(worker, /ENRICHMENT_PROMPT_VERSION/);
  assert.match(worker, /recentFailure/);
  assert.match(worker, /rpc\("store_article_enrichment"/);
});
