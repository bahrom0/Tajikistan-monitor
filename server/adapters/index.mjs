import { fetchKchs } from './kchs.mjs';
import { fetchMeteo } from './meteo.mjs';
import { fetchNbtNews, fetchNbtRates } from './nbt.mjs';
import { fetchSource as fetchRss } from '../lib/rss.mjs';

const adapters = { rss: (source, options) => fetchRss(source, options), kchs: fetchKchs, meteo: fetchMeteo, 'nbt-news': fetchNbtNews, 'nbt-rates': fetchNbtRates };

export function fetchSourceAdapter(source, options) {
  const adapter = adapters[source.adapter];
  if (!adapter) throw new Error(`Unknown source adapter: ${source.adapter}`);
  return adapter(source, options);
}
