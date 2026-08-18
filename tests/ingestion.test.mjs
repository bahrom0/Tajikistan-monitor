import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  articleTokens,
  canonicalizeUrl,
  createArticleIdentity,
  normalizeArticleText,
  retryDelaySeconds,
  sha256,
  strictDuplicateScore,
} from '../supabase/functions/_shared/ingestion.mjs';
import { parseKchsHtml, parseMeteoHtml, parseNbtRatesHtml } from '../supabase/functions/_shared/source-adapters.mjs';

const fixture = (name) => readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
const source = (id, url) => ({ id, name: id, kind: id, url });

test('Edge adapters preserve the tested Node adapter contracts', async () => {
  const kchs = parseKchsHtml(await fixture('kchs.html'), source('kchs', 'https://www.kchs.tj/'));
  const meteo = parseMeteoHtml(await fixture('meteo.html'), source('meteo', 'https://meteo.tj/ru'), new Date('2026-08-14T00:00:00Z'));
  const rates = parseNbtRatesHtml(await fixture('nbt-rates.html'), source('nbt-rates', 'https://nbt.tj/ru/kurs/kurs.php'));
  assert.equal(kchs.items[0].externalId, 'kchs-https://www.kchs.tj/node/100');
  assert.deepEqual(meteo.weather.forecasts.map(({ city }) => city), ['Душанбе', 'Худжанд']);
  assert.deepEqual(rates.rates.map(({ code }) => code), ['USD', 'EUR']);
});

test('ingestion identity removes tracking parameters and hashes content', async () => {
  assert.equal(canonicalizeUrl('https://EXAMPLE.test/a/?z=3&utm_source=x&id=2#top'), 'https://example.test/a?id=2&z=3');
  assert.equal(normalizeArticleText('  СЕЛЬ — в ДУШАНБЕ!  '), 'сель в душанбе');
  assert.match(await sha256('news'), /^[a-f0-9]{64}$/);
  const left = await createArticleIdentity({ title: 'Сель в Душанбе', description: 'Опасность в горных районах.', url: 'https://example.test/news?utm_source=rss' });
  const right = await createArticleIdentity({ title: 'СЕЛЬ — в Душанбе!', description: 'Опасность в горных районах', url: 'https://EXAMPLE.test/news/' });
  assert.equal(left.contentHash, right.contentHash);
  assert.equal(left.canonicalUrl, right.canonicalUrl);
});

test('strict duplicate similarity requires close text, time and compatible place', () => {
  const base = {
    category: 'ЧС',
    publishedAt: '2026-08-15T08:00:00Z',
    locationIds: ['city-dushanbe'],
    titleTokens: articleTokens('Предупреждение о сильном селе в Душанбе'),
    textTokens: articleTokens('Комитет предупредил жителей о сильном селе в горных районах Душанбе сегодня'),
  };
  const sameEvent = {
    ...base,
    publishedAt: '2026-08-15T09:00:00Z',
    titleTokens: articleTokens('Предупреждение о сильном селе в Душанбе!'),
    textTokens: articleTokens('Комитет предупредил жителей о сильном селе в горных районах Душанбе сегодня.'),
  };
  assert.ok(strictDuplicateScore(base, sameEvent) >= 0.91);
  assert.equal(strictDuplicateScore(base, { ...sameEvent, locationIds: ['city-khujand'] }), null);
  assert.equal(strictDuplicateScore(base, { ...sameEvent, publishedAt: '2026-08-16T09:00:00Z' }), null);
  assert.equal(strictDuplicateScore(base, {
    ...sameEvent,
    titleTokens: articleTokens('Открылась новая школа в Душанбе'),
    textTokens: articleTokens('Ученики начали занятия в новом здании школы'),
  }), null);
});

test('retry backoff is exponential and capped', () => {
  assert.deepEqual([1, 2, 3, 9].map(retryDelaySeconds), [60, 120, 240, 1800]);
});

test('persistent ingestion migration protects writes and claims jobs with skip locked', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20260815050517_task_08_persistent_ingestion.sql', import.meta.url), 'utf8');
  assert.match(migration, /create table public\.articles/i);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /grant execute on function public\.claim_ingestion_jobs\(integer, uuid\) to service_role/i);
  assert.match(migration, /alter table public\.source_fetch_runs enable row level security/i);
  assert.doesNotMatch(migration, /sb_secret_|sb_publishable_/i);
});

test('worker rejects public keys before opening the queue', async () => {
  const sourceCode = await readFile(new URL('../supabase/functions/ingest-worker/index.ts', import.meta.url), 'utf8');
  assert.match(sourceCode, /startsWith\("sb_secret_"\)/);
  assert.doesNotMatch(sourceCode, /SUPABASE_SERVICE_ROLE_KEY|sb_publishable_/);
});

test('deduplication migration links sources and keeps ingestion atomic and private', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20260815184924_task_09_article_deduplication.sql', import.meta.url), 'utf8');
  assert.match(migration, /create table public\.article_sources/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /private\.token_jaccard/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /candidate\.title_score >= 0\.96/i);
  assert.match(migration, /candidate\.text_score >= 0\.90/i);
  assert.match(migration, /alter table public\.article_sources enable row level security/i);
  assert.match(migration, /grant execute on function public\.ingest_article_source/i);
  assert.doesNotMatch(migration, /security definer|sb_secret_|sb_publishable_/i);
});

test('worker routes articles through the atomic deduplication RPC', async () => {
  const sourceCode = await readFile(new URL('../supabase/functions/ingest-worker/index.ts', import.meta.url), 'utf8');
  assert.match(sourceCode, /rpc\("ingest_article_source"/);
  assert.doesNotMatch(sourceCode, /from\("articles"\)\.upsert/);
});
