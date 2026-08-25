import assert from 'node:assert/strict';
import test from 'node:test';
import { __resetArticleImageCacheForTests, hydrateArticleImages } from '../server/lib/article-images.mjs';
import { buildNewsOverview, buildQuickNow } from '../server/lib/news-overview.mjs';

const item = {
  id: 'n-1', title: 'Ограничение движения на дороге', description: 'Дорожные службы ведут работы.',
  url: 'https://official.test/news/1', sourceId: 'official', sourceName: 'Официальный источник',
  category: 'Транспорт', publishedAt: '2026-08-25T08:00:00.000Z', severity: 'alert',
  importance: 'warning', locations: [{ nameRu: 'Душанбе', locationType: 'city' }],
};

test('news overview normalizes articles and creates only data-backed quick cards', () => {
  const data = {
    items: [item], statuses: [],
    weather: { forecasts: [{ city: 'Душанбе', temperature: '+31...+33°C', observedAt: '2026-08-25T08:00:00.000Z', sourceUrl: 'https://meteo.tj/ru' }], alerts: [] },
    rates: [{ code: 'USD', unit: 1, rateTjs: 9.25, effectiveAt: '2026-08-25T00:00:00.000Z', sourceUrl: 'https://nbt.tj/' }],
  };
  const overview = buildNewsOverview(data, new Date('2026-08-25T09:00:00.000Z'));
  assert.equal(overview.items[0].importance, 'high');
  assert.equal(overview.items[0].city, 'Душанбе');
  assert.deepEqual(overview.quick.map((card) => card.kind), ['weather', 'exchange', 'road']);
  assert.equal(buildQuickNow({ items: [], weather: {}, rates: [] }).length, 0);
});

test('article image hydration only fetches configured source hosts', async () => {
  __resetArticleImageCacheForTests();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true, status: 200,
      headers: { get: () => null },
      text: async () => '<meta property="og:image" content="https://cdn.official.test/photo.jpg">',
    };
  };
  const hydrated = await hydrateArticleImages([
    item,
    { ...item, id: 'n-2', url: 'https://untrusted.test/news/2' },
  ], [{ id: 'official', url: 'https://official.test/' }], { fetchImpl, limit: 2, concurrency: 1 });
  assert.equal(calls, 1);
  assert.equal(hydrated[0].imageUrl, 'https://cdn.official.test/photo.jpg');
  assert.equal(hydrated[1].imageUrl, undefined);
});
