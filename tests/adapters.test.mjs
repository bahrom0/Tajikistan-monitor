import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseKchsHtml } from '../server/adapters/kchs.mjs';
import { parseMeteoHtml } from '../server/adapters/meteo.mjs';
import { parseNbtNewsHtml, parseNbtRatesHtml } from '../server/adapters/nbt.mjs';
import { AdapterContractError, fetchTextWithRetry } from '../server/lib/html.mjs';

const fixture = (name) => readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
const source = (id, url) => ({ id, name: id, url });

test('KCHS adapter normalizes official emergency cards', async () => {
  const result = parseKchsHtml(await fixture('kchs.html'), source('kchs', 'https://www.kchs.tj/'));
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].severity, 'alert');
  assert.equal(result.items[0].url, 'https://www.kchs.tj/node/100');
});

test('Meteo adapter separates alert from forecast', async () => {
  const result = parseMeteoHtml(await fixture('meteo.html'), source('meteo', 'https://meteo.tj/ru'), new Date('2026-08-14T00:00:00Z'));
  assert.equal(result.items.length, 1);
  assert.equal(result.weather.alerts.length, 1);
  assert.deepEqual(result.weather.forecasts.map(({ city }) => city), ['Душанбе', 'Худжанд']);
});

test('NBT adapters keep news and rates as separate contracts', async () => {
  const news = parseNbtNewsHtml(await fixture('nbt-news.html'), source('nbt-news', 'https://nbt.tj/ru/news/'));
  const rates = parseNbtRatesHtml(await fixture('nbt-rates.html'), source('nbt-rates', 'https://nbt.tj/ru/kurs/kurs.php'));
  assert.equal(news.items[0].url, 'https://nbt.tj/ru/news/100/');
  assert.deepEqual(rates.rates.map(({ code, rateTjs }) => [code, rateTjs]), [['USD', 9.25], ['EUR', 10.7]]);
  assert.equal(rates.items.length, 0);
});

test('selector drift is reported as degraded contract error', () => {
  assert.throws(() => parseKchsHtml('<html></html>', source('kchs', 'https://www.kchs.tj/')), AdapterContractError);
  assert.throws(() => parseMeteoHtml('<html></html>', source('meteo', 'https://meteo.tj/ru')), AdapterContractError);
  assert.throws(() => parseNbtRatesHtml('<html></html>', source('nbt-rates', 'https://nbt.tj/ru/kurs/kurs.php')), AdapterContractError);
});

test('fetch helper retries transient failure and enforces response limit', async () => {
  let calls = 0;
  const body = await fetchTextWithRetry('https://official.test', { attempts: 2, fetchImpl: async () => {
    calls += 1;
    return calls === 1 ? { ok: false, status: 503 } : { ok: true, status: 200, headers: { get: () => null }, text: async () => 'ok' };
  } });
  assert.equal(body, 'ok');
  assert.equal(calls, 2);
  await assert.rejects(() => fetchTextWithRetry('https://official.test', { attempts: 1, maxBytes: 1, fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => 'too large' }) }), /exceeds/);
});
