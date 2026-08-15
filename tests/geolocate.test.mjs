import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createAiGeolocationResolver, createGeolocator, GEOLOCATION_THRESHOLD } from '../server/lib/geolocate.mjs';

const root = new URL('../', import.meta.url);
const locations = JSON.parse(await readFile(new URL('src/data/geography/locations.json', root), 'utf8'));
const aliases = JSON.parse(await readFile(new URL('src/data/geography/location-aliases.json', root), 'utf8'));
const geolocate = createGeolocator(locations.locations, aliases);

test('matches a bilingual canonical place with evidence', () => {
  const article = geolocate({ title: 'Навигарӣ аз шаҳри Душанбе', description: '' });
  assert.equal(article.locations[0].locationId, 'city-dushanbe');
  assert.ok(article.locations[0].confidence >= GEOLOCATION_THRESHOLD);
  assert.match(article.locations[0].evidence, /Душанбе/);
});

test('matches a historical name but does not invent an unknown place', () => {
  const historical = geolocate({ title: 'Событие в Курган-Тюбе', description: '' });
  assert.equal(historical.locations[0].locationId, 'city-bokhtar');
  assert.equal(geolocate({ title: 'Событие в неизвестном месте', description: '' }).locations.length, 0);
});

test('suppresses ambiguous short place names below threshold', () => {
  const article = geolocate({ title: 'Новости Навобод', description: '' });
  assert.equal(article.locations.length, 0);
  assert.ok(article.geolocationCandidates.length > 1);
});

test('AI resolves only an allowlisted ambiguous location', async () => {
  const article = geolocate({ title: 'Новости Навобод', description: '' });
  const resolve = createAiGeolocationResolver({ enabled: true, apiKey: 'test', baseUrl: 'https://ai.test/v1', model: 'test-model', fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ matches: [{ location_id: article.geolocationCandidates[0].locationId, confidence: 0.84, reason: 'Контекст соответствует кандидату' }] }) } }] }) }) });
  const result = await resolve(article);
  assert.equal(result.geolocationStatus, 'ai_resolved');
  assert.equal(result.locations[0].method, 'ai_disambiguation');
});

test('AI cannot invent a location ID', async () => {
  const article = geolocate({ title: 'Новости Навобод', description: '' });
  const resolve = createAiGeolocationResolver({ enabled: true, apiKey: 'test', baseUrl: 'https://ai.test/v1', model: 'test-model', fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"matches":[{"location_id":"city-invented","confidence":1}]}' } }] }) }) });
  const result = await resolve(article);
  assert.equal(result.locations.length, 0);
  assert.equal(result.geolocationStatus, 'review_required');
});
